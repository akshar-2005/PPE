import os
import sqlite3
import hashlib
import secrets
import hmac
import time
import re
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List, Tuple

AUTH_DB_PATH = os.path.join(os.path.dirname(__file__), "auth.db")

# In-memory login attempt tracking: username_lower -> list of float timestamps
_failed_attempts: Dict[str, List[float]] = {}
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_DURATION_SECONDS = 300  # 5 minutes
SESSION_MAX_AGE_SECONDS = 8 * 3600  # 8 hours

USERNAME_REGEX = re.compile(r"^[A-Za-z0-9_.]{3,32}$")

def get_auth_connection() -> sqlite3.Connection:
    return sqlite3.connect(AUTH_DB_PATH)

def init_auth_db():
    with get_auth_connection() as conn:
        cursor = conn.cursor()
        # users table: username unique case-insensitive
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE COLLATE NOCASE NOT NULL,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
                created_at TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1
            )
        """)

        # sessions table: stores token_hash
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )
        """)
        conn.commit()

def hash_password(password: str) -> Tuple[str, str]:
    """Hashes a password using PBKDF2-HMAC-SHA256 with 200,000 iterations and a unique salt."""
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), 200000)
    return key.hex(), salt

def verify_password(password: str, password_hash: str, salt: str) -> bool:
    """Verifies a password against the stored PBKDF2 hash using constant-time comparison."""
    try:
        key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), 200000)
        return hmac.compare_digest(key.hex(), password_hash)
    except Exception:
        return False

def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

# ----------------- Rate Limiting -----------------

def check_login_rate_limit(username: str) -> Optional[int]:
    """
    Checks if the username is currently locked out.
    Returns remaining lockout seconds if locked out, or None if allowed.
    """
    key = username.strip().lower()
    now = time.time()
    attempts = _failed_attempts.get(key, [])
    if len(attempts) >= MAX_FAILED_ATTEMPTS:
        latest = max(attempts)
        if now - latest < LOCKOUT_DURATION_SECONDS:
            return max(1, int(LOCKOUT_DURATION_SECONDS - (now - latest)))
        else:
            # Lockout expired, reset attempts
            _failed_attempts[key] = []
            return None

    # Filter attempts older than 5 minutes for counting towards lockout
    valid_attempts = [t for t in attempts if now - t < LOCKOUT_DURATION_SECONDS]
    _failed_attempts[key] = valid_attempts
    return None

def record_failed_login(username: str):
    key = username.strip().lower()
    now = time.time()
    attempts = _failed_attempts.get(key, [])
    valid_attempts = [t for t in attempts if now - t < LOCKOUT_DURATION_SECONDS]
    valid_attempts.append(now)
    _failed_attempts[key] = valid_attempts

def clear_failed_logins(username: str):
    key = username.strip().lower()
    if key in _failed_attempts:
        del _failed_attempts[key]

def authenticate_user(username: str, password: str) -> Optional[Dict[str, Any]]:
    user = get_user_by_username(username)
    if not user:
        return None
    if not user["is_active"]:
        return None
    if verify_password(password, user["password_hash"], user["salt"]):
        return {
            "id": user["id"],
            "username": user["username"],
            "role": user["role"]
        }
    return None

# ----------------- User Management -----------------

def count_users() -> int:
    init_auth_db()
    with get_auth_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM users")
        return cursor.fetchone()[0]

def count_active_admins() -> int:
    init_auth_db()
    with get_auth_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active = 1")
        return cursor.fetchone()[0]

def create_user(username: str, password: str, role: str = "user") -> Dict[str, Any]:
    init_auth_db()
    username = username.strip()
    if not USERNAME_REGEX.match(username):
        raise ValueError("Username must be 3 to 32 characters and contain only letters, digits, underscores, or dots.")
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters long.")
    if role not in ("admin", "user"):
        raise ValueError("Role must be either 'admin' or 'user'.")

    pwd_hash, salt = hash_password(password)
    created_at = datetime.now(timezone.utc).isoformat()

    try:
        with get_auth_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO users (username, password_hash, salt, role, created_at, is_active)
                VALUES (?, ?, ?, ?, ?, 1)
            """, (username, pwd_hash, salt, role, created_at))
            user_id = cursor.lastrowid
            conn.commit()
            return {
                "id": user_id,
                "username": username,
                "role": role,
                "created_at": created_at,
                "is_active": True
            }
    except sqlite3.IntegrityError:
        raise ValueError(f"Username '{username}' already exists.")

def get_user_by_username(username: str) -> Optional[Dict[str, Any]]:
    init_auth_db()
    with get_auth_connection() as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE username = ?", (username.strip(),))
        row = cursor.fetchone()
        return dict(row) if row else None

def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    init_auth_db()
    with get_auth_connection() as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

def list_users() -> List[Dict[str, Any]]:
    init_auth_db()
    with get_auth_connection() as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, username, role, created_at, is_active
            FROM users
            ORDER BY id ASC
        """)
        rows = cursor.fetchall()
        return [
            {
                "id": r["id"],
                "username": r["username"],
                "role": r["role"],
                "created_at": r["created_at"],
                "is_active": bool(r["is_active"])
            }
            for r in rows
        ]

def delete_user(user_id: int, current_admin_id: int) -> Tuple[bool, str]:
    init_auth_db()
    if user_id == current_admin_id:
        return False, "You cannot delete your own admin account."

    target = get_user_by_id(user_id)
    if not target:
        return False, "User not found."

    if target["role"] == "admin" and count_active_admins() <= 1:
        return False, "Cannot delete the last active administrator."

    with get_auth_connection() as conn:
        cursor = conn.cursor()
        # Delete active sessions for this user
        cursor.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        # Delete user
        cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
    return True, "User deleted successfully."

def reset_user_password(user_id: int, new_password: str):
    init_auth_db()
    if len(new_password) < 8:
        raise ValueError("Password must be at least 8 characters long.")
    pwd_hash, salt = hash_password(new_password)
    with get_auth_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE users SET password_hash = ?, salt = ? WHERE id = ?
        """, (pwd_hash, salt, user_id))
        if cursor.rowcount == 0:
            raise ValueError("User not found.")
        # Invalidate sessions for this user
        cursor.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        conn.commit()

def change_user_password(user_id: int, current_password: str, new_password: str) -> Tuple[bool, str]:
    init_auth_db()
    user = get_user_by_id(user_id)
    if not user:
        return False, "User not found."
    if not verify_password(current_password, user["password_hash"], user["salt"]):
        return False, "Current password is incorrect."
    if len(new_password) < 8:
        return False, "New password must be at least 8 characters long."

    pwd_hash, salt = hash_password(new_password)
    with get_auth_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE users SET password_hash = ?, salt = ? WHERE id = ?
        """, (pwd_hash, salt, user_id))
        conn.commit()
    return True, "Password updated successfully."

# ----------------- Session Management -----------------

def create_session(user_id: int) -> str:
    init_auth_db()
    raw_token = secrets.token_urlsafe(32)
    tok_hash = hash_token(raw_token)
    now = datetime.now(timezone.utc)
    created_at = now.isoformat()
    expires_at = (now + timedelta(seconds=SESSION_MAX_AGE_SECONDS)).isoformat()

    with get_auth_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
            VALUES (?, ?, ?, ?)
        """, (tok_hash, user_id, created_at, expires_at))
        conn.commit()
    return raw_token

def validate_session(raw_token: str) -> Optional[Dict[str, Any]]:
    if not raw_token:
        return None
    init_auth_db()
    tok_hash = hash_token(raw_token)
    now_iso = datetime.now(timezone.utc).isoformat()

    with get_auth_connection() as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("""
            SELECT s.expires_at, u.id, u.username, u.role, u.is_active
            FROM sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.token_hash = ?
        """, (tok_hash,))
        row = cursor.fetchone()
        if not row:
            return None

        # Check expiration
        if row["expires_at"] < now_iso:
            cursor.execute("DELETE FROM sessions WHERE token_hash = ?", (tok_hash,))
            conn.commit()
            return None

        if not row["is_active"]:
            return None

        return {
            "id": row["id"],
            "username": row["username"],
            "role": row["role"]
        }

def delete_session(raw_token: str):
    if not raw_token:
        return
    tok_hash = hash_token(raw_token)
    with get_auth_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM sessions WHERE token_hash = ?", (tok_hash,))
        conn.commit()

def clean_expired_sessions():
    now_iso = datetime.now(timezone.utc).isoformat()
    with get_auth_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM sessions WHERE expires_at < ?", (now_iso,))
        conn.commit()
