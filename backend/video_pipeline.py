"""
video_pipeline.py
Video file analysis pipeline for PPE Vision.
- Samples frames at 4 fps (up to 60 sampled frames / 15 seconds max).
- Tracks workers across frames using motion-predicted IoUTracker.
- Runs PPE detection (mask model runs ONLY when require_mask is True).
- Aggregates per track over time (compliant if all required items >= 60%).
- Renders annotated video with avc1 / mp4v fallback and extracts key frames.
"""

import os
import cv2
import numpy as np
from typing import Dict, Any, Callable, Optional, List

from pipeline import (
    detect_workers,
    check_ppe,
    evaluate,
    draw_worker_label,
    resize_if_large,
    DEFAULT_SETTINGS,
    DEFAULT_PERSON_CONF,
    DEFAULT_PPE_CONF,
    DEFAULT_DECISION_CONF
)
from tracker import IoUTracker


def analyze_video(
    video_path: str,
    output_video_path: str,
    output_dir: str,
    video_id: str,
    settings: Optional[Dict[str, Any]] = None,
    progress_callback: Optional[Callable[[int, str], None]] = None
) -> Dict[str, Any]:
    if settings is None:
        settings = DEFAULT_SETTINGS

    require_helmet = bool(settings.get("require_helmet", True))
    require_vest = bool(settings.get("require_vest", True))
    require_mask = bool(settings.get("require_mask", False))
    person_conf = float(settings.get("person_conf", DEFAULT_PERSON_CONF))
    ppe_conf = float(settings.get("ppe_conf", DEFAULT_PPE_CONF))
    decision_conf = float(settings.get("decision_conf", DEFAULT_DECISION_CONF))

    if progress_callback:
        progress_callback(5, "Opening video file...")

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Could not open or read video file: {os.path.basename(video_path)}")

    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0 or np.isnan(fps):
        fps = 25.0
    total_video_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if total_video_frames <= 0:
        # Fallback: probe frames if count is missing
        total_video_frames = 300

    orig_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    orig_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    if orig_w <= 0 or orig_h <= 0:
        ret, probe_frame = cap.read()
        if not ret or probe_frame is None:
            cap.release()
            raise ValueError("Video contains no valid readable frames.")
        orig_h, orig_w = probe_frame.shape[:2]
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)

    # 4 sampled frames per second (up to 60 sampled frames / 15 seconds)
    frame_step = max(1, int(round(fps / 4.0)))
    max_sampled_frames = 60

    # Read first frame to check dimensions after potential downscale
    ret, first_frame = cap.read()
    if not ret or first_frame is None:
        cap.release()
        raise ValueError("Video contains no readable frames.")
    first_frame = resize_if_large(first_frame)
    out_h, out_w = first_frame.shape[:2]
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)

    # Output video writer with avc1 / mp4v fallback
    os.makedirs(os.path.dirname(output_video_path), exist_ok=True)
    video_codec = "avc1"
    fourcc = cv2.VideoWriter_fourcc(*'avc1')
    writer = cv2.VideoWriter(output_video_path, fourcc, fps, (out_w, out_h))
    
    if not writer.isOpened():
        video_codec = "mp4v"
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        writer = cv2.VideoWriter(output_video_path, fourcc, fps, (out_w, out_h))
        if not writer.isOpened():
            cap.release()
            raise RuntimeError("Failed to initialize video writer with avc1 and mp4v codecs.")

    tracker = IoUTracker(iou_threshold=0.3, lenient_iou_threshold=0.2, max_lost=5)
    
    track_stats: Dict[int, Dict[str, Any]] = {}
    sampled_frame_records: List[Dict[str, Any]] = []
    
    current_workers_to_draw: List[Dict[str, Any]] = []
    
    sampled_count = 0
    frame_idx = 0
    truncated = False
    
    if progress_callback:
        progress_callback(10, "Processing video frames...")

    font = cv2.FONT_HERSHEY_SIMPLEX
    thickness = max(2, int(min(out_h, out_w) / 400))
    banner_font_scale = max(0.45, min(out_h, out_w) / 1000.0)

    while True:
        ret, frame = cap.read()
        if not ret or frame is None:
            break

        if sampled_count >= max_sampled_frames and (frame_idx % frame_step == 0):
            truncated = True
            break

        frame = resize_if_large(frame)
        if frame.shape[:2] != (out_h, out_w):
            frame = cv2.resize(frame, (out_w, out_h))

        is_sampled = (frame_idx % frame_step == 0)

        if is_sampled:
            sampled_count += 1
            boxes = detect_workers(frame, person_conf=person_conf)
            tracked_workers = tracker.update(boxes)

            active_workers_this_frame = []
            frame_violations = 0
            frame_safe = 0

            for tw in tracked_workers:
                t_id = tw["track_id"]
                box = tw["box"]
                
                # Check PPE (skip mask model if not require_mask to keep fast)
                ppe_info = check_ppe(
                    frame,
                    box,
                    ppe_conf=ppe_conf,
                    decision_conf=decision_conf,
                    check_mask=require_mask
                )
                
                status, missing = evaluate(
                    helmet=ppe_info["helmet"],
                    vest=ppe_info["vest"],
                    mask=ppe_info["mask"],
                    require_helmet=require_helmet,
                    require_vest=require_vest,
                    require_mask=require_mask
                )

                if status == "COMPLIANT":
                    frame_safe += 1
                else:
                    frame_violations += 1

                if t_id not in track_stats:
                    track_stats[t_id] = {
                        "frames_seen": 0,
                        "helmet_count": 0,
                        "vest_count": 0,
                        "mask_count": 0,
                        "last_box": list(box),
                        "last_status": status,
                        "last_missing": missing,
                        "last_helmet": ppe_info["helmet"],
                        "last_vest": ppe_info["vest"],
                        "last_mask": ppe_info["mask"],
                        "last_helmet_conf": ppe_info["helmet_conf"],
                        "last_vest_conf": ppe_info["vest_conf"],
                        "last_mask_conf": ppe_info["mask_conf"]
                    }

                st = track_stats[t_id]
                st["frames_seen"] += 1
                if ppe_info["helmet"]:
                    st["helmet_count"] += 1
                if ppe_info["vest"]:
                    st["vest_count"] += 1
                if ppe_info["mask"]:
                    st["mask_count"] += 1
                st["last_box"] = list(box)
                st["last_status"] = status
                st["last_missing"] = missing
                st["last_helmet"] = ppe_info["helmet"]
                st["last_vest"] = ppe_info["vest"]
                st["last_mask"] = ppe_info["mask"]
                st["last_helmet_conf"] = ppe_info["helmet_conf"]
                st["last_vest_conf"] = ppe_info["vest_conf"]
                st["last_mask_conf"] = ppe_info["mask_conf"]

                lines = [
                    f"Worker {t_id}",
                    status
                ]
                if require_helmet or ppe_info["helmet"]:
                    lines.append(f"Helmet OK ({ppe_info['helmet_conf']:.2f})" if ppe_info["helmet"] else "No Helmet")
                if require_vest or ppe_info["vest"]:
                    lines.append(f"Vest OK ({ppe_info['vest_conf']:.2f})" if ppe_info["vest"] else "No Vest")
                if require_mask or ppe_info["mask"]:
                    lines.append(f"Mask OK ({ppe_info['mask_conf']:.2f})" if ppe_info["mask"] else "No Mask")

                color = (0, 200, 0) if status == "COMPLIANT" else (0, 0, 220)
                active_workers_this_frame.append({
                    "id": t_id,
                    "box": list(box),
                    "lines": lines,
                    "color": color,
                    "status": status
                })

            current_workers_to_draw = active_workers_this_frame

        # Render annotations on current frame
        annotated_frame = frame.copy()

        # 1. Top-left summary banner
        total_active = len(current_workers_to_draw)
        safe_active = sum(1 for w in current_workers_to_draw if w["status"] == "COMPLIANT")
        viol_active = total_active - safe_active
        banner_text = f"Workers: {total_active} | Safe: {safe_active} | Violations: {viol_active}"
        (tw, th), baseline = cv2.getTextSize(banner_text, font, banner_font_scale, thickness)
        banner_bg_color = (30, 30, 30)
        cv2.rectangle(annotated_frame, (10, 10), (20 + tw, 20 + th + baseline), banner_bg_color, -1)
        cv2.putText(annotated_frame, banner_text, (15, 15 + th), font, banner_font_scale, (255, 255, 255), thickness, cv2.LINE_AA)

        # 2. Draw worker boxes and labels with shared draw_worker_label
        for worker in current_workers_to_draw:
            draw_worker_label(
                annotated_frame,
                worker["box"],
                worker["lines"],
                worker["color"],
                thickness=thickness
            )

        writer.write(annotated_frame)

        if is_sampled:
            sampled_frame_records.append({
                "frame_idx": frame_idx,
                "violations": viol_active,
                "safe": safe_active,
                "total": total_active,
                "annotated_frame": annotated_frame
            })

        frame_idx += 1
        if progress_callback and (frame_idx % 5 == 0 or is_sampled):
            # Estimate percentage 10% to 85%
            max_est = min(total_video_frames, max_sampled_frames * frame_step)
            pct = int(10 + (frame_idx / max(1, max_est)) * 75)
            progress_callback(min(85, pct), f"Analyzing frame {frame_idx} (sampled {sampled_count}/{max_sampled_frames})...")

    cap.release()
    writer.release()

    if progress_callback:
        progress_callback(90, "Aggregating tracked workers and extracting key frames...")

    duration_seconds = round(frame_idx / fps, 2)

    # Filter tracks seen in at least 2 sampled frames
    valid_workers = []
    compliant_count = 0
    violation_count = 0

    for t_id in sorted(track_stats.keys()):
        st = track_stats[t_id]
        seen = st["frames_seen"]
        if seen < 2:
            continue

        h_pct = round((st["helmet_count"] / seen) * 100.0, 1)
        v_pct = round((st["vest_count"] / seen) * 100.0, 1)
        m_pct = round((st["mask_count"] / seen) * 100.0, 1) if require_mask else 0.0

        missing = []
        if require_helmet and h_pct < 60.0:
            missing.append("Helmet")
        if require_vest and v_pct < 60.0:
            missing.append("Vest")
        if require_mask and m_pct < 60.0:
            missing.append("Mask")

        final_status = "COMPLIANT" if len(missing) == 0 else "NON-COMPLIANT"
        if final_status == "COMPLIANT":
            compliant_count += 1
        else:
            violation_count += 1

        valid_workers.append({
            "track_id": t_id,
            "frames_seen": seen,
            "helmet_pct": h_pct,
            "vest_pct": v_pct,
            "mask_pct": m_pct,
            "status": final_status,
            "missing": missing
        })

    # Save up to 8 key frames (prioritize frames with violations, then highest worker count)
    keyframe_filenames = []
    if sampled_frame_records:
        # Sort by violations DESC, then total workers DESC
        sorted_records = sorted(
            sampled_frame_records,
            key=lambda r: (r["violations"], r["total"]),
            reverse=True
        )
        selected_records = sorted_records[:8]
        # Re-sort selected by chronological order for presentation
        selected_records.sort(key=lambda r: r["frame_idx"])

        for k_idx, rec in enumerate(selected_records, start=1):
            kf_name = f"{video_id}_keyframe_{k_idx}.jpg"
            kf_path = os.path.join(output_dir, kf_name)
            cv2.imwrite(kf_path, rec["annotated_frame"])
            keyframe_filenames.append(kf_name)

    if progress_callback:
        progress_callback(100, "Video analysis complete!")

    return {
        "id": video_id,
        "duration_seconds": duration_seconds,
        "frames_analyzed": sampled_count,
        "total_video_frames": frame_idx,
        "truncated": truncated,
        "unique_workers": len(valid_workers),
        "compliant": compliant_count,
        "violations": violation_count,
        "workers": valid_workers,
        "video_codec": video_codec,
        "keyframe_filenames": keyframe_filenames,
        "settings": {
            "require_helmet": require_helmet,
            "require_vest": require_vest,
            "require_mask": require_mask,
            "person_conf": person_conf,
            "ppe_conf": ppe_conf,
            "decision_conf": decision_conf
        }
    }
