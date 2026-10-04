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

from database import init_db, save_analysis, list_analyses, get_analysis, get_stats
from pipeline import analyze_image, annotate

OUTPUTS_DIR = os.path.join(os.path.dirname(__file__), "outputs")
os.makedirs(OUTPUTS_DIR, exist_ok=True)

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

    try:
        analysis_result = analyze_image(img_bgr)
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

    save_analysis(
        analysis_id=analysis_id,
        filename=file.filename,
        total=analysis_result["total"],
        compliant=analysis_result["compliant"],
        violations=analysis_result["violations"],
        image_path=out_filepath,
        workers=sanitized_workers,
        created_at=created_at
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
        "image_url": image_url
    }

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
    
    return record

@app.get("/stats")
def stats_endpoint():
    return get_stats()
