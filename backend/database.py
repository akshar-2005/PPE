import os
import json
import sqlite3
from datetime import datetime, timezone

DB_PATH = os.path.join(os.path.dirname(__file__), "history.db")

DEFAULT_SETTINGS = {
    "require_helmet": True,
    "require_vest": True,
    "require_mask": False,
    "person_conf": 0.40,
    "ppe_conf": 0.25,
    "decision_conf": 0.30
}

def get_connection():
    return sqlite3.connect(DB_PATH)

def init_db():
    with get_connection() as conn:
        cursor = conn.cursor()
        
        # 1. analyses table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS analyses (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                filename TEXT NOT NULL,
                total INTEGER NOT NULL,
                compliant INTEGER NOT NULL,
                violations INTEGER NOT NULL,
                image_path TEXT NOT NULL,
                workers_json TEXT NOT NULL
            )
        """)
        
        # Safe migration for settings_json and analyzed_by columns in analyses table
        cursor.execute("PRAGMA table_info(analyses)")
        columns = [row[1] for row in cursor.fetchall()]
        if "settings_json" not in columns:
            cursor.execute("ALTER TABLE analyses ADD COLUMN settings_json TEXT")
        if "analyzed_by" not in columns:
            cursor.execute("ALTER TABLE analyses ADD COLUMN analyzed_by TEXT")

        # 2. settings table (single row with id=1)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                require_helmet INTEGER NOT NULL DEFAULT 1,
                require_vest INTEGER NOT NULL DEFAULT 1,
                require_mask INTEGER NOT NULL DEFAULT 0,
                person_conf REAL NOT NULL DEFAULT 0.40,
                ppe_conf REAL NOT NULL DEFAULT 0.25,
                decision_conf REAL NOT NULL DEFAULT 0.30
            )
        """)
        
        # Safe migration for settings table columns
        cursor.execute("PRAGMA table_info(settings)")
        setting_cols = [row[1] for row in cursor.fetchall()]
        if "require_mask" not in setting_cols:
            cursor.execute("ALTER TABLE settings ADD COLUMN require_mask INTEGER NOT NULL DEFAULT 0")

        # Ensure default settings row exists
        cursor.execute("SELECT COUNT(*) FROM settings WHERE id = 1")
        if cursor.fetchone()[0] == 0:
            cursor.execute("""
                INSERT INTO settings (id, require_helmet, require_vest, require_mask, person_conf, ppe_conf, decision_conf)
                VALUES (1, ?, ?, ?, ?, ?, ?)
            """, (
                int(DEFAULT_SETTINGS["require_helmet"]),
                int(DEFAULT_SETTINGS["require_vest"]),
                int(DEFAULT_SETTINGS["require_mask"]),
                DEFAULT_SETTINGS["person_conf"],
                DEFAULT_SETTINGS["ppe_conf"],
                DEFAULT_SETTINGS["decision_conf"]
            ))
            
        # 3. video_analyses table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS video_analyses (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                filename TEXT NOT NULL,
                duration_seconds REAL NOT NULL,
                frames_analyzed INTEGER NOT NULL,
                total_video_frames INTEGER NOT NULL,
                truncated INTEGER NOT NULL,
                unique_workers INTEGER NOT NULL,
                compliant INTEGER NOT NULL,
                violations INTEGER NOT NULL,
                workers_json TEXT NOT NULL,
                video_url TEXT NOT NULL,
                video_codec TEXT NOT NULL,
                keyframes_json TEXT NOT NULL,
                settings_json TEXT NOT NULL
            )
        """)

        # Safe migration for analyzed_by in video_analyses table
        cursor.execute("PRAGMA table_info(video_analyses)")
        v_columns = [row[1] for row in cursor.fetchall()]
        if "analyzed_by" not in v_columns:
            cursor.execute("ALTER TABLE video_analyses ADD COLUMN analyzed_by TEXT")

        # 4. alerts table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS alerts (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                session_id TEXT NOT NULL,
                track_id INTEGER NOT NULL,
                missing_items TEXT NOT NULL,
                snapshot_path TEXT NOT NULL,
                message TEXT NOT NULL
            )
        """)

        conn.commit()

def get_settings() -> dict:
    init_db()
    with get_connection() as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM settings WHERE id = 1")
        row = cursor.fetchone()
        if not row:
            return DEFAULT_SETTINGS.copy()
        
        keys = row.keys()
        return {
            "require_helmet": bool(row["require_helmet"]),
            "require_vest": bool(row["require_vest"]),
            "require_mask": bool(row["require_mask"]) if "require_mask" in keys else False,
            "person_conf": float(row["person_conf"]),
            "ppe_conf": float(row["ppe_conf"]),
            "decision_conf": float(row["decision_conf"])
        }

def save_settings(settings: dict) -> dict:
    init_db()
    req_helmet = int(bool(settings.get("require_helmet", True)))
    req_vest = int(bool(settings.get("require_vest", True)))
    req_mask = int(bool(settings.get("require_mask", False)))
    person_conf = float(settings.get("person_conf", 0.40))
    ppe_conf = float(settings.get("ppe_conf", 0.25))
    decision_conf = float(settings.get("decision_conf", 0.30))

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO settings (id, require_helmet, require_vest, require_mask, person_conf, ppe_conf, decision_conf)
            VALUES (1, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                require_helmet = excluded.require_helmet,
                require_vest = excluded.require_vest,
                require_mask = excluded.require_mask,
                person_conf = excluded.person_conf,
                ppe_conf = excluded.ppe_conf,
                decision_conf = excluded.decision_conf
        """, (req_helmet, req_vest, req_mask, person_conf, ppe_conf, decision_conf))
        conn.commit()

    return get_settings()

def reset_settings() -> dict:
    return save_settings(DEFAULT_SETTINGS)

def save_analysis(
    analysis_id: str,
    filename: str,
    total: int,
    compliant: int,
    violations: int,
    image_path: str,
    workers: list,
    created_at: str = None,
    settings: dict = None,
    analyzed_by: str = None
):
    init_db()
    if created_at is None:
        created_at = datetime.now(timezone.utc).isoformat()
    if settings is None:
        settings = get_settings()
        
    workers_json = json.dumps(workers)
    settings_json = json.dumps(settings)
    
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO analyses (id, created_at, filename, total, compliant, violations, image_path, workers_json, settings_json, analyzed_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (analysis_id, created_at, filename, int(total), int(compliant), int(violations), image_path, workers_json, settings_json, analyzed_by))
        conn.commit()

def list_analyses():
    init_db()
    with get_connection() as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, created_at, filename, total, compliant, violations, image_path, analyzed_by
            FROM analyses
            ORDER BY created_at DESC
        """)
        rows = cursor.fetchall()
        return [dict(row) for row in rows]

def get_analysis(analysis_id: str):
    init_db()
    with get_connection() as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, created_at, filename, total, compliant, violations, image_path, workers_json, settings_json, analyzed_by
            FROM analyses
            WHERE id = ?
        """, (analysis_id,))
        row = cursor.fetchone()
        if not row:
            return None
        res = dict(row)
        res["workers"] = json.loads(res["workers_json"])
        del res["workers_json"]
        
        if res.get("settings_json"):
            raw_s = json.loads(res["settings_json"])
            res["settings"] = {
                "require_helmet": bool(raw_s.get("require_helmet", True)),
                "require_vest": bool(raw_s.get("require_vest", True)),
                "require_mask": bool(raw_s.get("require_mask", False)),
                "person_conf": float(raw_s.get("person_conf", 0.40)),
                "ppe_conf": float(raw_s.get("ppe_conf", 0.25)),
                "decision_conf": float(raw_s.get("decision_conf", 0.30))
            }
        else:
            res["settings"] = DEFAULT_SETTINGS.copy()
            
        del res["settings_json"]
        return res

def get_stats():
    init_db()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                COUNT(*) as total_analyses,
                COALESCE(SUM(total), 0) as total_workers,
                COALESCE(SUM(compliant), 0) as total_compliant,
                COALESCE(SUM(violations), 0) as total_violations
            FROM analyses
        """)
        row = cursor.fetchone()
        total_analyses = row[0]
        total_workers = row[1]
        total_compliant = row[2]
        total_violations = row[3]
        
        compliance_rate = round((total_compliant / total_workers * 100.0), 2) if total_workers > 0 else 0.0
        
        return {
            "total_analyses": int(total_analyses),
            "total_workers": int(total_workers),
            "total_compliant": int(total_compliant),
            "total_violations": int(total_violations),
            "compliance_rate": float(compliance_rate)
        }

def save_video_analysis(record: dict, analyzed_by: str = None):
    init_db()
    created_at = record.get("created_at") or datetime.now(timezone.utc).isoformat()
    workers_json = json.dumps(record.get("workers", []))
    keyframes_json = json.dumps(record.get("keyframes", []))
    settings_json = json.dumps(record.get("settings", {}))
    user = analyzed_by if analyzed_by is not None else record.get("analyzed_by")
    
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO video_analyses (
                id, created_at, filename, duration_seconds, frames_analyzed,
                total_video_frames, truncated, unique_workers, compliant,
                violations, workers_json, video_url, video_codec,
                keyframes_json, settings_json, analyzed_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            record["id"],
            created_at,
            record["filename"],
            float(record["duration_seconds"]),
            int(record["frames_analyzed"]),
            int(record.get("total_video_frames", record["frames_analyzed"])),
            1 if record.get("truncated") else 0,
            int(record["unique_workers"]),
            int(record["compliant"]),
            int(record["violations"]),
            workers_json,
            record.get("video_url", ""),
            record.get("video_codec", "mp4v"),
            keyframes_json,
            settings_json,
            user
        ))
        conn.commit()

def list_video_analyses():
    init_db()
    with get_connection() as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, created_at, filename, duration_seconds, frames_analyzed,
                   total_video_frames, truncated, unique_workers, compliant, violations,
                   video_url, video_codec, keyframes_json, settings_json, analyzed_by
            FROM video_analyses
            ORDER BY created_at DESC
        """)
        rows = cursor.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["truncated"] = bool(d["truncated"])
            d["keyframes"] = json.loads(d["keyframes_json"]) if d.get("keyframes_json") else []
            d["settings"] = json.loads(d["settings_json"]) if d.get("settings_json") else {}
            del d["keyframes_json"]
            del d["settings_json"]
            result.append(d)
        return result

def get_video_analysis_by_id(analysis_id: str):
    init_db()
    with get_connection() as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, created_at, filename, duration_seconds, frames_analyzed,
                   total_video_frames, truncated, unique_workers, compliant, violations,
                   workers_json, video_url, video_codec, keyframes_json, settings_json, analyzed_by
            FROM video_analyses
            WHERE id = ?
        """, (analysis_id,))
        row = cursor.fetchone()
        if not row:
            return None
        d = dict(row)
        d["truncated"] = bool(d["truncated"])
        d["workers"] = json.loads(d["workers_json"]) if d.get("workers_json") else []
        d["keyframes"] = json.loads(d["keyframes_json"]) if d.get("keyframes_json") else []
        d["settings"] = json.loads(d["settings_json"]) if d.get("settings_json") else {}
        del d["workers_json"]
        del d["keyframes_json"]
        del d["settings_json"]
        return d

def save_alert(record: dict):
    init_db()
    created_at = record.get("created_at") or datetime.now(timezone.utc).isoformat()
    missing_items_json = json.dumps(record.get("missing_items", []))
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO alerts (
                id, created_at, session_id, track_id, missing_items, snapshot_path, message
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            record["id"],
            created_at,
            record["session_id"],
            int(record["track_id"]),
            missing_items_json,
            record.get("snapshot_path", ""),
            record.get("message", "")
        ))
        conn.commit()

def list_alerts(limit: int = 50):
    init_db()
    with get_connection() as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, created_at, session_id, track_id, missing_items, snapshot_path, message
            FROM alerts
            ORDER BY created_at DESC
            LIMIT ?
        """, (limit,))
        rows = cursor.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            try:
                d["missing_items"] = json.loads(d["missing_items"])
            except Exception:
                d["missing_items"] = [d["missing_items"]]
            result.append(d)
        return result

def get_alert(alert_id: str):
    init_db()
    with get_connection() as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, created_at, session_id, track_id, missing_items, snapshot_path, message
            FROM alerts
            WHERE id = ?
        """, (alert_id,))
        row = cursor.fetchone()
        if not row:
            return None
        d = dict(row)
        try:
            d["missing_items"] = json.loads(d["missing_items"])
        except Exception:
            d["missing_items"] = [d["missing_items"]]
        return d

def clear_alerts():
    init_db()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT snapshot_path FROM alerts")
        rows = cursor.fetchall()
        snapshot_paths = [r[0] for r in rows if r[0]]
        cursor.execute("DELETE FROM alerts")
        conn.commit()
    return snapshot_paths

