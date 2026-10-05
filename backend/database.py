import os
import json
import sqlite3
from datetime import datetime, timezone

DB_PATH = os.path.join(os.path.dirname(__file__), "history.db")

DEFAULT_SETTINGS = {
    "require_helmet": True,
    "require_vest": True,
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
        
        # Safe migration for settings_json column in analyses table
        cursor.execute("PRAGMA table_info(analyses)")
        columns = [row[1] for row in cursor.fetchall()]
        if "settings_json" not in columns:
            cursor.execute("ALTER TABLE analyses ADD COLUMN settings_json TEXT")

        # 2. settings table (single row with id=1)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                require_helmet INTEGER NOT NULL DEFAULT 1,
                require_vest INTEGER NOT NULL DEFAULT 1,
                person_conf REAL NOT NULL DEFAULT 0.40,
                ppe_conf REAL NOT NULL DEFAULT 0.25,
                decision_conf REAL NOT NULL DEFAULT 0.30
            )
        """)
        
        # Ensure default settings row exists
        cursor.execute("SELECT COUNT(*) FROM settings WHERE id = 1")
        if cursor.fetchone()[0] == 0:
            cursor.execute("""
                INSERT INTO settings (id, require_helmet, require_vest, person_conf, ppe_conf, decision_conf)
                VALUES (1, ?, ?, ?, ?, ?)
            """, (
                int(DEFAULT_SETTINGS["require_helmet"]),
                int(DEFAULT_SETTINGS["require_vest"]),
                DEFAULT_SETTINGS["person_conf"],
                DEFAULT_SETTINGS["ppe_conf"],
                DEFAULT_SETTINGS["decision_conf"]
            ))
            
        conn.commit()

def get_settings() -> dict:
    init_db()
    with get_connection() as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT require_helmet, require_vest, person_conf, ppe_conf, decision_conf FROM settings WHERE id = 1")
        row = cursor.fetchone()
        if not row:
            return DEFAULT_SETTINGS.copy()
            
        return {
            "require_helmet": bool(row["require_helmet"]),
            "require_vest": bool(row["require_vest"]),
            "person_conf": float(row["person_conf"]),
            "ppe_conf": float(row["ppe_conf"]),
            "decision_conf": float(row["decision_conf"])
        }

def save_settings(settings: dict) -> dict:
    init_db()
    req_helmet = int(bool(settings.get("require_helmet", True)))
    req_vest = int(bool(settings.get("require_vest", True)))
    person_conf = float(settings.get("person_conf", 0.40))
    ppe_conf = float(settings.get("ppe_conf", 0.25))
    decision_conf = float(settings.get("decision_conf", 0.30))

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO settings (id, require_helmet, require_vest, person_conf, ppe_conf, decision_conf)
            VALUES (1, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                require_helmet = excluded.require_helmet,
                require_vest = excluded.require_vest,
                person_conf = excluded.person_conf,
                ppe_conf = excluded.ppe_conf,
                decision_conf = excluded.decision_conf
        """, (req_helmet, req_vest, person_conf, ppe_conf, decision_conf))
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
    settings: dict = None
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
            INSERT INTO analyses (id, created_at, filename, total, compliant, violations, image_path, workers_json, settings_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (analysis_id, created_at, filename, int(total), int(compliant), int(violations), image_path, workers_json, settings_json))
        conn.commit()

def list_analyses():
    init_db()
    with get_connection() as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, created_at, filename, total, compliant, violations, image_path
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
            SELECT id, created_at, filename, total, compliant, violations, image_path, workers_json, settings_json
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
