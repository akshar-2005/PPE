import os
import cv2
import numpy as np
from ultralytics import YOLO

# 1. Config constants (Defaults)
DEFAULT_PERSON_CONF = 0.40
DEFAULT_PPE_CONF = 0.25          # model-level, low on purpose
DEFAULT_DECISION_CONF = 0.30     # minimum confidence for a positive PPE class to count
HELMET_KEYS = ["hardhat", "helmet"]
VEST_KEYS = ["vest"]
MAX_IMAGE_DIM = 1600

DEFAULT_SETTINGS = {
    "require_helmet": True,
    "require_vest": True,
    "require_mask": False,
    "person_conf": DEFAULT_PERSON_CONF,
    "ppe_conf": DEFAULT_PPE_CONF,
    "decision_conf": DEFAULT_DECISION_CONF
}

# Load models ONCE at module level
PERSON_MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "yolov8n.pt")
PPE_MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "ppe.pt")
MASK_MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "mask.pt")

person_model = YOLO(PERSON_MODEL_PATH)
ppe_model = YOLO(PPE_MODEL_PATH)
mask_model = YOLO(MASK_MODEL_PATH)


# Helper to downscale large images keeping aspect ratio
def resize_if_large(img_bgr, max_dim=MAX_IMAGE_DIM):
    if img_bgr is None or img_bgr.size == 0:
        return img_bgr
    h, w = img_bgr.shape[:2]
    if max(h, w) > max_dim:
        scale = max_dim / float(max(h, w))
        new_w = max(1, int(w * scale))
        new_h = max(1, int(h * scale))
        img_bgr = cv2.resize(img_bgr, (new_w, new_h), interpolation=cv2.INTER_AREA)
    return img_bgr


# 2. Helper to classify helmet/vest classes
def classify_class(cls_name: str):
    clean = cls_name.lower().replace("-", " ").replace("_", " ").strip()
    is_neg = clean.startswith("no ") or clean.startswith("no_")
    
    is_helmet = any(k in clean for k in HELMET_KEYS)
    is_vest = any(k in clean for k in VEST_KEYS)
    
    cat = None
    if is_helmet:
        cat = "helmet"
    elif is_vest:
        cat = "vest"
        
    return cat, is_neg


# 3. Function detect_workers(img_bgr, person_conf)
def detect_workers(img_bgr, person_conf=DEFAULT_PERSON_CONF):
    results = person_model(img_bgr, classes=[0], conf=person_conf, verbose=False)[0]
    boxes = []
    if results.boxes is not None:
        for b in results.boxes:
            x1, y1, x2, y2 = b.xyxy[0].tolist()
            boxes.append([int(x1), int(y1), int(x2), int(y2)])
    # Sort left to right by x1
    boxes.sort(key=lambda b: b[0])
    return boxes


# 4. Function check_ppe(img_bgr, box, ppe_conf, decision_conf)
def check_ppe(img_bgr, box, ppe_conf=DEFAULT_PPE_CONF, decision_conf=DEFAULT_DECISION_CONF):
    img_h, img_w = img_bgr.shape[:2]
    x1, y1, x2, y2 = box
    w = x2 - x1
    h = y2 - y1
    person_h = max(1, h)
    person_w = max(1, w)

    # 5% padding clamped to image bounds for worker crop
    pad_w = int(w * 0.05)
    pad_h = int(h * 0.05)
    
    crop_x1 = max(0, x1 - pad_w)
    crop_y1 = max(0, y1 - pad_h)
    crop_x2 = min(img_w, x2 + pad_w)
    crop_y2 = min(img_h, y2 + pad_h)
    
    crop = img_bgr[crop_y1:crop_y2, crop_x1:crop_x2]
    
    if crop.size == 0:
        return {
            "helmet": False,
            "vest": False,
            "mask": False,
            "helmet_conf": 0.0,
            "vest_conf": 0.0,
            "mask_conf": 0.0
        }

    # 1. Primary PPE model on worker crop for Helmet & Vest
    ppe_results = ppe_model(crop, conf=ppe_conf, verbose=False)[0]
    
    helmet_pos_confs = []
    helmet_neg_confs = []
    vest_pos_confs = []
    vest_neg_confs = []
    
    if ppe_results.boxes is not None:
        for b in ppe_results.boxes:
            cls_id = int(b.cls[0].item())
            cls_name = ppe_model.names.get(cls_id, str(cls_id))
            conf = float(b.conf[0].item())
            
            # Box in crop coordinates
            cx1, cy1, cx2, cy2 = b.xyxy[0].tolist()
            cy_center = (cy1 + cy2) / 2.0
            
            # Center in original unpadded person box Y ratio
            global_cy = crop_y1 + cy_center
            rel_y = (global_cy - y1) / float(person_h)
            
            cat, is_neg = classify_class(cls_name)
            
            if cat == "helmet":
                # Body-region filter: center in top 45% of person box
                if -0.15 <= rel_y <= 0.45:
                    if is_neg:
                        helmet_neg_confs.append(conf)
                    else:
                        helmet_pos_confs.append(conf)
            elif cat == "vest":
                # Body-region filter: center between 10% and 75% of person box height
                if 0.10 <= rel_y <= 0.75:
                    if is_neg:
                        vest_neg_confs.append(conf)
                    else:
                        vest_pos_confs.append(conf)

    pos_h_conf = max(helmet_pos_confs) if helmet_pos_confs else 0.0
    neg_h_conf = max(helmet_neg_confs) if helmet_neg_confs else 0.0
    helmet_ok = (pos_h_conf >= decision_conf) and (pos_h_conf > neg_h_conf)

    pos_v_conf = max(vest_pos_confs) if vest_pos_confs else 0.0
    neg_v_conf = max(vest_neg_confs) if vest_neg_confs else 0.0
    vest_ok = (pos_v_conf >= decision_conf) and (pos_v_conf > neg_v_conf)

    # 2. Dedicated mask model on upscaled head crop (top 40% with padding, upscaled to >=640px)
    head_y1 = max(0, y1 - int(person_h * 0.05))
    head_y2 = min(img_h, y1 + int(person_h * 0.40))
    head_x1 = max(0, x1 - int(person_w * 0.08))
    head_x2 = min(img_w, x2 + int(person_w * 0.08))
    head_crop = img_bgr[head_y1:head_y2, head_x1:head_x2]
    
    mask_pos_confs = []
    mask_neg_confs = []

    if head_crop.size > 0:
        scale_head = 640.0 / max(head_crop.shape[:2])
        head_up = cv2.resize(head_crop, (int(head_crop.shape[1] * scale_head), int(head_crop.shape[0] * scale_head)))
        res_head_mask = mask_model(head_up, conf=0.05, verbose=False)[0]
        if res_head_mask.boxes is not None:
            for b in res_head_mask.boxes:
                cls_id = int(b.cls[0].item())
                cls_name = mask_model.names.get(cls_id, str(cls_id))
                conf = float(b.conf[0].item())
                if cls_name == "Mask":
                    mask_pos_confs.append(conf)
                elif cls_name == "NO-Mask":
                    mask_neg_confs.append(conf)

    pos_m_conf = max(mask_pos_confs) if mask_pos_confs else 0.0
    neg_m_conf = max(mask_neg_confs) if mask_neg_confs else 0.0
    mask_ok = (pos_m_conf >= decision_conf) and (pos_m_conf > neg_m_conf)

    return {
        "helmet": helmet_ok,
        "vest": vest_ok,
        "mask": mask_ok,
        "helmet_conf": round(pos_h_conf, 3),
        "vest_conf": round(pos_v_conf, 3),
        "mask_conf": round(pos_m_conf, 3)
    }


# 5. Function evaluate(helmet, vest, mask, ...)
def evaluate(
    helmet: bool,
    vest: bool,
    mask: bool = False,
    require_helmet: bool = True,
    require_vest: bool = True,
    require_mask: bool = False
):
    missing = []
    if require_helmet and not helmet:
        missing.append("Helmet")
    if require_vest and not vest:
        missing.append("Vest")
    if require_mask and not mask:
        missing.append("Mask")
    
    status = "COMPLIANT" if len(missing) == 0 else "NON-COMPLIANT"
    return status, missing


# 6. Function analyze_image(img_bgr, settings)
def analyze_image(img_bgr, settings: dict = None):
    if settings is None:
        settings = DEFAULT_SETTINGS
        
    person_conf = float(settings.get("person_conf", DEFAULT_PERSON_CONF))
    ppe_conf = float(settings.get("ppe_conf", DEFAULT_PPE_CONF))
    decision_conf = float(settings.get("decision_conf", DEFAULT_DECISION_CONF))
    require_helmet = bool(settings.get("require_helmet", True))
    require_vest = bool(settings.get("require_vest", True))
    require_mask = bool(settings.get("require_mask", False))

    # Downscale if image longest side exceeds MAX_IMAGE_DIM
    img_bgr = resize_if_large(img_bgr, MAX_IMAGE_DIM)
    
    boxes = detect_workers(img_bgr, person_conf=person_conf)
    workers = []
    compliant_count = 0
    violation_count = 0
    
    for idx, box in enumerate(boxes, start=1):
        ppe_info = check_ppe(img_bgr, box, ppe_conf=ppe_conf, decision_conf=decision_conf)
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
            violation_count += 1
            
        workers.append({
            "id": idx,
            "box": box,
            "helmet": ppe_info["helmet"],
            "vest": ppe_info["vest"],
            "mask": ppe_info["mask"],
            "helmet_conf": ppe_info["helmet_conf"],
            "vest_conf": ppe_info["vest_conf"],
            "mask_conf": ppe_info["mask_conf"],
            "status": status,
            "missing": missing
        })
        
    return {
        "total": len(workers),
        "compliant": compliant_count,
        "violations": violation_count,
        "workers": workers,
        "settings": {
            "require_helmet": require_helmet,
            "require_vest": require_vest,
            "require_mask": require_mask,
            "person_conf": person_conf,
            "ppe_conf": ppe_conf,
            "decision_conf": decision_conf
        },
        "processed_img": img_bgr
    }


# 7. Function annotate(img_bgr, result)
def annotate(img_bgr, result):
    # Use the processed (downscaled) image if provided in result
    target_img = result.get("processed_img", img_bgr)
    annotated = target_img.copy()
    img_h, img_w = annotated.shape[:2]
    
    thickness = max(2, int(min(img_h, img_w) / 400))
    font = cv2.FONT_HERSHEY_SIMPLEX
    base_font_scale = max(0.40, min(img_h, img_w) / 1150.0)
    
    settings = result.get("settings", {})
    req_h = settings.get("require_helmet", True)
    req_v = settings.get("require_vest", True)
    req_m = settings.get("require_mask", False)
    
    margin = 4
    line_padding_x = 6
    line_padding_y = 5

    # Layout loop with font scale reduction if overlap cannot be resolved
    blocks = []
    font_scale = base_font_scale
    for scale_step in range(4):
        font_scale = base_font_scale * (0.92 ** scale_step)
        spacing = int(font_scale * 6) + 4
        
        blocks = []
        for worker in result["workers"]:
            x1, y1, x2, y2 = worker["box"]
            status = worker["status"]
            color = (0, 200, 0) if status == "COMPLIANT" else (0, 0, 220)
            
            # Build lines: status on its own line so it is not clipped
            lines = [
                f"Worker {worker['id']}",
                status
            ]
            if req_h or worker.get("helmet"):
                lines.append(f"Helmet OK ({worker.get('helmet_conf', 0.0):.2f})" if worker.get("helmet") else "No Helmet")
            if req_v or worker.get("vest"):
                lines.append(f"Vest OK ({worker.get('vest_conf', 0.0):.2f})" if worker.get("vest") else "No Vest")
            if req_m or worker.get("mask"):
                lines.append(f"Mask OK ({worker.get('mask_conf', 0.0):.2f})" if worker.get("mask") else "No Mask")
                
            line_metrics = []
            max_w = 0
            for line in lines:
                (lw, lh), b = cv2.getTextSize(line, font, font_scale, 1)
                line_metrics.append((lw, lh, b))
                if lw > max_w:
                    max_w = lw
                    
            block_w = max_w + (line_padding_x * 2)
            total_text_h = sum(m[1] for m in line_metrics)
            block_h = total_text_h + (len(lines) - 1) * spacing + (line_padding_y * 2)
            
            # Placement rules:
            # 1. If y2 + margin + block_h <= img_h: place BELOW box, top edge at y2 + margin
            # 2. Otherwise: place INSIDE box at bottom, top edge at y2 - block_h - margin
            if y2 + margin + block_h <= img_h:
                label_top = y2 + margin
            else:
                label_top = y2 - block_h - margin
                
            # Rule 3: The label must never be above y1 + 70% of the box height
            min_allowed_y = int(y1 + 0.70 * (y2 - y1))
            if label_top < min_allowed_y:
                label_top = min_allowed_y
                
            label_bottom = label_top + block_h
            
            # Align x to x1, clamped inside image
            init_x1 = x1
            init_x2 = init_x1 + block_w
            if init_x2 > img_w - 2:
                init_x2 = img_w - 2
                init_x1 = max(2, init_x2 - block_w)
                
            blocks.append({
                "worker": worker,
                "lines": lines,
                "line_metrics": line_metrics,
                "spacing": spacing,
                "color": color,
                "w": block_w,
                "h": block_h,
                "x1": init_x1,
                "y1": label_top,
                "x2": init_x2,
                "y2": label_bottom,
                "box": [x1, y1, x2, y2]
            })

        # Overlap resolution: shift right block to the right until no overlap
        resolved = True
        for _ in range(10):
            changed = False
            for i in range(len(blocks)):
                for j in range(i + 1, len(blocks)):
                    b1 = blocks[i]
                    b2 = blocks[j]
                    
                    overlap_x = not (b1["x2"] + 2 <= b2["x1"] or b2["x2"] + 2 <= b1["x1"])
                    overlap_y = not (b1["y2"] + 2 <= b2["y1"] or b2["y2"] + 2 <= b1["y1"])
                    
                    if overlap_x and overlap_y:
                        if b1["x1"] <= b2["x1"]:
                            left_b, right_b = b1, b2
                        else:
                            left_b, right_b = b2, b1
                            
                        needed_x1 = left_b["x2"] + 4
                        needed_x2 = needed_x1 + right_b["w"]
                        if needed_x2 <= img_w - 2:
                            right_b["x1"] = needed_x1
                            right_b["x2"] = needed_x2
                            changed = True
                        else:
                            needed_l_x2 = right_b["x1"] - 4
                            needed_l_x1 = needed_l_x2 - left_b["w"]
                            if needed_l_x1 >= 2:
                                left_b["x1"] = needed_l_x1
                                left_b["x2"] = needed_l_x2
                                changed = True
                            else:
                                resolved = False
            if not changed:
                break
                
        if resolved or scale_step == 3:
            break

    # Verification: check that for every worker label_top >= y1 + 0.7*(y2 - y1)
    for b in blocks:
        x1, y1, x2, y2 = b["box"]
        min_allowed_y = y1 + 0.70 * (y2 - y1)
        b["x1"] = max(2, min(img_w - b["w"] - 2, b["x1"]))
        b["x2"] = b["x1"] + b["w"]
        b["y1"] = max(int(min_allowed_y), min(img_h - b["h"] - 2, b["y1"]))
        b["y2"] = b["y1"] + b["h"]
        assert b["y1"] >= min_allowed_y - 1, f"Worker {b['worker']['id']}: label_top ({b['y1']}) < y1 + 70% ({min_allowed_y})"

    # 1. Top-left summary banner (Workers | Safe | Violations)
    banner_font_scale = max(0.45, min(img_h, img_w) / 1000.0)
    banner_text = f"Workers: {result['total']} | Safe: {result['compliant']} | Violations: {result['violations']}"
    (tw, th), baseline = cv2.getTextSize(banner_text, font, banner_font_scale, thickness)
    banner_bg_color = (30, 30, 30)
    cv2.rectangle(annotated, (10, 10), (20 + tw, 20 + th + baseline), banner_bg_color, -1)
    cv2.putText(annotated, banner_text, (15, 15 + th), font, banner_font_scale, (255, 255, 255), thickness, cv2.LINE_AA)

    # 2. Draw worker bounding boxes
    for worker in result["workers"]:
        x1, y1, x2, y2 = worker["box"]
        status = worker["status"]
        color = (0, 200, 0) if status == "COMPLIANT" else (0, 0, 220)
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, thickness)

    # 3. Draw label blocks and text
    for b in blocks:
        cv2.rectangle(annotated, (int(b["x1"]), int(b["y1"])), (int(b["x2"]), int(b["y2"])), b["color"], -1)
        
        curr_y = int(b["y1"] + line_padding_y + b["line_metrics"][0][1])
        for idx, line in enumerate(b["lines"]):
            cv2.putText(
                annotated,
                line,
                (int(b["x1"] + line_padding_x), curr_y),
                font,
                font_scale,
                (255, 255, 255),
                1,
                cv2.LINE_AA
            )
            if idx < len(b["lines"]) - 1:
                curr_y += b["line_metrics"][idx + 1][1] + b["spacing"]
                
    return annotated