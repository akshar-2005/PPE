"""
tracker.py
Multi-object tracker in plain Python.
Uses constant-velocity motion prediction, IoU, and normalized center distance matching.
- Predicts next box position using last movement velocity.
- Matches candidate tracks using IoU combined with box center distance (normalized by box height).
- Uses lenient matching (IoU >= 0.2) when predicted position fits (normalized center distance <= 0.6).
- Advances unobserved tracks using constant velocity and drops tracks unseen for more than 5 frames.
"""

import math
from typing import List, Dict, Any, Tuple


def compute_iou(boxA: List[int], boxB: List[int]) -> float:
    """Computes Intersection over Union (IoU) between two bounding boxes [x1, y1, x2, y2]."""
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])

    inter_w = max(0, xB - xA)
    inter_h = max(0, yB - yA)
    inter_area = inter_w * inter_h

    areaA = max(0, boxA[2] - boxA[0]) * max(0, boxA[3] - boxA[1])
    areaB = max(0, boxB[2] - boxB[0]) * max(0, boxB[3] - boxB[1])

    union_area = areaA + areaB - inter_area
    if union_area <= 0:
        return 0.0
    return inter_area / float(union_area)


class Track:
    def __init__(self, track_id: int, box: List[int]):
        self.track_id = track_id
        self.box = [int(v) for v in box]
        self.vx: float = 0.0
        self.vy: float = 0.0
        self.lost_count: int = 0
        self.hits: int = 1

    def predict_box(self) -> List[float]:
        """Predicts the next box position based on constant velocity."""
        w = float(self.box[2] - self.box[0])
        h = float(self.box[3] - self.box[1])
        cx = (self.box[0] + self.box[2]) / 2.0
        cy = (self.box[1] + self.box[3]) / 2.0
        pred_cx = cx + self.vx
        pred_cy = cy + self.vy
        return [
            pred_cx - w / 2.0,
            pred_cy - h / 2.0,
            pred_cx + w / 2.0,
            pred_cy + h / 2.0
        ]

    def update(self, new_box: List[int]):
        """Updates track box and estimates velocity from the last movement."""
        prev_cx = (self.box[0] + self.box[2]) / 2.0
        prev_cy = (self.box[1] + self.box[3]) / 2.0
        new_cx = (new_box[0] + new_box[2]) / 2.0
        new_cy = (new_box[1] + new_box[3]) / 2.0

        dx = new_cx - prev_cx
        dy = new_cy - prev_cy

        if self.hits == 1:
            self.vx = dx
            self.vy = dy
        else:
            # Smooth velocity update to adapt to gradual motion changes
            self.vx = 0.6 * self.vx + 0.4 * dx
            self.vy = 0.6 * self.vy + 0.4 * dy

        self.box = [int(v) for v in new_box]
        self.lost_count = 0
        self.hits += 1

    def advance_lost(self):
        """Advances track state during unobserved frames using constant velocity."""
        self.lost_count += 1
        self.box[0] = int(round(self.box[0] + self.vx))
        self.box[1] = int(round(self.box[1] + self.vy))
        self.box[2] = int(round(self.box[2] + self.vx))
        self.box[3] = int(round(self.box[3] + self.vy))
        # Slight velocity decay during prolonged occlusion
        self.vx *= 0.95
        self.vy *= 0.95


class IoUTracker:
    def __init__(
        self,
        iou_threshold: float = 0.3,
        lenient_iou_threshold: float = 0.2,
        max_lost: int = 5
    ):
        self.iou_threshold = iou_threshold
        self.lenient_iou_threshold = lenient_iou_threshold
        self.max_lost = max_lost
        self.next_id = 1
        self.active_tracks: List[Track] = []

    def reset(self):
        self.next_id = 1
        self.active_tracks = []

    def update(self, boxes: List[List[int]]) -> List[Dict[str, Any]]:
        """
        Updates the tracker with new detection boxes for a frame.
        Returns a list of tracked objects for the current frame:
        [{"track_id": int, "box": [x1, y1, x2, y2]}, ...]
        """
        if not self.active_tracks:
            current_results = []
            for b in boxes:
                t = Track(self.next_id, b)
                self.next_id += 1
                self.active_tracks.append(t)
                current_results.append({"track_id": t.track_id, "box": list(t.box)})
            current_results.sort(key=lambda r: r["box"][0])
            return current_results

        # Candidate pairs matching
        candidates = []
        for t_idx, track in enumerate(self.active_tracks):
            pred_box = track.predict_box()
            pred_cx = (pred_box[0] + pred_box[2]) / 2.0
            pred_cy = (pred_box[1] + pred_box[3]) / 2.0
            track_h = max(1.0, float(track.box[3] - track.box[1]))

            for d_idx, det_box in enumerate(boxes):
                det_cx = (det_box[0] + det_box[2]) / 2.0
                det_cy = (det_box[1] + det_box[3]) / 2.0
                det_h = max(1.0, float(det_box[3] - det_box[1]))
                ref_h = (track_h + det_h) / 2.0

                # Distance between centers normalized by box height
                center_dist = math.hypot(pred_cx - det_cx, pred_cy - det_cy)
                norm_center_dist = center_dist / ref_h

                # Compute IoU against predicted box and current box
                iou_pred = compute_iou(pred_box, det_box)
                iou_curr = compute_iou(track.box, det_box)
                iou = max(iou_pred, iou_curr)

                # Match qualification:
                # 1. Standard IoU >= iou_threshold (0.3)
                # 2. Lenient threshold: IoU >= lenient_iou_threshold (0.2) when predicted position fits (norm_center_dist <= 0.6)
                is_valid_match = (
                    iou >= self.iou_threshold or
                    (iou >= self.lenient_iou_threshold and norm_center_dist <= 0.6)
                )

                if is_valid_match:
                    # Combined matching score prioritizing higher IoU and center proximity
                    score = iou - 0.4 * norm_center_dist
                    candidates.append((score, t_idx, d_idx))

        # Greedy match: highest combined score first
        candidates.sort(key=lambda x: x[0], reverse=True)

        matched_tracks = set()
        matched_dets = set()
        matches = {}

        for score, t_idx, d_idx in candidates:
            if t_idx not in matched_tracks and d_idx not in matched_dets:
                matched_tracks.add(t_idx)
                matched_dets.add(d_idx)
                matches[t_idx] = d_idx

        current_results = []
        # Update matched tracks
        for t_idx, track in enumerate(self.active_tracks):
            if t_idx in matches:
                d_idx = matches[t_idx]
                track.update(boxes[d_idx])
                current_results.append({"track_id": track.track_id, "box": list(track.box)})
            else:
                track.advance_lost()

        # Create new tracks for unmatched detections
        for d_idx, det_box in enumerate(boxes):
            if d_idx not in matched_dets:
                new_track = Track(self.next_id, det_box)
                self.next_id += 1
                self.active_tracks.append(new_track)
                current_results.append({"track_id": new_track.track_id, "box": list(new_track.box)})

        # Drop tracks lost for more than max_lost frames
        self.active_tracks = [t for t in self.active_tracks if t.lost_count <= self.max_lost]

        # Sort left-to-right by x1
        current_results.sort(key=lambda r: r["box"][0])
        return current_results
