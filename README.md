# PPE Vision Safety

PPE Vision Safety is an AI workplace safety monitoring system designed for industrial environments.
It automatically detects every worker in an image, video, or near-real-time stream, isolates each person, and evaluates mandatory safety gear individually.
Each detected worker is marked COMPLIANT or NON-COMPLIANT according to active site rules, with audit records and telemetry displayed on an administrative web dashboard.

---

## Features

- Image analysis: Detects individual workers, verifies helmet and safety vest wear, and outputs annotated bounding boxes and gear badges.
- Optional mask detection: Dedicated face mask verification on an upscaled head crop, disabled by default and configurable via Settings.
- Video analysis: Samples frames, tracks workers across time using a motion-predicted tracker, aggregates per-worker gear compliance, and extracts annotated keyframes.
- Settings: Configurable mandates for helmets, vests, and masks, alongside threshold sliders for person detection, PPE inference, and decision boundaries.
- History and audit logging: Persistent SQLite records of past single-image and video inspections with worker breakdowns, configuration snapshots, and output media links.
- Dashboard and reports: Overview metrics with compliance charts, detailed inspection tables, filterable violation summaries, CSV data export, and print-ready reports.
- User interface: Dark executive design, responsive navigation, toast notifications, loading skeletons, and a full-screen image viewer.
- Live monitoring with alerts: Near-real-time stream analysis supporting webcam input or client-side video file simulation, smoothed alerts requiring non-compliance across 3 of 5 observed frames, 30-second per-track cooldowns, audio beeps with mute control, and an alerts audit log.

---

## Architecture

```text
+-----------------------+
|   User Media Upload   |
+-----------+-----------+
            |
            v
+-----------------------+      HTTP POST      +------------------------+
| React Dashboard       | ------------------> | FastAPI Backend Server |
| (Vite + TypeScript)   |   multipart/data    +-----------+------------+
+-----------------------+                                 |
                                                          v
                                              +------------------------+
                                              | Person Detection       |
                                              | (YOLOv8n)              |
                                              +-----------+------------+
                                                          |
                                                          v
                                              +------------------------+
                                              | Worker Crop Padding    |
                                              | (5% expansion)         |
                                              +-----------+------------+
                                                          |
                                                          v
                                              +------------------------+
                                              | PPE Model (ppe.pt)     |
                                              | + Mask Model (mask.pt) |
                                              +-----------+------------+
                                                          |
                                                          v
                                              +------------------------+
                                              | Body-Region Filter &   |
                                              | Compliance Logic       |
                                              +-----------+------------+
                                                          |
                                                          v
+-----------------------+     JSON + Media    +------------------------+
| Dashboard Visualizer  | <------------------ | Annotated Outputs &    |
| & Live Alert Feed     |                     | Database Persistence   |
+-----------------------+                     +------------------------+
```

Video analysis path: Frame sampling at 4 fps -> motion-predicted IoU tracker -> per-worker temporal aggregation with a 60% presence rule -> annotated video render (avc1/mp4v) and keyframe extraction.

---

## Models

All models used in this repository are pretrained checkpoints created by third-party authors and were not trained by the authors of this project:

- `models/yolov8n.pt`: YOLOv8 Nano object detection model pretrained on the COCO dataset by Ultralytics. Used solely for detecting the person class (Class 0).
- `models/ppe.pt`: Fine-tuned YOLOv8 model for hardhat and safety vest detection on worker crops. Sourced from `huggingface.co/ayushgupta7777/safetyvision-yolov8` under the MIT License.
- `models/mask.pt`: Fine-tuned YOLOv8 model for face mask detection on upscaled worker head crops. Sourced from `Hansung-Cho/yolov8-ppe-detection` on Hugging Face under the MIT License.

---

## How Per-Worker PPE Association Works

1. Person detection: The primary person model (`yolov8n.pt`) detects all individuals in the frame at `person_conf = 0.40`. Bounding boxes are sorted left-to-right.
2. Worker cropping: Each worker bounding box is expanded by 5% padding in width and height (clamped strictly within image boundaries) to capture protective equipment worn near edges.
3. PPE detection: The PPE model (`ppe.pt`) runs inference on the worker crop at `ppe_conf = 0.25`.
4. Body-region spatial filtering: Detections are filtered based on their relative vertical center coordinate (`rel_y`) within the unpadded person bounding box:
   - Helmet: Center must fall within the top 45% of the person box (`-0.15 <= rel_y <= 0.45`).
   - Safety vest: Center must fall between 10% and 75% of the person box height (`0.10 <= rel_y <= 0.75`).
   - Face mask (if enabled): A dedicated head crop (top 40% of the person with 5% vertical and 8% horizontal padding) is upscaled to 640 px and evaluated by `mask.pt`.
5. Confidence disambiguation: A positive class prediction counts only if its confidence satisfies `positive_conf >= decision_conf` (default 0.30) and strictly exceeds the corresponding negative class confidence (`positive_conf > negative_conf`).
6. Compliance evaluation: A worker is marked COMPLIANT only if every currently mandated gear item is satisfied. Unmandated gear is detected and rendered without triggering non-compliance violations.

---

## Technology Stack

- Python 3.12
- FastAPI and Uvicorn
- Ultralytics YOLOv8 and PyTorch
- OpenCV (`cv2`)
- SQLite3
- React 19
- TypeScript
- Tailwind CSS
- Vite

---

## Setup and Run

Ensure Python 3.10+ and Node.js 18+ are installed. Verify that `backend/models/` contains `yolov8n.pt`, `ppe.pt`, and `mask.pt`.

If any model weights are missing:
- `yolov8n.pt`: Download from `https://github.com/ultralytics/assets/releases/download/v8.2.0/yolov8n.pt`
- `ppe.pt`: Download from `https://huggingface.co/ayushgupta7777/safetyvision-yolov8/resolve/main/best.pt` and place as `backend/models/ppe.pt`
- `mask.pt`: Download from `https://huggingface.co/Hansung-Cho/yolov8-ppe-detection/resolve/main/best.pt` and place as `backend/models/mask.pt`

### Option 1: One-Click Launcher (Windows)
Double-click `start_demo.bat` in the project root to start the backend, frontend, and browser dashboard.

### Option 2: Manual Terminal Setup

Backend:
```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --port 8000
```

Frontend:
```powershell
cd frontend
npm install
npm run dev
```

The frontend interface runs at `http://localhost:5173`, and the FastAPI backend runs at `http://127.0.0.1:8000`.

---

## API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/` | Root endpoint displaying API status and links to documentation and frontend dashboard. |
| `GET` | `/health` | Health check endpoint returning online status. |
| `GET` | `/settings` | Retrieve active PPE mandates and detection confidence thresholds. |
| `PUT` | `/settings` | Update PPE mandates and confidence thresholds with validation. |
| `POST` | `/settings/reset` | Reset PPE mandates and thresholds to system default values. |
| `POST` | `/analyze` | Analyze an uploaded image for worker detection, PPE verification, and compliance. |
| `POST` | `/analyze-video` | Submit a video file for background frame sampling, worker tracking, and compliance. |
| `GET` | `/jobs/{job_id}` | Poll background processing progress and retrieval status of a video analysis job. |
| `GET` | `/video-history` | List all completed video analysis records ordered by date. |
| `GET` | `/video-history/{analysis_id}` | Retrieve full details, tracked worker metrics, and keyframes for a video analysis. |
| `GET` | `/history` | List all historical single-image analysis inspection records. |
| `GET` | `/history/{analysis_id}` | Retrieve comprehensive inspection details, worker data, and annotated image URL. |
| `GET` | `/stats` | Return aggregate inspection statistics including totals and overall compliance rate. |
| `POST` | `/live/start` | Initialize a near-real-time live monitoring session with an isolated tracker instance. |
| `POST` | `/live/frame` | Ingest a live image frame, perform tracking, verify PPE, and evaluate smoothing alert triggers. |
| `POST` | `/live/stop` | Terminate an active live monitoring session and release associated tracker resources. |
| `GET` | `/alerts` | List historical safety violation alerts with snapshot paths and timestamps (supports `limit`). |
| `GET` | `/alerts/{alert_id}` | Retrieve a single safety alert record by its unique identifier. |
| `POST` | `/alerts/clear` | Clear all stored safety violation alerts from the database and delete snapshot images from disk. |

---

## Testing

The project includes sample test images in `demo_images/` (`1_mixed.png`, `2_all_compliant.png`, `3_no_ppe.png`, etc.) for manual verification through the web dashboard.

Automated helper and test scripts located in `backend/`:
- `test_pipeline.py`: Runs image detection and PPE evaluation across `backend/test_images/` and outputs annotated images to `outputs/`.
- `test_api.py`: Validates FastAPI image endpoints, upload mechanisms, and response schemas.
- `evaluate_ppe.py`: Compares PPE detection predictions against local ground-truth annotations.
- `evaluate_mask.py`: Evaluates precision and recall of the mask detection model on head crops.
- `test_tracker.py`: Unit tests for the IoU tracker covering motion prediction, track ID stability, and crossing paths.
- `test_video_flow.py`: End-to-end test of the asynchronous video analysis background worker and database logging.
- `test_crossing_video.py`: Tests tracking continuity on pedestrian crossing test footage.
- `test_phase14.py`: Integration test suite validating live session lifecycle, alert smoothing rules, 30-second cooldown enforcement, and inference latency.

---

## Known Limitations

- Pretrained model accuracy: Models are pretrained on public datasets and lack a formal domain-specific accuracy benchmark; verification is based on local test image sets.
- Mask evaluation scope: Mask detection precision and recall were evaluated on a small set of sample test images.
- Environmental sensitivity: Poor lighting, specular reflections, camera distance, and partial body occlusions can cause missed or spurious detections.
- Frame rate tracking: At lower sampling rates (2 to 4 fps), rapid worker movement or overlapping trajectories can result in track ID swaps.
- Video container encoding: Rendered output videos default to the `mp4v` codec when `avc1` is unavailable on the host OpenCV installation; some browsers cannot play `mp4v` inline (use the Download button or inspect extracted keyframes).
- CPU processing throughput: Near-real-time live monitoring latency depends on host CPU capability (~166 ms per frame for helmet and vest, ~1.05s per frame with mask verification active).
- Unsupported protective equipment: Specialized gear such as safety gloves, protective goggles, hearing protection, and safety boots are not supported by the current models.

---

## Future Scope

- Dedicated detection models for safety gloves and eye goggles trained on domain-specific datasets.
- User authentication and role-based access control (RBAC) for safety officers and site administrators.
- Cloud deployment and containerization utilizing Docker and Kubernetes.
- Database migration from SQLite to PostgreSQL for multi-node deployments.
- Formal accuracy and mean average precision (mAP) benchmarking across standardized industrial safety datasets.

---

## Credits and Licenses

- Ultralytics YOLOv8 (`yolov8n.pt`): AGPL-3.0 License.
- SafetyVision PPE Model (`ppe.pt`): Released under the MIT License by Ayush Gupta (`huggingface.co/ayushgupta7777/safetyvision-yolov8`).
- PPE Mask Detection Model (`mask.pt`): Released under the MIT License by Hansung Cho (`huggingface.co/Hansung-Cho/yolov8-ppe-detection`).
- Test footage: Warehouse pedestrian test clips from open-license computer vision repositories.
