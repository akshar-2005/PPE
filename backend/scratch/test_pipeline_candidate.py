import os
import sys
import glob
import time
import cv2
import numpy as np

BASE_DIR = r"c:\Users\aksha\OneDrive\Desktop\Computer vision\ppe-vision\backend"
sys.path.insert(0, BASE_DIR)

from ultralytics import YOLO
from ground_truth import GROUND_TRUTH

MODELS_DIR = os.path.join(BASE_DIR, "models")
TEST_IMAGES_DIR = os.path.join(BASE_DIR, "test_images")

person_model = YOLO(os.path.join(MODELS_DIR, "yolov8n.pt"))
ppe_model = YOLO(os.path.join(MODELS_DIR, "ppe.pt"))
ppe2_model = YOLO(os.path.join(MODELS_DIR, "ppe2.pt"))

HELMET_KEYS = ["hardhat", "helmet"]
VEST_KEYS = ["vest"]
GLOVES_KEYS = ["glove"]
GOGGLES_KEYS = ["goggle"]
MASK_KEYS = ["mask"]

def classify_class(cls_name: str):
    clean = cls_name.lower().replace("-", " ").replace("_", " ").strip()
    is_neg = clean.startswith("no ") or clean.startswith("no_")
    
    is_helmet = any(k in clean for k in HELMET_KEYS)
    is_vest = any(k in clean for k in VEST_KEYS)
    is_gloves = any(k in clean for k in GLOVES_KEYS)
    is_goggles = any(k in clean for k in GOGGLES_KEYS)
    is_mask = any(k in clean for k in MASK_KEYS)
    
    cat = None
    if is_helmet:
        cat = "helmet"
    elif is_vest:
        cat = "vest"
    elif is_gloves:
        cat = "gloves"
    elif is_goggles:
        cat = "goggles"
    elif is_mask:
        cat = "mask"
        
    return cat, is_neg

def detect_workers(img_bgr, conf=0.40):
    res = person_model(img_bgr, classes=[0], conf=conf, verbose=False)[0]
    boxes = []
    if res.boxes is not None:
        for b in res.boxes:
            x1, y1, x2, y2 = b.xyxy[0].tolist()
            boxes.append([int(x1), int(y1), int(x2), int(y2)])
    boxes.sort(key=lambda b: b[0])
    return boxes

def check_ppe_enhanced(img_bgr, box, ppe_conf=0.25, decision_conf=0.30):
    img_h, img_w = img_bgr.shape[:2]
    x1, y1, x2, y2 = box
    w = max(1, x2 - x1)
    h = max(1, y2 - y1)
    
    pos_confs = {"helmet": [], "vest": [], "gloves": [], "goggles": [], "mask": []}
    neg_confs = {"helmet": [], "vest": [], "gloves": [], "goggles": [], "mask": []}

    # 1. Standard Worker Crop
    pad_w = int(w * 0.05)
    pad_h = int(h * 0.05)
    cx1 = max(0, x1 - pad_w)
    cy1 = max(0, y1 - pad_h)
    cx2 = min(img_w, x2 + pad_w)
    cy2 = min(img_h, y2 + pad_h)
    crop = img_bgr[cy1:cy2, cx1:cx2]

    if crop.size > 0:
        ppe_res = ppe_model(crop, conf=0.05, verbose=False)[0]
        if ppe_res.boxes is not None:
            for b in ppe_res.boxes:
                cls_id = int(b.cls[0].item())
                cls_name = ppe_model.names.get(cls_id, str(cls_id))
                conf = float(b.conf[0].item())
                bx1, by1, bx2, by2 = b.xyxy[0].tolist()
                global_cy = cy1 + (by1 + by2) / 2.0
                rel_y = (global_cy - y1) / float(h)
                
                cat, is_neg = classify_class(cls_name)
                if cat == "helmet" and -0.15 <= rel_y <= 0.45:
                    (neg_confs if is_neg else pos_confs)[cat].append(conf)
                elif cat == "vest" and 0.10 <= rel_y <= 0.75:
                    (neg_confs if is_neg else pos_confs)[cat].append(conf)
                elif cat == "gloves" and 0.20 <= rel_y <= 0.85:
                    (neg_confs if is_neg else pos_confs)[cat].append(conf)
                elif cat == "goggles" and -0.15 <= rel_y <= 0.35:
                    (neg_confs if is_neg else pos_confs)[cat].append(conf)

    # 2. Upscaled Head Crop (for Goggles on ppe_model and Mask on ppe2_model)
    hx1 = max(0, int(x1 - w * 0.10))
    hy1 = max(0, int(y1 - h * 0.05))
    hx2 = min(img_w, int(x2 + w * 0.10))
    hy2 = min(img_h, int(y1 + h * 0.35))
    head_crop = img_bgr[hy1:hy2, hx1:hx2]

    if head_crop.size > 0:
        scale = 640.0 / max(head_crop.shape[:2])
        head_up = cv2.resize(head_crop, (max(1, int(head_crop.shape[1] * scale)), max(1, int(head_crop.shape[0] * scale))))
        
        # ppe_model on head crop for goggles / helmet
        head_ppe_res = ppe_model(head_up, conf=0.05, verbose=False)[0]
        if head_ppe_res.boxes is not None:
            for b in head_ppe_res.boxes:
                cls_id = int(b.cls[0].item())
                cls_name = ppe_model.names.get(cls_id, str(cls_id))
                conf = float(b.conf[0].item())
                cat, is_neg = classify_class(cls_name)
                if cat in ["helmet", "goggles"]:
                    (neg_confs if is_neg else pos_confs)[cat].append(conf)

        # ppe2_model on head crop for mask / no-mask
        head_ppe2_res = ppe2_model(head_up, conf=0.05, verbose=False)[0]
        if head_ppe2_res.boxes is not None:
            for b in head_ppe2_res.boxes:
                cls_id = int(b.cls[0].item())
                cls_name = ppe2_model.names.get(cls_id, str(cls_id))
                conf = float(b.conf[0].item())
                cat, is_neg = classify_class(cls_name)
                if cat == "mask":
                    (neg_confs if is_neg else pos_confs)[cat].append(conf)

    # 3. Upscaled Hands / Torso Crop (for Gloves)
    gx1 = max(0, int(x1 - w * 0.10))
    gy1 = max(0, int(y1 + h * 0.20))
    gx2 = min(img_w, int(x2 + w * 0.10))
    gy2 = min(img_h, int(y1 + h * 0.85))
    hands_crop = img_bgr[gy1:gy2, gx1:gx2]

    if hands_crop.size > 0:
        scale = 640.0 / max(hands_crop.shape[:2])
        hands_up = cv2.resize(hands_crop, (max(1, int(hands_crop.shape[1] * scale)), max(1, int(hands_crop.shape[0] * scale))))
        hands_ppe_res = ppe_model(hands_up, conf=0.05, verbose=False)[0]
        if hands_ppe_res.boxes is not None:
            for b in hands_ppe_res.boxes:
                cls_id = int(b.cls[0].item())
                cls_name = ppe_model.names.get(cls_id, str(cls_id))
                conf = float(b.conf[0].item())
                cat, is_neg = classify_class(cls_name)
                if cat == "gloves":
                    (neg_confs if is_neg else pos_confs)[cat].append(conf)

    # Evaluation
    pos_h = max(pos_confs["helmet"]) if pos_confs["helmet"] else 0.0
    neg_h = max(neg_confs["helmet"]) if neg_confs["helmet"] else 0.0
    helmet_ok = (pos_h >= decision_conf) and (pos_h > neg_h)

    pos_v = max(pos_confs["vest"]) if pos_confs["vest"] else 0.0
    neg_v = max(neg_confs["vest"]) if neg_confs["vest"] else 0.0
    vest_ok = (pos_v >= decision_conf) and (pos_v > neg_v)

    # Thresholds per item based on diagnostic separation
    pos_m = max(pos_confs["mask"]) if pos_confs["mask"] else 0.0
    neg_m = max(neg_confs["mask"]) if neg_confs["mask"] else 0.0
    mask_ok = (pos_m >= min(decision_conf, 0.30)) and (pos_m > neg_m)

    pos_g = max(pos_confs["gloves"]) if pos_confs["gloves"] else 0.0
    neg_g = max(neg_confs["gloves"]) if neg_confs["gloves"] else 0.0
    gloves_ok = (pos_g >= 0.06) and (pos_g > neg_g)

    pos_gog = max(pos_confs["goggles"]) if pos_confs["goggles"] else 0.0
    neg_gog = max(neg_confs["goggles"]) if neg_confs["goggles"] else 0.0
    goggles_ok = (pos_gog >= 0.12) and (pos_gog > neg_gog)

    return {
        "helmet": helmet_ok,
        "vest": vest_ok,
        "gloves": gloves_ok,
        "goggles": goggles_ok,
        "mask": mask_ok,
        "helmet_conf": round(pos_h, 3),
        "vest_conf": round(pos_v, 3),
        "gloves_conf": round(pos_g, 3),
        "goggles_conf": round(pos_gog, 3),
        "mask_conf": round(pos_m, 3),
    }

def test_enhanced_pipeline():
    images = sorted(glob.glob(os.path.join(TEST_IMAGES_DIR, "ppe12_*.png")))
    
    print("\n=======================================================")
    print("TESTING ENHANCED PIPELINE (ppe.pt + ppe2.pt + Multi-Crop)")
    print("=======================================================")

    stats = {
        item: {"TP": 0, "FP": 0, "TN": 0, "FN": 0}
        for item in ["helmet", "vest", "gloves", "goggles", "mask"]
    }
    
    total_time = 0.0

    for img_path in images:
        fn = os.path.basename(img_path)
        img = cv2.imread(img_path)
        gt = GROUND_TRUTH.get(fn, {})

        t0 = time.time()
        boxes = detect_workers(img)
        worker_results = []
        for b in boxes:
            worker_results.append(check_ppe_enhanced(img, b))
        dt = time.time() - t0
        total_time += dt

        print(f"\n--- {fn} ({dt*1000:.1f} ms) ---")
        for wid, w_res in enumerate(worker_results, 1):
            if wid not in gt:
                continue
            w_gt = gt[wid]
            
            line_parts = [f"  Worker {wid}:"]
            for item in ["helmet", "vest", "gloves", "goggles", "mask"]:
                pred_val = w_res[item]
                conf = w_res[f"{item}_conf"]
                true_val = w_gt[item]
                
                if true_val and pred_val:
                    stats[item]["TP"] += 1
                    status = "OK"
                elif not true_val and not pred_val:
                    stats[item]["TN"] += 1
                    status = "OK"
                elif not true_val and pred_val:
                    stats[item]["FP"] += 1
                    status = "WRONG(FP)"
                else:
                    stats[item]["FN"] += 1
                    status = "WRONG(FN)"
                
                pred_str = "YES" if pred_val else "NO "
                true_str = "YES" if true_val else "NO "
                line_parts.append(f"{item.capitalize()}: {pred_str}({conf:.2f}) [GT:{true_str}] {status}")
            
            print(" | ".join(line_parts))

    print("\n" + "-" * 95)
    print(f"{'Item':<12} | {'TP':<5} | {'FP':<5} | {'TN':<5} | {'FN':<5} | {'Precision':<10} | {'Recall':<10} | {'Accuracy':<10}")
    print("-" * 95)
    
    overall_correct = 0
    overall_total = 0
    for item in ["helmet", "vest", "gloves", "goggles", "mask"]:
        tp = stats[item]["TP"]
        fp = stats[item]["FP"]
        tn = stats[item]["TN"]
        fn = stats[item]["FN"]
        
        prec = (tp / (tp + fp)) * 100.0 if (tp + fp) > 0 else (100.0 if fn == 0 else 0.0)
        rec = (tp / (tp + fn)) * 100.0 if (tp + fn) > 0 else 100.0
        acc = ((tp + tn) / (tp + fp + tn + fn)) * 100.0 if (tp + fp + tn + fn) > 0 else 0.0
        
        overall_correct += (tp + tn)
        overall_total += (tp + fp + tn + fn)
        print(f"{item.capitalize():<12} | {tp:<5} | {fp:<5} | {tn:<5} | {fn:<5} | {prec:>8.1f}% | {rec:>8.1f}% | {acc:>8.1f}%")

    overall_acc = (overall_correct / overall_total * 100.0) if overall_total > 0 else 0.0
    print("-" * 95)
    print(f"Overall Item Accuracy: {overall_acc:.1f}% ({overall_correct}/{overall_total} correct classifications)")
    print(f"Average time per image: {total_time/len(images):.3f}s\n")

if __name__ == "__main__":
    test_enhanced_pipeline()
