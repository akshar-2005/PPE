import os
import json
import sqlite3
from datetime import datetime, timezone

DB_PATH = os.path.join(os.path.dirname(__file__), "history.db")

def get_connection():
    return sqlite3.connect(DB_PATH)

def init_db():
    with get_connection() as conn:
        cursor = conn.cursor()
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
        conn.commit()

def save_analysis(analysis_id: str, filename: str, total: int, compliant: int, violations: int, image_path: str, workers: list, created_at: str = None):
    if created_at is None:
        created_at = datetime.now(timezone.utc).isoformat()
        
    workers_json = json.dumps(workers)
    
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO analyses (id, created_at, filename, total, compliant, violations, image_path, workers_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (analysis_id, created_at, filename, int(total), int(compliant), int(violations), image_path, workers_json))
        conn.commit()

def list_analyses():
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
    with get_connection() as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, created_at, filename, total, compliant, violations, image_path, workers_json
            FROM analyses
            WHERE id = ?
        """, (analysis_id,))
        row = cursor.fetchone()
        if not row:
            return None
        res = dict(row)
        res["workers"] = json.loads(res["workers_json"])
        del res["workers_json"]
        return res

def get_stats():
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
