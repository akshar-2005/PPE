import os
import uuid
import cv2
import numpy as np
import traceback
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

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
    get_video_analysis_by_id
)
from pipeline import analyze_image, annotate
from video_pipeline import analyze_video
import threading

OUTPUTS_DIR = os.path.join(os.path.dirname(__file__), "outputs")
os.makedirs(OUTPUTS_DIR, exist_ok=True)

# Video background job tracking
video_jobs: dict = {}
video_job_lock = threading.Lock()
current_active_job_id = None

ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".webm"}
MAX_VIDEO_SIZE = 50 * 1024 * 1024 # 50 MB

def run_video_job(job_id: str, input_path: str, filename: str, settings: dict, base_url: str):
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
            "settings": sanitize(settings)
        }

        # Save to database
        save_video_analysis(final_res)

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

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
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
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/outputs", StaticFiles(directory=OUTPUTS_DIR), name="outputs")

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

@app.get("/health")
def health_check():
    return {"status": "online"}

@app.get("/settings")
def get_settings_endpoint():
    return get_settings()

@app.put("/settings")
def update_settings_endpoint(payload: SettingsModel):
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
def reset_settings_endpoint():
    return reset_settings()

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024 # 10 MB

@app.post("/analyze")
def analyze_endpoint(request: Request, file: UploadFile = File(...)):
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
        settings=current_settings
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
        "image_url": image_url
    }

@app.post("/analyze-video")
def analyze_video_endpoint(request: Request, file: UploadFile = File(...)):
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
        args=(job_id, temp_input_path, file.filename, current_settings, base_url),
        daemon=True
    )
    worker_thread.start()

    return {"job_id": job_id}

@app.get("/jobs/{job_id}")
def get_job_status_endpoint(job_id: str):
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
def video_history_list_endpoint():
    return list_video_analyses()

@app.get("/video-history/{analysis_id}")
def video_history_detail_endpoint(analysis_id: str):
    record = get_video_analysis_by_id(analysis_id)
    if not record:
        raise HTTPException(status_code=404, detail="Video analysis record not found.")
    return record

@app.get("/history")
def history_list_endpoint(request: Request):
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
            "image_url": f"{base_url}/outputs/{out_filename}"
        })
    return results

@app.get("/history/{analysis_id}")
def history_detail_endpoint(request: Request, analysis_id: str):
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
def stats_endpoint():
    return get_stats()
