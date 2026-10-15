import os
import uuid
import cv2
import numpy as np
import traceback
import base64
import collections
import time
import threading
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from auth import (
    init_auth_db,
    count_users,
    count_active_admins,
    authenticate_user,
    create_session,
    validate_session,
    delete_session,
    create_user,
    list_users,
    delete_user,
    reset_user_password,
    change_user_password,
    check_login_rate_limit,
    record_failed_login,
    clear_failed_logins
)
from database import (
    init_db,
    save_analysis,
    list_analyses,
    get_analysis,
    get_stats,
    get_settings,
    save_settings,
    reset_settings,
    save_video_analysis,
    list_video_analyses,
    get_video_analysis_by_id,
    save_alert,
    list_alerts,
    get_alert,
    clear_alerts
)
from pipeline import (
    analyze_image,
    annotate,
    detect_workers,
    check_ppe,
    evaluate,
    draw_worker_label
)
from tracker import IoUTracker
from video_pipeline import analyze_video

OUTPUTS_DIR = os.path.join(os.path.dirname(__file__), "outputs")
os.makedirs(OUTPUTS_DIR, exist_ok=True)
ALERTS_DIR = os.path.join(OUTPUTS_DIR, "alerts")
os.makedirs(ALERTS_DIR, exist_ok=True)

# Live monitoring sessions
class LiveSession:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.tracker = IoUTracker(iou_threshold=0.3, lenient_iou_threshold=0.2, max_lost=5)
        self.last_activity = time.time()
        # track_id -> deque of status strings (maxlen=5)
        self.track_history: dict[int, collections.deque] = {}
        # track_id -> float (last alert timestamp)
        self.track_last_alert_time: dict[int, float] = {}
        # track_id -> frozenset of missing items
        self.track_last_alert_missing: dict[int, frozenset] = {}

live_sessions: dict[str, LiveSession] = {}
live_sessions_lock = threading.Lock()

def clean_idle_sessions():
    now = time.time()
    with live_sessions_lock:
        to_del = [sid for sid, s in live_sessions.items() if now - s.last_activity > 120]
        for sid in to_del:
            del live_sessions[sid]

# Video background job tracking
video_jobs: dict = {}
video_job_lock = threading.Lock()
current_active_job_id = None

ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".webm"}
MAX_VIDEO_SIZE = 50 * 1024 * 1024 # 50 MB

def run_video_job(job_id: str, input_path: str, filename: str, settings: dict, base_url: str, analyzed_by: str = None):
    global current_active_job_id
    try:
        def progress_cb(pct: int, msg: str):
            if job_id in video_jobs:
                video_jobs[job_id]["progress"] = pct
                video_jobs[job_id]["message"] = msg

        out_video_name = f"{job_id}.mp4"
        out_video_path = os.path.join(OUTPUTS_DIR, out_video_name)

        progress_cb(5, "Starting video analysis...")
        raw_res = analyze_video(
            video_path=input_path,
            output_video_path=out_video_path,
            output_dir=OUTPUTS_DIR,
            video_id=job_id,
            settings=settings,
            progress_callback=progress_cb
        )

        created_at = datetime.now(timezone.utc).isoformat()
        video_url = f"{base_url}/outputs/{out_video_name}"
        keyframe_urls = [f"{base_url}/outputs/{kf}" for kf in raw_res["keyframe_filenames"]]

        final_res = {
            "id": job_id,
            "filename": filename,
            "created_at": created_at,
            "duration_seconds": raw_res["duration_seconds"],
            "frames_analyzed": raw_res["frames_analyzed"],
            "total_video_frames": raw_res.get("total_video_frames", raw_res["frames_analyzed"]),
            "truncated": raw_res["truncated"],
            "unique_workers": raw_res["unique_workers"],
            "compliant": raw_res["compliant"],
            "violations": raw_res["violations"],
            "workers": sanitize(raw_res["workers"]),
            "video_url": video_url,
            "video_codec": raw_res["video_codec"],
            "keyframes": keyframe_urls,
            "settings": sanitize(settings),
            "analyzed_by": analyzed_by
        }

        # Save to database
        save_video_analysis(final_res, analyzed_by=analyzed_by)

        video_jobs[job_id]["status"] = "done"
        video_jobs[job_id]["progress"] = 100
        video_jobs[job_id]["message"] = "Video analysis complete!"
        video_jobs[job_id]["result"] = final_res

    except Exception as e:
        traceback.print_exc()
        if job_id in video_jobs:
            video_jobs[job_id]["status"] = "failed"
            video_jobs[job_id]["message"] = f"Analysis failed: {str(e)}"
    finally:
        with video_job_lock:
            current_active_job_id = None
        # Clean up temporary uploaded file if distinct from output
        if os.path.exists(input_path) and not input_path.endswith(f"{job_id}.mp4"):
            try:
                os.remove(input_path)
            except Exception:
                pass

class SettingsModel(BaseModel):
    require_helmet: bool
    require_vest: bool
    require_mask: bool = False
    person_conf: float
    ppe_conf: float
    decision_conf: float

class LoginRequest(BaseModel):
    username: str
    password: str

class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str = "user"

class PasswordResetRequest(BaseModel):
    password: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    init_auth_db()
    if count_users() == 0:
        print("\n" + "=" * 70)
        print("WARNING: No users found in auth.db!")
        print("Please run 'python create_admin.py' to create the initial admin user.")
        print("=" * 70 + "\n")
    # Model warm-up on server startup
    try:
        dummy_img = np.zeros((300, 300, 3), dtype=np.uint8)
        analyze_image(dummy_img)
        print("Models warmed up")
    except Exception as e:
        print(f"Model warm-up error: {e}")
    yield

app = FastAPI(title="PPE Vision Safety API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def sanitize(val):
    if isinstance(val, (np.integer, int)):
        return int(val)
    if isinstance(val, (np.floating, float)):
        return float(val)
    if isinstance(val, (np.bool_, bool)):
        return bool(val)
    if isinstance(val, list):
        return [sanitize(item) for item in val]
    if isinstance(val, dict):
        return {k: sanitize(v) for k, v in val.items()}
    return val

# ----------------- Auth Dependencies -----------------

def require_user(request: Request) -> dict:
    session_token = request.cookies.get("ppe_session")
    if not session_token:
        raise HTTPException(status_code=401, detail="Authentication required")
    user = validate_session(session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Session expired or invalid")
    return user

def require_admin(user: dict = Depends(require_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return user

# ----------------- Static Outputs with Auth -----------------

@app.get("/outputs/{file_path:path}")
def serve_output_file(file_path: str, user: dict = Depends(require_user)):
    clean_subpath = os.path.normpath(file_path).lstrip("\\/")
    full_path = os.path.abspath(os.path.join(OUTPUTS_DIR, clean_subpath))
    if not full_path.startswith(os.path.abspath(OUTPUTS_DIR)):
        raise HTTPException(status_code=403, detail="Access denied")
    if not os.path.isfile(full_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(full_path)

# ----------------- Auth Endpoints -----------------

@app.post("/auth/login")
def login_endpoint(payload: LoginRequest, response: Response):
    username = payload.username.strip()
    password = payload.password

    # Rate limiting: 5 failed attempts in 5 minutes locks out for 5 minutes
    remaining = check_login_rate_limit(username)
    if remaining is not None:
        mins = max(1, (remaining + 59) // 60)
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed login attempts. Please wait {mins} minute(s) before trying again."
        )

    user = authenticate_user(username, password)
    if not user:
        record_failed_login(username)
        remaining_now = check_login_rate_limit(username)
        if remaining_now is not None:
            mins = max(1, (remaining_now + 59) // 60)
            raise HTTPException(
                status_code=429,
                detail=f"Too many failed login attempts. Please wait {mins} minute(s) before trying again."
            )
        raise HTTPException(status_code=401, detail="Invalid username or password")

    clear_failed_logins(username)
    token = create_session(user["id"])
    response.set_cookie(
        key="ppe_session",
        value=token,
        httponly=True,
        samesite="lax",
        path="/",
        max_age=8 * 3600
    )
    return {"username": user["username"], "role": user["role"]}

@app.post("/auth/logout")
def logout_endpoint(request: Request, response: Response):
    token = request.cookies.get("ppe_session")
    if token:
        delete_session(token)
    response.delete_cookie(key="ppe_session", path="/", samesite="lax")
    return {"message": "Logged out successfully"}

@app.get("/auth/me")
def me_endpoint(user: dict = Depends(require_user)):
    return {"username": user["username"], "role": user["role"]}

@app.get("/auth/users")
def list_users_endpoint(admin: dict = Depends(require_admin)):
    return list_users()

@app.post("/auth/users")
def create_user_endpoint(payload: CreateUserRequest, admin: dict = Depends(require_admin)):
    try:
        new_user = create_user(
            username=payload.username,
            password=payload.password,
            role=payload.role
        )
        return new_user
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/auth/users/{user_id}")
def delete_user_endpoint(user_id: int, admin: dict = Depends(require_admin)):
    ok, msg = delete_user(user_id, admin["id"])
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"message": msg}

@app.post("/auth/users/{user_id}/password")
def reset_password_endpoint(user_id: int, payload: PasswordResetRequest, admin: dict = Depends(require_admin)):
    try:
        reset_user_password(user_id, payload.password)
        return {"message": "Password updated successfully"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/auth/change-password")
def change_password_endpoint(payload: ChangePasswordRequest, user: dict = Depends(require_user)):
    ok, msg = change_user_password(user["id"], payload.current_password, payload.new_password)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"message": msg}

@app.get("/")
def root(user: dict = Depends(require_user)):
    return {
        "status": "online",
        "service": "PPE Vision Safety API",
        "docs_url": "/docs",
        "health_url": "/health",
        "dashboard_url": "http://localhost:5173"
    }

@app.get("/health")
def health_check():
    return {"status": "online"}

@app.get("/settings")
def get_settings_endpoint(user: dict = Depends(require_user)):
    return get_settings()

@app.put("/settings")
def update_settings_endpoint(payload: SettingsModel, admin: dict = Depends(require_admin)):
    if not (0.05 <= payload.person_conf <= 0.95):
        raise HTTPException(
            status_code=400,
            detail="person_conf must be between 0.05 and 0.95"
        )
    if not (0.05 <= payload.ppe_conf <= 0.95):
        raise HTTPException(
            status_code=400,
            detail="ppe_conf must be between 0.05 and 0.95"
        )
    if not (0.05 <= payload.decision_conf <= 0.95):
        raise HTTPException(
            status_code=400,
            detail="decision_conf must be between 0.05 and 0.95"
        )
    if not any([
        payload.require_helmet,
        payload.require_vest,
        payload.require_mask
    ]):
        raise HTTPException(
            status_code=400,
            detail="At least one PPE item must be required."
        )

    updated = save_settings(payload.model_dump())
    return updated

@app.post("/settings/reset")
def reset_settings_endpoint(admin: dict = Depends(require_admin)):
    return reset_settings()

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024 # 10 MB

@app.post("/analyze")
def analyze_endpoint(request: Request, file: UploadFile = File(...), user: dict = Depends(require_user)):
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded.")
        
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid file extension '{ext}'. Allowed extensions: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    file_bytes = file.file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File size exceeds maximum limit of 10 MB (Got {len(file_bytes) / (1024*1024):.2f} MB)."
        )

    np_arr = np.frombuffer(file_bytes, np.uint8)
    img_bgr = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if img_bgr is None or img_bgr.size == 0:
        raise HTTPException(status_code=400, detail="Could not decode image file or corrupted file.")

    current_settings = get_settings()

    try:
        analysis_result = analyze_image(img_bgr, settings=current_settings)
        annotated_img = annotate(img_bgr, analysis_result)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Analysis failed")

    analysis_id = uuid.uuid4().hex[:8]
    created_at = datetime.now(timezone.utc).isoformat()

    out_filename = f"{analysis_id}.jpg"
    out_filepath = os.path.join(OUTPUTS_DIR, out_filename)
    cv2.imwrite(out_filepath, annotated_img)

    sanitized_workers = sanitize(analysis_result["workers"])
    sanitized_settings = sanitize(current_settings)

    save_analysis(
        analysis_id=analysis_id,
        filename=file.filename,
        total=analysis_result["total"],
        compliant=analysis_result["compliant"],
        violations=analysis_result["violations"],
        image_path=out_filepath,
        workers=sanitized_workers,
        created_at=created_at,
        settings=current_settings,
        analyzed_by=user["username"]
    )

    base_url = str(request.base_url).rstrip("/")
    image_url = f"{base_url}/outputs/{out_filename}"

    return {
        "id": analysis_id,
        "filename": file.filename,
        "created_at": created_at,
        "total": sanitize(analysis_result["total"]),
        "compliant": sanitize(analysis_result["compliant"]),
        "violations": sanitize(analysis_result["violations"]),
        "workers": sanitized_workers,
        "settings": sanitized_settings,
        "image_url": image_url,
        "analyzed_by": user["username"]
    }

@app.post("/analyze-video")
def analyze_video_endpoint(request: Request, file: UploadFile = File(...), user: dict = Depends(require_user)):
    global current_active_job_id
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="No video file uploaded.")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid video format '{ext}'. Allowed formats: {', '.join(sorted(ALLOWED_VIDEO_EXTENSIONS))}"
        )

    file_bytes = file.file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded video file is empty.")

    if len(file_bytes) > MAX_VIDEO_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Video size exceeds maximum limit of 50 MB (Got {len(file_bytes) / (1024*1024):.2f} MB)."
        )

    with video_job_lock:
        if current_active_job_id is not None:
            active_job = video_jobs.get(current_active_job_id)
            if active_job and active_job.get("status") in ["queued", "processing"]:
                raise HTTPException(
                    status_code=429,
                    detail="Another video analysis job is currently running. Please wait for it to complete."
                )

        job_id = uuid.uuid4().hex[:8]
        current_active_job_id = job_id
        video_jobs[job_id] = {
            "status": "queued",
            "progress": 0,
            "message": "Video queued for processing...",
            "result": None
        }

    # Save uploaded bytes to temporary file for analysis
    temp_input_path = os.path.join(OUTPUTS_DIR, f"{job_id}_input{ext}")
    try:
        with open(temp_input_path, "wb") as f:
            f.write(file_bytes)
    except Exception as e:
        with video_job_lock:
            current_active_job_id = None
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded video: {str(e)}")

    current_settings = get_settings()
    base_url = str(request.base_url).rstrip("/")

    # Launch processing in a background worker thread
    worker_thread = threading.Thread(
        target=run_video_job,
        args=(job_id, temp_input_path, file.filename, current_settings, base_url, user["username"]),
        daemon=True
    )
    worker_thread.start()

    return {"job_id": job_id}

@app.get("/jobs/{job_id}")
def get_job_status_endpoint(job_id: str, user: dict = Depends(require_user)):
    if job_id in video_jobs:
        job = video_jobs[job_id]
        return {
            "status": job["status"],
            "progress": job["progress"],
            "message": job["message"],
            "result": job.get("result")
        }

    # Fallback to database if server restarted or job purged from memory
    db_record = get_video_analysis_by_id(job_id)
    if db_record:
        return {
            "status": "done",
            "progress": 100,
            "message": "Video analysis complete!",
            "result": db_record
        }

    raise HTTPException(status_code=404, detail="Job not found.")

@app.get("/video-history")
def video_history_list_endpoint(user: dict = Depends(require_user)):
    return list_video_analyses()

@app.get("/video-history/{analysis_id}")
def video_history_detail_endpoint(analysis_id: str, user: dict = Depends(require_user)):
    record = get_video_analysis_by_id(analysis_id)
    if not record:
        raise HTTPException(status_code=404, detail="Video analysis record not found.")
    return record

@app.get("/history")
def history_list_endpoint(request: Request, user: dict = Depends(require_user)):
    rows = list_analyses()
    base_url = str(request.base_url).rstrip("/")
    results = []
    for r in rows:
        out_filename = os.path.basename(r["image_path"])
        results.append({
            "id": r["id"],
            "filename": r["filename"],
            "created_at": r["created_at"],
            "total": sanitize(r["total"]),
            "compliant": sanitize(r["compliant"]),
            "violations": sanitize(r["violations"]),
            "image_url": f"{base_url}/outputs/{out_filename}",
            "analyzed_by": r.get("analyzed_by")
        })
    return results

@app.get("/history/{analysis_id}")
def history_detail_endpoint(request: Request, analysis_id: str, user: dict = Depends(require_user)):
    record = get_analysis(analysis_id)
    if not record:
        raise HTTPException(status_code=404, detail="Analysis record not found.")

    base_url = str(request.base_url).rstrip("/")
    out_filename = os.path.basename(record["image_path"])
    record["image_url"] = f"{base_url}/outputs/{out_filename}"
    del record["image_path"]
    
    record["total"] = sanitize(record["total"])
    record["compliant"] = sanitize(record["compliant"])
    record["violations"] = sanitize(record["violations"])
    record["workers"] = sanitize(record["workers"])
    if "settings" in record:
        record["settings"] = sanitize(record["settings"])
    
    return record

@app.get("/stats")
def stats_endpoint(user: dict = Depends(require_user)):
    return get_stats()

# =====================================================================
# Phase 14: Near-Real-Time Live Monitoring & Alerts
# =====================================================================

@app.post("/live/start")
def live_start_endpoint(user: dict = Depends(require_user)):
    clean_idle_sessions()
    session_id = uuid.uuid4().hex[:12]
    with live_sessions_lock:
        live_sessions[session_id] = LiveSession(session_id)
    return {"session_id": session_id}

@app.post("/live/frame")
def live_frame_endpoint(
    request: Request,
    session_id: str = Form(...),
    file: UploadFile = File(...),
    user: dict = Depends(require_user)
):
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="Missing frame file")
    
    try:
        content = file.file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Empty frame")
        nparr = np.frombuffer(content, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise HTTPException(status_code=400, detail="Could not decode frame image")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read image frame: {str(e)}")

    clean_idle_sessions()
    with live_sessions_lock:
        session = live_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Live session not found or expired")

    try:
        start_time = time.perf_counter()
        session.last_activity = time.time()

        # Downscale to at most 960 px on the longest side
        h, w = img.shape[:2]
        max_dim = max(h, w)
        if max_dim > 960:
            scale = 960.0 / float(max_dim)
            new_w = max(1, int(round(w * scale)))
            new_h = max(1, int(round(h * scale)))
            img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)

        # Get current settings
        settings = get_settings()
        person_conf = float(settings.get("person_conf", 0.40))
        ppe_conf = float(settings.get("ppe_conf", 0.25))
        decision_conf = float(settings.get("decision_conf", 0.30))
        require_helmet = bool(settings.get("require_helmet", True))
        require_vest = bool(settings.get("require_vest", True))
        require_mask = bool(settings.get("require_mask", False))

        # Detect workers
        boxes = detect_workers(img, person_conf=person_conf)

        # Assign track ids with session tracker
        tracked = session.tracker.update(boxes)

        annotated = img.copy()
        workers = []
        worker_eval_list = []
        compliant_count = 0
        violations_count = 0

        # Evaluate compliance for each tracked worker
        for item in tracked:
            track_id = item["track_id"]
            box = item["box"]

            # Per-worker PPE check (slower mask check only when require_mask is True)
            ppe_info = check_ppe(
                img,
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
                compliant_count += 1
            else:
                violations_count += 1

            w_dict = {
                "track_id": track_id,
                "status": status,
                "missing": missing,
                "box": box
            }
            workers.append(w_dict)
            worker_eval_list.append((track_id, box, status, missing, ppe_info))

            # Draw worker label on annotated frame (use draw_worker_label, label text "Worker <track_id>")
            color = (0, 200, 0) if status == "COMPLIANT" else (0, 0, 220)
            lines = [f"Worker {track_id}", status]
            if require_helmet or ppe_info.get("helmet"):
                lines.append(f"Helmet OK ({ppe_info.get('helmet_conf', 0.0):.2f})" if ppe_info.get("helmet") else "No Helmet")
            if require_vest or ppe_info.get("vest"):
                lines.append(f"Vest OK ({ppe_info.get('vest_conf', 0.0):.2f})" if ppe_info.get("vest") else "No Vest")
            if require_mask or ppe_info.get("mask"):
                lines.append(f"Mask OK ({ppe_info.get('mask_conf', 0.0):.2f})" if ppe_info.get("mask") else "No Mask")

            draw_worker_label(annotated, box, lines, color)

        # Alert evaluation: smoothing rule
        # A worker track raises an alert when it was NON-COMPLIANT in at least 3 of its last 5 observed frames.
        # Raise it once per track and per missing-item set, then apply a 30-second cooldown for that track.
        new_alerts = []
        for track_id, box, status, missing, ppe_info in worker_eval_list:
            if track_id not in session.track_history:
                session.track_history[track_id] = collections.deque(maxlen=5)
            session.track_history[track_id].append(status)

            nc_count = sum(1 for s in session.track_history[track_id] if s == "NON-COMPLIANT")
            if nc_count >= 3 and status == "NON-COMPLIANT" and missing:
                now = time.time()
                last_time = session.track_last_alert_time.get(track_id, 0.0)
                curr_missing_set = frozenset(missing)

                if now - last_time >= 30.0:
                    session.track_last_alert_time[track_id] = now
                    session.track_last_alert_missing[track_id] = curr_missing_set

                    alert_id = uuid.uuid4().hex[:8]
                    msg = f"Worker {track_id} missing {', '.join(missing)}"
                    created_at = datetime.now(timezone.utc).isoformat()
                    snapshot_filename = f"{alert_id}.jpg"
                    snapshot_file_path = os.path.join(ALERTS_DIR, snapshot_filename)
                    cv2.imwrite(snapshot_file_path, annotated)

                    snapshot_path = f"/outputs/alerts/{snapshot_filename}"
                    alert_rec = {
                        "id": alert_id,
                        "created_at": created_at,
                        "session_id": session_id,
                        "track_id": track_id,
                        "missing_items": missing,
                        "snapshot_path": snapshot_path,
                        "message": msg
                    }
                    save_alert(alert_rec)
                    new_alerts.append(alert_rec)

        # Base64 JPEG data URL for annotated image
        encode_ok, buf = cv2.imencode('.jpg', annotated, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        if encode_ok:
            b64_str = base64.b64encode(buf).decode('utf-8')
            data_url = f"data:image/jpeg;base64,{b64_str}"
        else:
            data_url = ""

        processing_ms = round((time.perf_counter() - start_time) * 1000, 1)

        return {
            "total": len(workers),
            "compliant": compliant_count,
            "violations": violations_count,
            "workers": sanitize(workers),
            "annotated_image": data_url,
            "new_alerts": sanitize(new_alerts),
            "processing_ms": processing_ms
        }
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Frame analysis failed")

@app.post("/live/stop")
async def live_stop_endpoint(request: Request, user: dict = Depends(require_user)):
    sid = request.query_params.get("session_id")
    if not sid:
        content_type = request.headers.get("content-type", "")
        if "application/json" in content_type:
            try:
                body = await request.json()
                sid = body.get("session_id")
            except Exception:
                pass
        elif "multipart/form-data" in content_type or "application/x-www-form-urlencoded" in content_type:
            try:
                form = await request.form()
                sid = form.get("session_id")
            except Exception:
                pass
    clean_idle_sessions()
    with live_sessions_lock:
        if sid and sid in live_sessions:
            del live_sessions[sid]
    return {"status": "stopped", "session_id": sid}

@app.get("/alerts")
def get_alerts_endpoint(limit: int = 50, user: dict = Depends(require_user)):
    return list_alerts(limit=limit)

@app.get("/alerts/{alert_id}")
def get_alert_by_id_endpoint(alert_id: str, user: dict = Depends(require_user)):
    alert = get_alert(alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert

@app.post("/alerts/clear")
def clear_alerts_endpoint(admin: dict = Depends(require_admin)):
    snapshot_paths = clear_alerts()
    deleted_files = 0
    for sp in snapshot_paths:
        clean = sp.lstrip("/").replace("outputs/", "", 1)
        fp = os.path.join(OUTPUTS_DIR, clean)
        if os.path.exists(fp):
            try:
                os.remove(fp)
                deleted_files += 1
            except Exception:
                pass
    if os.path.exists(ALERTS_DIR):
        for f in os.listdir(ALERTS_DIR):
            if f.endswith(".jpg"):
                try:
                    os.remove(os.path.join(ALERTS_DIR, f))
                except Exception:
                    pass
    return {"status": "cleared", "deleted_alerts": len(snapshot_paths), "deleted_files": deleted_files}

