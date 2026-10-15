"""
test_tracker.py
Unit tests for the improved motion-predicted IoU-based tracker.
Tests:
1. compute_iou correctness.
2. Single person moving (track ID stability).
3. Two people moving simultaneously (distinct IDs preserved).
4. Crossing workers (two people crossing paths without ID swap).
5. Lenient IoU matching (0.2) when predicted position fits.
6. Person disappearing (track dropped after max_lost frames).
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from tracker import IoUTracker, compute_iou

def test_compute_iou():
    boxA = [100, 100, 200, 200] # area = 10000
    boxB = [100, 100, 200, 200]
    assert compute_iou(boxA, boxB) == 1.0, "Identical boxes should have IoU = 1.0"
    
    boxC = [300, 300, 400, 400]
    assert compute_iou(boxA, boxC) == 0.0, "Non-overlapping boxes should have IoU = 0.0"
    
    boxD = [150, 100, 250, 200] # inter = 50x100 = 5000, union = 10000 + 10000 - 5000 = 15000 => 0.333
    iou = compute_iou(boxA, boxD)
    assert abs(iou - (1.0 / 3.0)) < 1e-4, f"Expected 0.333, got {iou}"
    print("[PASS] compute_iou unit tests passed.")


def test_single_person_moving():
    tracker = IoUTracker(iou_threshold=0.3, lenient_iou_threshold=0.2, max_lost=5)
    
    # Frame 1: Person 1 at [100, 100, 200, 300]
    f1 = tracker.update([[100, 100, 200, 300]])
    assert len(f1) == 1
    assert f1[0]["track_id"] == 1
    
    # Frame 2: Person 1 moves slightly to [105, 102, 205, 302]
    f2 = tracker.update([[105, 102, 205, 302]])
    assert len(f2) == 1
    assert f2[0]["track_id"] == 1, f"Expected track_id 1, got {f2[0]['track_id']}"
    
    # Frame 3: Person 1 moves to [110, 105, 210, 305]
    f3 = tracker.update([[110, 105, 210, 305]])
    assert len(f3) == 1
    assert f3[0]["track_id"] == 1
    print("[PASS] test_single_person_moving passed: track_id 1 maintained across frames.")


def test_two_people_moving():
    tracker = IoUTracker(iou_threshold=0.3, lenient_iou_threshold=0.2, max_lost=5)
    
    # Frame 1: Worker A on left, Worker B on right
    f1 = tracker.update([[100, 100, 200, 300], [500, 100, 600, 300]])
    assert len(f1) == 2
    id_left = f1[0]["track_id"]
    id_right = f1[1]["track_id"]
    assert id_left != id_right
    
    # Frame 2: Both move slightly
    f2 = tracker.update([[104, 98, 204, 298], [506, 102, 606, 302]])
    assert len(f2) == 2
    assert f2[0]["track_id"] == id_left
    assert f2[1]["track_id"] == id_right
    print("[PASS] test_two_people_moving passed: independent track IDs preserved.")


def test_crossing_people_motion_prediction():
    tracker = IoUTracker(iou_threshold=0.3, lenient_iou_threshold=0.2, max_lost=5)
    
    # Track 1 starts at x=100 and moves right by +25 px per frame
    # Track 2 starts at x=500 and moves left by -25 px per frame
    # They cross near x=300 around frame 8-10.
    num_frames = 17
    track_positions = {1: [], 2: []}
    
    for f in range(num_frames):
        x_left = 100 + f * 25
        x_right = 500 - f * 25
        b_left = [x_left, 100, x_left + 80, 300]
        b_right = [x_right, 100, x_right + 80, 300]
        
        res = tracker.update([b_left, b_right])
        assert len(res) == 2, f"Frame {f}: expected 2 active tracks, got {len(res)}"
        for item in res:
            t_id = item["track_id"]
            track_positions[t_id].append((f, item["box"][0]))
            
    # Track 1 was initialized on left (x=100) -> should end on right (x=500)
    # Track 2 was initialized on right (x=500) -> should end on left (x=100)
    assert len(track_positions[1]) == num_frames, f"Track 1 lost frames: {len(track_positions[1])}"
    assert len(track_positions[2]) == num_frames, f"Track 2 lost frames: {len(track_positions[2])}"
    
    start_x1 = track_positions[1][0][1]
    end_x1 = track_positions[1][-1][1]
    start_x2 = track_positions[2][0][1]
    end_x2 = track_positions[2][-1][1]
    
    assert start_x1 == 100 and end_x1 == 500, f"Track 1 should move 100 -> 500, got {start_x1} -> {end_x1}"
    assert start_x2 == 500 and end_x2 == 100, f"Track 2 should move 500 -> 100, got {start_x2} -> {end_x2}"
    print("[PASS] test_crossing_people_motion_prediction passed: IDs stayed 100% stable during and after crossing!")


def test_lenient_iou_matching():
    # Test that a fast moving worker with IoU = 0.22 (below 0.3) matches correctly due to velocity prediction and lenient threshold
    tracker = IoUTracker(iou_threshold=0.3, lenient_iou_threshold=0.2, max_lost=5)
    
    # Frame 1: Box at [100, 100, 200, 300] (width 100, height 200)
    tracker.update([[100, 100, 200, 300]])
    
    # Frame 2: Box moves +40px to [140, 100, 240, 300] (IoU with prev is 60/140 = 0.428)
    tracker.update([[140, 100, 240, 300]])
    
    # Frame 3: Box moves another +45px to [185, 100, 285, 300]
    # Static IoU with frame 2 is (140+100 - 185) / (285 - 140) = 55 / 145 = 0.379
    # But if it moved +60px to [200, 100, 300, 300], static IoU = 40 / 160 = 0.25 (which is < 0.30!)
    # With velocity prediction (~40px), predicted box is [180, 100, 280, 300], IoU with [200, 100, 300, 300] is 80/120 = 0.66!
    f3 = tracker.update([[200, 100, 300, 300]])
    assert len(f3) == 1
    assert f3[0]["track_id"] == 1, f"Expected track_id 1 with lenient match, got {f3[0]['track_id']}"
    print("[PASS] test_lenient_iou_matching passed: fast mover maintained track ID.")


def test_person_disappearing_and_max_lost():
    tracker = IoUTracker(iou_threshold=0.3, lenient_iou_threshold=0.2, max_lost=5)
    
    # Frame 1: Person appears
    f1 = tracker.update([[100, 100, 200, 300]])
    assert len(f1) == 1
    assert f1[0]["track_id"] == 1
    
    # Frames 2 to 6: Person missing (lost_count 1 to 5)
    for frame_idx in range(2, 7):
        res = tracker.update([])
        assert len(res) == 0
        assert len(tracker.active_tracks) == 1, f"Track should remain active while lost_count <= 5 (frame {frame_idx})"
        assert tracker.active_tracks[0].lost_count == frame_idx - 1
        
    # Frame 7: 6th lost frame -> Track is dropped!
    res = tracker.update([])
    assert len(res) == 0
    assert len(tracker.active_tracks) == 0, "Track should be dropped after > 5 lost frames"
    print("[PASS] test_person_disappearing_and_max_lost passed: track dropped correctly after 5 lost frames.")


if __name__ == "__main__":
    print("=== RUNNING TRACKER UNIT TESTS ===")
    test_compute_iou()
    test_single_person_moving()
    test_two_people_moving()
    test_crossing_people_motion_prediction()
    test_lenient_iou_matching()
    test_person_disappearing_and_max_lost()
    print("ALL TRACKER UNIT TESTS PASSED!")
