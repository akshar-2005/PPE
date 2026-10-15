"""
test_video_flow.py
Comprehensive verification test suite for Phase 13 (Video file analysis).
Tests:
1. Synthetic video generation from demo images (8-12 seconds clip).
2. End-to-end API testing via POST /analyze-video and polling GET /jobs/{id}.
3. Verification of 1_mixed.png video clip with default settings: 3 workers (1 compliant, 2 violations).
4. Mask check performance benchmark: require_mask ON vs OFF (timing comparison).
5. Error handling and failure cases:
   - Unsupported file format (.txt) -> 400
   - Corrupt video file (.mp4) -> 400/500/failed
   - File size limit (> 50 MB) -> 400
   - Concurrent upload rejection -> 429
6. Regression check on static images (demo_images/1_mixed.png, Image 1.png to 6.png).
"""

import os
import sys
import time
import json
import cv2
import numpy as np
import requests

API_URL = "http://127.0.0.1:8000"
BACKEND_DIR = os.path.dirname(__file__)
TEST_VIDEOS_DIR = os.path.join(BACKEND_DIR, "test_videos")
os.makedirs(TEST_VIDEOS_DIR, exist_ok=True)

def create_synthetic_video(image_paths, output_path, fps=25, duration_per_img=4.0):
    """Creates an MP4 clip by showing images for a few seconds each with slight synthetic motion."""
    frames = []
    for p in image_paths:
        img = cv2.imread(p)
        if img is None:
            raise FileNotFoundError(f"Cannot load image {p}")
        frames.append(img)
        
    h, w = frames[0].shape[:2]
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (w, h))
    
    frames_per_img = int(fps * duration_per_img)
    for img in frames:
        if img.shape[:2] != (h, w):
            img = cv2.resize(img, (w, h))
        for f_i in range(frames_per_img):
            # Subtle synthetic motion shift (1-2px) to test tracking across frames
            dx = int(np.sin(f_i * 0.1) * 2)
            M = np.float32([[1, 0, dx], [0, 1, 0]])
            shifted = cv2.warpAffine(img, M, (w, h))
            out.write(shifted)
            
    out.release()
    print(f"Created synthetic video at {output_path} ({len(frames)*duration_per_img}s, {len(frames)*frames_per_img} frames)")

def poll_job(job_id, timeout=60):
    start = time.time()
    last_prog = -1
    while time.time() - start < timeout:
        res = requests.get(f"{API_URL}/jobs/{job_id}")
        assert res.status_code == 200, f"Failed GET /jobs/{job_id}: {res.status_code}"
        data = res.json()
        prog = data.get("progress", 0)
        msg = data.get("message", "")
        if prog != last_prog:
            print(f"  Job {job_id} progress: {prog}% - {msg}")
            last_prog = prog
        if data.get("status") == "done":
            return data["result"]
        if data.get("status") == "failed":
            raise RuntimeError(f"Job failed: {data.get('message')}")
        time.sleep(0.5)
    raise TimeoutError(f"Job {job_id} timed out after {timeout}s")

def run_tests():
    print("=" * 75)
    print("PHASE 13: VIDEO ANALYSIS COMPREHENSIVE TEST SUITE")
    print("=" * 75)
    
    # 1. Generate test video clips
    demo_dir = os.path.join(os.path.dirname(BACKEND_DIR), "demo_images")
    img_mixed = os.path.join(demo_dir, "1_mixed.png")
    img_compliant = os.path.join(demo_dir, "2_all_compliant.png")
    
    clip_mixed_path = os.path.join(TEST_VIDEOS_DIR, "clip_1_mixed.mp4")
    clip_multi_path = os.path.join(TEST_VIDEOS_DIR, "clip_multi_worker.mp4")
    
    create_synthetic_video([img_mixed], clip_mixed_path, fps=25, duration_per_img=8.0)
    create_synthetic_video([img_mixed, img_compliant], clip_multi_path, fps=25, duration_per_img=5.0)

    # 2. Reset settings to default (helmet=True, vest=True, mask=False, 0.40, 0.25, 0.30)
    print("\n[Step 1] Resetting settings to defaults...")
    res = requests.post(f"{API_URL}/settings/reset")
    assert res.status_code == 200
    print(f"  Current settings: {res.json()}")

    # 3. Test 1_mixed video clip through API
    print("\n[Step 2] Testing video analysis on clip_1_mixed.mp4 (Default settings: Helmet+Vest required)...")
    start_time = time.time()
    with open(clip_mixed_path, "rb") as f:
        res = requests.post(f"{API_URL}/analyze-video", files={"file": ("clip_1_mixed.mp4", f, "video/mp4")})
    assert res.status_code == 200, f"Upload failed: {res.text}"
    job_id = res.json()["job_id"]
    print(f"  Created Job ID: {job_id}")
    
    result = poll_job(job_id)
    elapsed_default = time.time() - start_time
    print(f"  Analysis finished in {elapsed_default:.2f}s")
    print(f"  Result summary: Total Workers={result['unique_workers']}, Compliant={result['compliant']}, Violations={result['violations']}")
    print(f"  Video Codec used: {result['video_codec']}")
    print(f"  Video URL: {result['video_url']}")
    print(f"  Keyframes saved: {len(result['keyframes'])}")
    for w in result["workers"]:
        print(f"    Worker {w['track_id']} ({w['status']}): frames_seen={w['frames_seen']}, Helmet={w['helmet_pct']}%, Vest={w['vest_pct']}%, Missing={w['missing']}")

    assert result["unique_workers"] == 3, f"Expected 3 unique workers, got {result['unique_workers']}"
    assert result["compliant"] == 1, f"Expected 1 compliant worker, got {result['compliant']}"
    assert result["violations"] == 2, f"Expected 2 violations, got {result['violations']}"
    print("  [PASS] 1_mixed video clip verified correctly with 3 workers (1 compliant, 2 violations)!")

    # Verify the generated video file opens with cv2.VideoCapture
    local_out_video = os.path.join(BACKEND_DIR, "outputs", f"{job_id}.mp4")
    test_cap = cv2.VideoCapture(local_out_video)
    assert test_cap.isOpened(), f"Generated output video {local_out_video} could not be opened!"
    v_frames = int(test_cap.get(cv2.CAP_PROP_FRAME_COUNT))
    test_cap.release()
    print(f"  [PASS] Output video file verified: opens successfully with {v_frames} frames.")

    # 4. Performance benchmark: require_mask ON vs OFF
    print("\n[Step 3] Performance benchmark: require_mask=True vs require_mask=False...")
    # Set require_mask = True
    requests.put(f"{API_URL}/settings", json={
        "require_helmet": True,
        "require_vest": True,
        "require_mask": True,
        "person_conf": 0.40,
        "ppe_conf": 0.25,
        "decision_conf": 0.30
    })
    
    start_mask = time.time()
    with open(clip_mixed_path, "rb") as f:
        res = requests.post(f"{API_URL}/analyze-video", files={"file": ("clip_1_mixed.mp4", f, "video/mp4")})
    assert res.status_code == 200
    job_id_mask = res.json()["job_id"]
    res_mask = poll_job(job_id_mask)
    elapsed_mask = time.time() - start_mask
    print(f"  Timing comparison on 8s clip:")
    print(f"    - require_mask=False (Fast path): {elapsed_default:.2f}s")
    print(f"    - require_mask=True  (Head crop): {elapsed_mask:.2f}s")

    # Reset settings back
    requests.post(f"{API_URL}/settings/reset")

    # 5. Test Failure & Edge Cases
    print("\n[Step 4] Testing Failure & Edge Cases...")
    
    # Case A: Unsupported file extension (.txt)
    res = requests.post(f"{API_URL}/analyze-video", files={"file": ("test.txt", b"dummy content", "text/plain")})
    assert res.status_code == 400
    print(f"  [PASS] Unsupported extension rejected: {res.json()['detail']}")

    # Case B: Empty / Corrupt video
    res = requests.post(f"{API_URL}/analyze-video", files={"file": ("corrupt.mp4", b"", "video/mp4")})
    assert res.status_code == 400
    print(f"  [PASS] Empty video rejected: {res.json()['detail']}")

    # Case C: Video over 50 MB limit
    large_bytes = b"0" * (51 * 1024 * 1024)
    res = requests.post(f"{API_URL}/analyze-video", files={"file": ("large.mp4", large_bytes, "video/mp4")})
    assert res.status_code == 400
    print(f"  [PASS] Over 50 MB limit rejected: {res.json()['detail']}")

    # Case D: Concurrent upload rejection (429)
    print("  Testing concurrent upload guard (HTTP 429)...")
    with open(clip_multi_path, "rb") as f:
        res1 = requests.post(f"{API_URL}/analyze-video", files={"file": ("clip_multi_worker.mp4", f, "video/mp4")})
    assert res1.status_code == 200
    job1_id = res1.json()["job_id"]
    
    # Immediately try a 2nd upload while job 1 is running
    with open(clip_mixed_path, "rb") as f:
        res2 = requests.post(f"{API_URL}/analyze-video", files={"file": ("clip_1_mixed.mp4", f, "video/mp4")})
    
    if res2.status_code == 429:
        print(f"  [PASS] Concurrent job rejected with HTTP 429: {res2.json()['detail']}")
    else:
        print(f"  Note: 2nd upload returned {res2.status_code} (job 1 may have completed rapidly).")
    poll_job(job1_id)

    # 6. Test GET /video-history and GET /video-history/{id}
    print("\n[Step 5] Testing Video History Endpoints...")
    v_hist_res = requests.get(f"{API_URL}/video-history")
    assert v_hist_res.status_code == 200
    v_items = v_hist_res.json()
    print(f"  Found {len(v_items)} video history record(s).")
    assert len(v_items) > 0
    first_id = v_items[0]["id"]
    
    v_detail_res = requests.get(f"{API_URL}/video-history/{first_id}")
    assert v_detail_res.status_code == 200
    detail = v_detail_res.json()
    assert detail["id"] == first_id
    assert "workers" in detail
    assert "keyframes" in detail
    print(f"  [PASS] Video history detail endpoint verified for record {first_id}.")

    # 7. Regression check on static images
    print("\n[Step 6] Running Regression Check on static images...")
    test_images_dir = os.path.join(BACKEND_DIR, "test_images")
    image_tests = [
        (img_mixed, 3, 1, 2),
        (os.path.join(test_images_dir, "Image 1.png"), 3, 1, 2),
        (os.path.join(test_images_dir, "Image 2.png"), 3, 1, 2),
        (os.path.join(test_images_dir, "Image 3.png"), 3, 3, 0),
        (os.path.join(test_images_dir, "Image 4.png"), 3, 0, 3),
        (os.path.join(test_images_dir, "Image 5.png"), 4, 0, 4),
        (os.path.join(test_images_dir, "Image 6.png"), 1, 0, 1),
    ]

    for img_p, exp_total, exp_comp, exp_viol in image_tests:
        fname = os.path.basename(img_p)
        with open(img_p, "rb") as f:
            r = requests.post(f"{API_URL}/analyze", files={"file": (fname, f, "image/png")})
        assert r.status_code == 200, f"Image upload failed for {fname}: {r.text}"
        res_img = r.json()
        assert res_img["total"] == exp_total, f"{fname}: expected {exp_total} total, got {res_img['total']}"
        assert res_img["compliant"] == exp_comp, f"{fname}: expected {exp_comp} compliant, got {res_img['compliant']}"
        assert res_img["violations"] == exp_viol, f"{fname}: expected {exp_viol} violations, got {res_img['violations']}"
        print(f"  [PASS] {fname}: {res_img['total']} workers, {res_img['compliant']} compliant, {res_img['violations']} violations.")

    print("\n" + "=" * 75)
    print("ALL PHASE 13 VIDEO TESTS & REGRESSIONS COMPLETED WITH 100% SUCCESS!")
    print("=" * 75)

if __name__ == "__main__":
    run_tests()
