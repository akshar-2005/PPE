# PPE Vision Safety

**PPE Vision Safety** is a real-time computer vision monitoring system designed to enforce Personal Protective Equipment compliance on industrial worksites.
It automatically detects personnel using YOLO object detection, isolates individual workers, and verifies mandatory hardhat and safety vest compliance.
The system provides a modern web dashboard for live inspection analysis, compliance metrics tracking, customizable rule configuration, and historical audit logging.

---

## 🌟 Key Features

- **Automated Worker & PPE Detection**: Detects persons and analyzes headgear (hardhats) and torso wear (safety vests).
- **Per-Worker Region Filtering**: Crops worker regions and applies body-proportional spatial constraints (top 45% for helmets, 10%–75% for vests) to eliminate false detections from adjacent workers.
- **Negative-Class Disambiguation**: Evaluates both positive (`Hardhat`, `Safety Vest`) and negative (`NO-Hardhat`, `NO-Safety Vest`) predictions for maximum accuracy.
- **Configurable Settings**: Choose required PPE mandates (helmet and/or vest), adjust person, PPE, and decision confidence thresholds, with the active settings snapshot stored alongside each inspection.
- **Reports & Exporting**: Dedicated Reports page with aggregate compliance stats, violation breakdown (missing helmet only, vest only, or both), full inspection log table, one-click CSV export of summary and worker details, and a clean print view.
- **Real-Time API & Database Persistence**: Powered by FastAPI and SQLite to log inspection history, worker breakdown, configuration snapshots, and annotated images.
- **Modern UI Features**: Executive React dashboard with live telemetry (`ONLINE`/`OFFLINE`), toast notifications, full-screen image viewer lightbox, responsive layout with mobile drawer navigation, and loading skeletons with animated counters.

---

## 🏗️ System Architecture

```text
+------------------------+
|   User Image Upload    |
+-----------+------------+
            |
            v
+------------------------+      HTTP POST      +------------------------+
| React Dashboard (Vite) | ------------------> | FastAPI Backend Server |
+------------------------+    multipart/file   +-----------+------------+
                                                           |
                                                           v
                                               +------------------------+
                                               | Person Model (YOLOv8n) |
                                               +-----------+------------+
                                                           |
                                                           v
                                               +------------------------+
                                               |  Worker Crop Padding   |
                                               +-----------+------------+
                                                           |
                                                           v
                                               +------------------------+
                                               |   PPE Model (ppe.pt)   |
                                               +-----------+------------+
                                                           |
                                                           v
                                               +------------------------+
                                               |  Body-Region Filtering |
                                               +-----------+------------+
                                                           |
                                                           v
                                               +------------------------+
                                               |   Compliance Rules     |
                                               |  (Dynamic Settings)    |
                                               +-----------+------------+
                                                           |
                                                           v
+------------------------+      JSON Result    +------------------------+
| Dashboard Visualizer   | <------------------ | Bounding Box Annotator |
+------------------------+   + Image URL       +------------------------+
```

---

## 🛠️ Technology Stack

- **Computer Vision & AI**: Ultralytics YOLOv8 (`yolov8n.pt`, `ppe.pt`), OpenCV (`cv2`), PyTorch, NumPy
- **Backend API**: Python 3, FastAPI, Uvicorn, SQLite3
- **Frontend Dashboard**: React 18, TypeScript, Vite, TailwindCSS, React Router DOM v6, Lucide React Icons

---

## 🔍 How Per-Worker PPE Association Works

1. **Person Detection**: The primary YOLO model (`yolov8n.pt`) detects all workers in the image and orders them left-to-right by bounding box X-coordinates ($x_1$).
2. **Dynamic Worker Cropping**: Each worker bounding box $[x_1, y_1, x_2, y_2]$ is expanded with a 5% margin (clamped to image boundaries) to capture edge gear.
3. **Targeted PPE Detection**: The fine-tuned PPE model (`ppe.pt`) runs inference on the cropped worker image.
4. **Body-Region Spatial Filtering**:
   - **Helmet / Hardhat**: Center of detection must fall within the top 45% of the person box height ($-0.15 \le y_{rel} \le 0.45$).
   - **Safety Vest**: Center of detection must fall between 10% and 75% of the person box height ($0.10 \le y_{rel} \le 0.75$).
   - Detections outside these proportional body regions are discarded.
5. **Confidence & Dynamic Compliance Evaluation**:
   - $\text{Helmet Detected} = (\text{PosConf} \ge \text{decision\_conf}) \land (\text{PosConf} > \text{NegConf})$
   - $\text{Vest Detected} = (\text{PosConf} \ge \text{decision\_conf}) \land (\text{PosConf} > \text{NegConf})$
   - A worker is marked **COMPLIANT** if all *mandated* items (`require_helmet`, `require_vest`) are satisfied. Unmandated gear is detected and displayed without triggering violations.

---

## 🚀 Setup & Execution Instructions

### Option 1: One-Click Demo Launcher (Recommended)

Simply double-click `start_demo.bat` in the project root. It will:
1. Launch the FastAPI backend server on port `8000`.
2. Launch the React frontend server on port `5173`.
3. Open `http://localhost:5173` in your default web browser.

To reset inspection history and output images, run `reset_demo.bat` (ensure backend is stopped).

---

### Option 2: Manual Setup

#### 1. Backend Server

```powershell
# Navigate to backend
cd backend

# Create & activate virtual environment (Windows PowerShell)
python -m venv venv
.\venv\Scripts\Activate.ps1

# Install requirements
pip install -r requirements.txt

# Start backend server
uvicorn main:app --port 8000
```

#### 2. Frontend Application

```powershell
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Start Vite dev server
npm run dev
```

---

## 📡 API Endpoints Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Server liveness check (`{"status": "online"}`) |
| `POST` | `/analyze` | Accepts multipart image file (`file`), executes AI pipeline against current settings, saves annotated output, and returns JSON analysis |
| `GET` | `/history` | Returns list of past analyses ordered newest first |
| `GET` | `/history/{id}` | Returns full inspection record including detailed `workers` array and settings snapshot |
| `GET` | `/stats` | Returns aggregate metrics (`total_analyses`, `total_workers`, `total_compliant`, `total_violations`, `compliance_rate`) |
| `GET` | `/settings` | Returns active compliance thresholds and required PPE mandates (`require_helmet`, `require_vest`, `person_conf`, `ppe_conf`, `decision_conf`) |
| `PUT` | `/settings` | Updates compliance thresholds (`0.05`–`0.95`) and required PPE mandates (validates at least one gear required) |
| `POST` | `/settings/reset` | Resets configuration settings back to default factory values |
| `GET` | `/outputs/{file}` | Serves annotated inspection images |

---

## 💳 Model Credits & Licensing

- **Person Detection Model**: Official Ultralytics YOLOv8 Nano (`yolov8n.pt`)
- **PPE Detection Model**: Pretrained YOLOv8 fine-tuned for workplace safety (`ppe.pt`)
  - **Source Repository**: [`ayushgupta7777/safetyvision-yolov8`](https://huggingface.co/ayushgupta7777/safetyvision-yolov8)
  - **License**: MIT License

---

## ⚠️ Known Limitations

1. **Extreme Occlusions**: Severe lower-body or torso occlusions (e.g. workers behind heavy machinery) may block vest detection regions.
2. **Lighting & Surface Glare**: Intense reflections or dark shadow environments may reduce detection confidence below the configured decision threshold.
3. **Supported Gear**: Currently monitors **Hardhats** and **Safety Vests** (gloves, goggles, and boots are ignored in current compliance status rules).

---

## 🔮 Future Scope

- **Expanded PPE Detection**: Support for safety goggles, work gloves, harnesses, and steel-toe boots.
- **Live Video & CCTV Integration**: Real-time RTSP video stream analysis with automatic violation snapshot triggers.
- **Alert Notifications**: Telegram / Email / Webhook instant alerts to site safety managers upon non-compliance.
- **Role-Based Access Control**: Multi-tenant team roles and auditor authentication.
- **Cloud & Edge Deployment**: Containerized Docker setup for AWS/GCP edge deployment.
