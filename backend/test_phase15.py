import os
import sys
import time
import requests
from datetime import datetime, timezone, timedelta
import sqlite3

BASE_URL = "http://localhost:8000"

from auth import (
    AUTH_DB_PATH,
    init_auth_db,
    create_user,
    get_user_by_username,
    delete_user,
    get_auth_connection,
    create_session,
    hash_token,
    clear_failed_logins
)

def run_tests():
    print("=" * 70)
    print("PHASE 15: AUTHENTICATION & ACCESS CONTROL TEST SUITE")
    print("=" * 70)

    init_auth_db()

    # 1. Verify health check is public (200 without cookie)
    print("\n[1] Testing GET /health without cookie...")
    r = requests.get(f"{BASE_URL}/health")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    print("  -> GET /health returned 200 OK")

    # 2. Verify all protected endpoints return 401 without cookie
    print("\n[2] Testing protected endpoints without cookie (Expected 401)...")
    protected_endpoints = [
        ("GET", f"{BASE_URL}/"),
        ("GET", f"{BASE_URL}/settings"),
        ("GET", f"{BASE_URL}/stats"),
        ("GET", f"{BASE_URL}/history"),
        ("GET", f"{BASE_URL}/video-history"),
        ("POST", f"{BASE_URL}/live/start"),
        ("GET", f"{BASE_URL}/alerts"),
        ("GET", f"{BASE_URL}/auth/me"),
        ("GET", f"{BASE_URL}/outputs/test_nonexistent.jpg"),
    ]

    for method, url in protected_endpoints:
        if method == "GET":
            resp = requests.get(url)
        else:
            resp = requests.post(url)
        assert resp.status_code == 401, f"{method} {url} returned {resp.status_code}, expected 401"
        print(f"  -> {method} {url} correctly returned 401")

    # Test POST /analyze without cookie
    img_path = os.path.join(os.path.dirname(__file__), "..", "demo_images", "1_mixed.png")
    if not os.path.exists(img_path):
        img_path = os.path.join(os.path.dirname(__file__), "test_images", "1_mixed.png")
    with open(img_path, "rb") as f:
        resp = requests.post(f"{BASE_URL}/analyze", files={"file": ("1_mixed.png", f, "image/png")})
        assert resp.status_code == 401, f"POST /analyze returned {resp.status_code}, expected 401"
        print("  -> POST /analyze correctly returned 401")

    # 3. Create test users: one admin and one regular user
    print("\n[3] Setting up test accounts...")
    admin_user = "test_admin_phase15"
    admin_pass = "AdminPass123!"
    regular_user = "test_user_phase15"
    regular_pass = "UserPass123!"

    clear_failed_logins(admin_user)
    clear_failed_logins(regular_user)

    # Clean existing test users if left over
    for u in [admin_user, regular_user, "duplicate_user_test"]:
        existing = get_user_by_username(u)
        if existing:
            with get_auth_connection() as conn:
                conn.execute("DELETE FROM sessions WHERE user_id = ?", (existing["id"],))
                conn.execute("DELETE FROM users WHERE id = ?", (existing["id"],))
                conn.commit()

    admin_rec = create_user(admin_user, admin_pass, role="admin")
    user_rec = create_user(regular_user, regular_pass, role="user")
    print(f"  -> Created admin: {admin_rec['username']} (ID: {admin_rec['id']})")
    print(f"  -> Created user: {user_rec['username']} (ID: {user_rec['id']})")

    # 4. Test wrong password gives generic 401; 5 wrong attempts give 429
    print("\n[4] Testing login invalid password & lockout (429)...")
    lockout_user = "lockout_target"
    clear_failed_logins(lockout_user)
    existing_l = get_user_by_username(lockout_user)
    if existing_l:
        with get_auth_connection() as conn:
            conn.execute("DELETE FROM users WHERE id = ?", (existing_l["id"],))
            conn.commit()
    create_user(lockout_user, "TargetPass123!", role="user")

    # Wrong password attempt 1: generic 401
    r = requests.post(f"{BASE_URL}/auth/login", json={"username": lockout_user, "password": "WrongPassword"})
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"
    assert "Invalid username or password" in r.text
    print("  -> Attempt 1 failed: returned 401 'Invalid username or password'")

    # Wrong attempts 2, 3, 4
    for i in range(2, 5):
        r = requests.post(f"{BASE_URL}/auth/login", json={"username": lockout_user, "password": "WrongPassword"})
        assert r.status_code == 401, f"Expected 401 on attempt {i}, got {r.status_code}"

    # 5th failed attempt: triggers 429
    r = requests.post(f"{BASE_URL}/auth/login", json={"username": lockout_user, "password": "WrongPassword"})
    assert r.status_code == 429, f"Expected 429 on 5th attempt, got {r.status_code}: {r.text}"
    print(f"  -> Attempt 5 failed: returned 429 Lockout: {r.json()['detail']}")

    # 6th attempt should also return 429
    r = requests.post(f"{BASE_URL}/auth/login", json={"username": lockout_user, "password": "TargetPass123!"})
    assert r.status_code == 429, f"Expected 429 while locked out, got {r.status_code}"
    print("  -> Subsequent attempt while locked out correctly returned 429")

    # Clean lockout user
    clear_failed_logins(lockout_user)

    # 5. Test Admin Login and Admin Capabilities
    print("\n[5] Testing Admin session & role-based permissions...")
    admin_session = requests.Session()
    r = admin_session.post(f"{BASE_URL}/auth/login", json={"username": admin_user, "password": admin_pass})
    assert r.status_code == 200, f"Admin login failed: {r.text}"
    assert "ppe_session" in admin_session.cookies
    admin_data = r.json()
    assert admin_data["username"] == admin_user
    assert admin_data["role"] == "admin"
    print("  -> Admin logged in successfully with ppe_session cookie")

    # GET /auth/me
    r = admin_session.get(f"{BASE_URL}/auth/me")
    assert r.status_code == 200
    assert r.json()["role"] == "admin"
    print("  -> Admin GET /auth/me returned role 'admin'")

    # Admin PUT /settings (works)
    r = admin_session.put(f"{BASE_URL}/settings", json={
        "require_helmet": True,
        "require_vest": True,
        "require_mask": False,
        "person_conf": 0.40,
        "ppe_conf": 0.25,
        "decision_conf": 0.30
    })
    assert r.status_code == 200, f"Admin PUT /settings failed: {r.text}"
    print("  -> Admin PUT /settings succeeded (200)")

    # 6. Test Regular User Login and Restrictions
    print("\n[6] Testing User session & restriction enforcement (403)...")
    user_session = requests.Session()
    r = user_session.post(f"{BASE_URL}/auth/login", json={"username": regular_user, "password": regular_pass})
    assert r.status_code == 200, f"User login failed: {r.text}"
    assert "ppe_session" in user_session.cookies
    user_data = r.json()
    assert user_data["username"] == regular_user
    assert user_data["role"] == "user"
    print("  -> Regular user logged in successfully")

    # User PUT /settings (must return 403 Forbidden)
    r = user_session.put(f"{BASE_URL}/settings", json={
        "require_helmet": True,
        "require_vest": True,
        "require_mask": False,
        "person_conf": 0.40,
        "ppe_conf": 0.25,
        "decision_conf": 0.30
    })
    assert r.status_code == 403, f"Expected 403 for user PUT /settings, got {r.status_code}"
    print("  -> User PUT /settings returned 403 Forbidden")

    # User POST /alerts/clear (must return 403 Forbidden)
    r = user_session.post(f"{BASE_URL}/alerts/clear")
    assert r.status_code == 403, f"Expected 403 for user POST /alerts/clear, got {r.status_code}"
    print("  -> User POST /alerts/clear returned 403 Forbidden")

    # User POST /analyze works
    with open(img_path, "rb") as f:
        r = user_session.post(f"{BASE_URL}/analyze", files={"file": ("1_mixed.png", f, "image/png")})
        assert r.status_code == 200, f"User POST /analyze failed: {r.text}"
        res = r.json()
        assert res["total"] == 3
        assert res["compliant"] == 1
        assert res["violations"] == 2
        assert res["analyzed_by"] == regular_user
        print(f"  -> User POST /analyze succeeded (total={res['total']}, compliant={res['compliant']}, violations={res['violations']}, analyzed_by='{res['analyzed_by']}')")

        # Test authenticated static image fetch with cookie
        img_url = res["image_url"]
        img_r = user_session.get(img_url)
        assert img_r.status_code == 200, f"Failed to get output image: {img_r.status_code}"
        print(f"  -> User fetched protected output image successfully (200)")

        # Test fetching same image WITHOUT cookie returns 401
        unauth_img_r = requests.get(img_url)
        assert unauth_img_r.status_code == 401, f"Expected 401 without cookie, got {unauth_img_r.status_code}"
        print(f"  -> Unauthenticated request to output image correctly returned 401")

    # 7. Test Logout and Session Invalidation
    print("\n[7] Testing Logout & Session Expiration...")
    old_cookie = user_session.cookies.get("ppe_session")
    r = user_session.post(f"{BASE_URL}/auth/logout")
    assert r.status_code == 200
    print("  -> POST /auth/logout succeeded")

    # Request with old session token must return 401
    bad_session = requests.Session()
    bad_session.cookies.set("ppe_session", old_cookie)
    r = bad_session.get(f"{BASE_URL}/auth/me")
    assert r.status_code == 401, f"Expected 401 after logout, got {r.status_code}"
    print("  -> Revoked cookie correctly returned 401")

    # Test expired session token returns 401
    expired_token = "expired_token_phase15"
    tok_hash = hash_token(expired_token)
    past_iso = (datetime.now(timezone.utc) - timedelta(hours=10)).isoformat()
    with get_auth_connection() as conn:
        conn.execute("INSERT OR REPLACE INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
                     (tok_hash, admin_rec["id"], past_iso, past_iso))
        conn.commit()

    exp_session = requests.Session()
    exp_session.cookies.set("ppe_session", expired_token)
    r = exp_session.get(f"{BASE_URL}/auth/me")
    assert r.status_code == 401, f"Expected 401 for expired token, got {r.status_code}"
    print("  -> Expired session token correctly returned 401")

    # 8. Test Admin deletion constraints & Duplicate username rejection
    print("\n[8] Testing Admin deletion guards & duplicate username validation...")
    # Admin cannot delete themselves
    r = admin_session.delete(f"{BASE_URL}/auth/users/{admin_rec['id']}")
    assert r.status_code == 400, f"Expected 400 when admin deletes self, got {r.status_code}"
    print("  -> Admin self-deletion prevented (400)")

    # Duplicate username case-insensitive rejected
    dup_name = admin_user.upper()
    r = admin_session.post(f"{BASE_URL}/auth/users", json={
        "username": dup_name,
        "password": "ValidPassword123!",
        "role": "user"
    })
    assert r.status_code == 400, f"Expected 400 for duplicate case-insensitive username, got {r.status_code}"
    print(f"  -> Duplicate username ('{dup_name}' vs '{admin_user}') rejected (400)")

    # 9. Verify separation of databases & reset_demo logic
    print("\n[9] Verifying database separation & reset_demo safety...")
    history_db_path = os.path.join(os.path.dirname(__file__), "history.db")
    assert os.path.abspath(AUTH_DB_PATH) != os.path.abspath(history_db_path), "auth.db and history.db must be different files"
    print(f"  -> auth.db ({os.path.abspath(AUTH_DB_PATH)}) is distinct from history.db ({os.path.abspath(history_db_path)})")

    # 10. Regression Tests on Ground Truth Images while logged in
    print("\n[10] Regression tests on ground truth images (with authenticated session)...")
    images_dir = os.path.join(os.path.dirname(__file__), "..", "test_images")
    if not os.path.exists(images_dir):
        images_dir = os.path.join(os.path.dirname(__file__), "..", "demo_images")

    expected_counts = {
        "1_mixed.png": (3, 1, 2),
    }

    for fname, (exp_tot, exp_comp, exp_viol) in expected_counts.items():
        fpath = os.path.join(images_dir, fname)
        if os.path.exists(fpath):
            with open(fpath, "rb") as f:
                r = admin_session.post(f"{BASE_URL}/analyze", files={"file": (fname, f, "image/png")})
                assert r.status_code == 200
                d = r.json()
                assert d["total"] == exp_tot, f"{fname} total {d['total']} != {exp_tot}"
                assert d["compliant"] == exp_comp, f"{fname} compliant {d['compliant']} != {exp_comp}"
                assert d["violations"] == exp_viol, f"{fname} violations {d['violations']} != {exp_viol}"
                print(f"  -> {fname}: total={d['total']}, compliant={d['compliant']}, violations={d['violations']} (MATCH)")

    # 11. Cleanup test accounts
    print("\n[11] Cleaning up test accounts...")
    with get_auth_connection() as conn:
        for u in [admin_user, regular_user, lockout_user]:
            user_row = get_user_by_username(u)
            if user_row:
                conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_row["id"],))
                conn.execute("DELETE FROM users WHERE id = ?", (user_row["id"],))
        conn.commit()
    print("  -> Test accounts and test sessions cleaned up.")

    print("\n" + "=" * 70)
    print("ALL PHASE 15 AUTHENTICATION TESTS PASSED SUCCESSFULLY!")
    print("=" * 70)

if __name__ == "__main__":
    run_tests()
