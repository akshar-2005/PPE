import os
import sys
import time
import requests
import cv2
from auth import init_auth_db, create_user, get_user_by_username

BASE_URL = "http://localhost:8000"

def get_session():
    init_auth_db()
    username = "live_test_admin"
    password = "AdminPassword123!"
    if not get_user_by_username(username):
        create_user(username, password, role="admin")
    s = requests.Session()
    r = s.post(f"{BASE_URL}/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return s

def run_tests():
    print("=" * 60)
    print("PHASE 14 BACKEND LIVE MONITORING & ALERTS TEST SUITE")
    print("=" * 60)

    session = get_session()

    # Clean existing alerts before starting test suite
    res_clear = session.post(f"{BASE_URL}/alerts/clear")
    assert res_clear.status_code == 200, f"clear failed: {res_clear.text}"

    # Reset settings to default before tests
    res_reset = session.post(f"{BASE_URL}/settings/reset")
    assert res_reset.status_code == 200, f"reset failed: {res_reset.text}"

    img_1_mixed_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "demo_images", "1_mixed.png"))
    img_2_compliant_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "demo_images", "2_all_compliant.png"))

    assert os.path.exists(img_1_mixed_path), f"File not found: {img_1_mixed_path}"
    assert os.path.exists(img_2_compliant_path), f"File not found: {img_2_compliant_path}"

    with open(img_1_mixed_path, "rb") as f:
        img_1_mixed_bytes = f.read()

    with open(img_2_compliant_path, "rb") as f:
        img_2_compliant_bytes = f.read()

    # -------------------------------------------------------------
    # (a) Post demo_images/1_mixed.png as frames in a loop, 6 consecutive frames with one session
    # -------------------------------------------------------------
    print("\n--- TEST (a): 6 consecutive frames of 1_mixed.png ---")
    res_start = session.post(f"{BASE_URL}/live/start")
    assert res_start.status_code == 200, f"live/start failed: {res_start.text}"
    session_id_a = res_start.json()["session_id"]
    print(f"Started session A: {session_id_a}")

    alerts_by_frame = []
    frame_ms_list = []

    for f_idx in range(1, 7):
        files = {"file": ("frame.jpg", img_1_mixed_bytes, "image/jpeg")}
        data = {"session_id": session_id_a}
        t0 = time.time()
        res_frame = session.post(f"{BASE_URL}/live/frame", data=data, files=files)
        elapsed_client_ms = (time.time() - t0) * 1000.0
        assert res_frame.status_code == 200, f"live/frame failed at frame {f_idx}: {res_frame.text}"
        payload = res_frame.json()

        processing_ms = payload["processing_ms"]
        frame_ms_list.append(processing_ms)
        new_alerts = payload["new_alerts"]
        alerts_by_frame.append((f_idx, new_alerts))

        print(f"  Frame {f_idx}: total={payload['total']} compliant={payload['compliant']} "
              f"violations={payload['violations']} new_alerts={len(new_alerts)} (proc: {processing_ms} ms)")

    # Assertions for (a):
    assert len(alerts_by_frame[0][1]) == 0, "Frame 1 must have 0 alerts (history 1/5)"
    assert len(alerts_by_frame[1][1]) == 0, "Frame 2 must have 0 alerts (history 2/5)"
    assert len(alerts_by_frame[2][1]) == 2, f"Frame 3 must have exactly 2 alerts, got {len(alerts_by_frame[2][1])}"
    
    # Check alert details in frame 3
    f3_alerts = alerts_by_frame[2][1]
    f3_workers_alerted = {a["track_id"]: a for a in f3_alerts}
    assert 2 in f3_workers_alerted, "Worker 2 must have an alert"
    assert 3 in f3_workers_alerted, "Worker 3 must have an alert"
    assert 1 not in f3_workers_alerted, "Worker 1 is compliant and must NOT have an alert"
    assert "Helmet" in f3_workers_alerted[2]["message"], f"Worker 2 alert should mention Helmet: {f3_workers_alerted[2]['message']}"
    assert "Vest" in f3_workers_alerted[3]["message"], f"Worker 3 alert should mention Vest: {f3_workers_alerted[3]['message']}"

    assert len(alerts_by_frame[3][1]) == 0, "Frame 4 must have 0 alerts (cooldown active)"
    assert len(alerts_by_frame[4][1]) == 0, "Frame 5 must have 0 alerts (cooldown active)"
    assert len(alerts_by_frame[5][1]) == 0, "Frame 6 must have 0 alerts (cooldown active)"
    print("[PASS] Test (a) confirmed: Alerts raised ONLY after 3rd non-compliant frame for Worker 2 and 3, none for Worker 1, and no repeats.")

    session.post(f"{BASE_URL}/live/stop", data={"session_id": session_id_a})

    # -------------------------------------------------------------
    # (b) Post demo_images/2_all_compliant.png frames: no alerts
    # -------------------------------------------------------------
    print("\n--- TEST (b): 6 consecutive frames of 2_all_compliant.png ---")
    res_start_b = session.post(f"{BASE_URL}/live/start")
    session_id_b = res_start_b.json()["session_id"]
    for f_idx in range(1, 7):
        files = {"file": ("frame.jpg", img_2_compliant_bytes, "image/jpeg")}
        data = {"session_id": session_id_b}
        res_frame = session.post(f"{BASE_URL}/live/frame", data=data, files=files)
        assert res_frame.status_code == 200
        payload = res_frame.json()
        assert len(payload["new_alerts"]) == 0, f"Expected 0 alerts in compliant frame {f_idx}, got {len(payload['new_alerts'])}"
    print("[PASS] Test (b) confirmed: 0 alerts on all-compliant frames.")
    session.post(f"{BASE_URL}/live/stop", data={"session_id": session_id_b})

    # -------------------------------------------------------------
    # (c) Post a corrupt file: 400
    # -------------------------------------------------------------
    print("\n--- TEST (c): Corrupt file returns 400 ---")
    res_start_c = session.post(f"{BASE_URL}/live/start")
    session_id_c = res_start_c.json()["session_id"]
    corrupt_bytes = b"not_a_valid_jpeg_or_png_file_content_12345"
    files = {"file": ("corrupt.jpg", corrupt_bytes, "image/jpeg")}
    data = {"session_id": session_id_c}
    res_corrupt = session.post(f"{BASE_URL}/live/frame", data=data, files=files)
    assert res_corrupt.status_code == 400, f"Expected 400 for corrupt image, got {res_corrupt.status_code}: {res_corrupt.text}"
    print(f"[PASS] Test (c) confirmed: Corrupt file returned status code {res_corrupt.status_code}.")
    session.post(f"{BASE_URL}/live/stop", data={"session_id": session_id_c})

    # -------------------------------------------------------------
    # (d) Cooldown: keep posting same frames for 40 seconds
    # -------------------------------------------------------------
    print("\n--- TEST (d): Cooldown test over 40 seconds ---")
    res_start_d = session.post(f"{BASE_URL}/live/start")
    session_id_d = res_start_d.json()["session_id"]

    start_d_time = time.time()
    alert_timestamps = []
    frame_count_d = 0

    print("Posting frames across 40 seconds...")
    while (time.time() - start_d_time < 45.0) and len(alert_timestamps) < 2:
        files = {"file": ("frame.jpg", img_1_mixed_bytes, "image/jpeg")}
        data = {"session_id": session_id_d}
        t_frame = time.time() - start_d_time
        res_frame = session.post(f"{BASE_URL}/live/frame", data=data, files=files)
        assert res_frame.status_code == 200
        payload = res_frame.json()
        if payload["new_alerts"]:
            alert_timestamps.append((t_frame, [a["track_id"] for a in payload["new_alerts"]]))
            print(f"  Alert fired at t={t_frame:.2f}s for tracks: {[a['track_id'] for a in payload['new_alerts']]}")
        frame_count_d += 1
        time.sleep(0.3)

    print(f"Sent {frame_count_d} frames. Alert timestamps recorded: {[(round(t, 2), tr) for t, tr in alert_timestamps]}")
    assert len(alert_timestamps) >= 2, f"Expected at least 2 alert events across cooldown test, got {len(alert_timestamps)}"
    first_alert_time = alert_timestamps[0][0]
    second_alert_time = alert_timestamps[1][0]
    cooldown_gap = second_alert_time - first_alert_time
    print(f"Observed cooldown gap: {cooldown_gap:.2f} seconds")
    assert cooldown_gap >= 29.0, f"Alert repeated too early! Gap: {cooldown_gap}s < 29.0s"
    print("[PASS] Test (d) confirmed: Alerts do not repeat inside the 30-second cooldown period.")
    session.post(f"{BASE_URL}/live/stop", data={"session_id": session_id_d})

    # -------------------------------------------------------------
    # Processing time with require_mask off and on
    # -------------------------------------------------------------
    print("\n--- MEASURING PROCESSING TIME (require_mask OFF vs ON) ---")
    # Mask OFF
    session.put(f"{BASE_URL}/settings", json={
        "require_helmet": True,
        "require_vest": True,
        "require_mask": False,
        "person_conf": 0.40,
        "ppe_conf": 0.25,
        "decision_conf": 0.30
    })
    res_s1 = session.post(f"{BASE_URL}/live/start")
    sid1 = res_s1.json()["session_id"]
    ms_off = []
    for _ in range(5):
        files = {"file": ("frame.jpg", img_1_mixed_bytes, "image/jpeg")}
        r = session.post(f"{BASE_URL}/live/frame", data={"session_id": sid1}, files=files)
        ms_off.append(r.json()["processing_ms"])
    session.post(f"{BASE_URL}/live/stop", data={"session_id": sid1})

    avg_off = sum(ms_off) / len(ms_off)
    print(f"require_mask=False processing_ms: {ms_off} | Average: {avg_off:.1f} ms")

    # Mask ON
    session.put(f"{BASE_URL}/settings", json={
        "require_helmet": True,
        "require_vest": True,
        "require_mask": True,
        "person_conf": 0.40,
        "ppe_conf": 0.25,
        "decision_conf": 0.30
    })
    res_s2 = session.post(f"{BASE_URL}/live/start")
    sid2 = res_s2.json()["session_id"]
    ms_on = []
    for _ in range(5):
        files = {"file": ("frame.jpg", img_1_mixed_bytes, "image/jpeg")}
        r = session.post(f"{BASE_URL}/live/frame", data={"session_id": sid2}, files=files)
        ms_on.append(r.json()["processing_ms"])
    session.post(f"{BASE_URL}/live/stop", data={"session_id": sid2})

    avg_on = sum(ms_on) / len(ms_on)
    print(f"require_mask=True  processing_ms: {ms_on} | Average: {avg_on:.1f} ms")

    # -------------------------------------------------------------
    # Regression: image analysis on 1_mixed.png and Image 1.png to Image 6.png
    # -------------------------------------------------------------
    print("\n--- REGRESSION TESTING: Existing analyze_image checks ---")
    from pipeline import analyze_image

    # Reset settings to default before checking
    session.post(f"{BASE_URL}/settings/reset")
    from database import get_settings
    default_settings = get_settings()

    img_1_mixed_cv = cv2.imread(img_1_mixed_path)
    res_mixed = analyze_image(img_1_mixed_cv, default_settings)
    print(f"1_mixed.png -> Total: {res_mixed['total']}, Compliant: {res_mixed['compliant']}, Violations: {res_mixed['violations']}")
    assert res_mixed["total"] == 3, f"Expected 3 workers in 1_mixed.png, got {res_mixed['total']}"
    assert res_mixed["compliant"] == 1, f"Expected 1 compliant, got {res_mixed['compliant']}"
    assert res_mixed["violations"] == 2, f"Expected 2 violations, got {res_mixed['violations']}"

    # Verify Image 1.png to Image 6.png
    expected_counts = {
        "Image 1.png": (3, 1, 2),
        "Image 2.png": (3, 1, 2),
        "Image 3.png": (3, 3, 0),
        "Image 4.png": (3, 0, 3),
        "Image 5.png": (4, 0, 4),
        "Image 6.png": (1, 0, 1),
    }

    test_imgs_dir = os.path.join(os.path.dirname(__file__), "test_images")
    for name, (exp_tot, exp_comp, exp_viol) in expected_counts.items():
        p = os.path.join(test_imgs_dir, name)
        if os.path.exists(p):
            im = cv2.imread(p)
            r = analyze_image(im, default_settings)
            print(f"  {name}: total={r['total']} (exp {exp_tot}), compliant={r['compliant']} (exp {exp_comp}), violations={r['violations']} (exp {exp_viol})")
            assert (r["total"], r["compliant"], r["violations"]) == (exp_tot, exp_comp, exp_viol), \
                f"Mismatch on {name}: got {(r['total'], r['compliant'], r['violations'])}, expected {(exp_tot, exp_comp, exp_viol)}"

    print("[PASS] Regression checks passed cleanly with identical counts!")

    # -------------------------------------------------------------
    # Alerts API testing: GET /alerts, GET /alerts/{id}, POST /alerts/clear
    # -------------------------------------------------------------
    print("\n--- ALERTS API VERIFICATION ---")
    res_alerts = session.get(f"{BASE_URL}/alerts?limit=50")
    assert res_alerts.status_code == 200
    alerts_list = res_alerts.json()
    print(f"Stored alerts in DB: {len(alerts_list)}")
    if alerts_list:
        sample_id = alerts_list[0]["id"]
        res_single = session.get(f"{BASE_URL}/alerts/{sample_id}")
        assert res_single.status_code == 200
        assert res_single.json()["id"] == sample_id
        print(f"  Retrieved single alert {sample_id} successfully.")

    res_clear = session.post(f"{BASE_URL}/alerts/clear")
    assert res_clear.status_code == 200
    res_after_clear = session.get(f"{BASE_URL}/alerts")
    assert len(res_after_clear.json()) == 0
    print("[PASS] Clear alerts endpoint successfully wiped alerts.")

    print("\nALL PHASE 14 BACKEND TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    run_tests()
