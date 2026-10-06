import os
import glob
import cv2
import numpy as np
from ultralytics import YOLO
from ground_truth import GROUND_TRUTH

BASE_DIR = os.path.dirname(__file__)
MODELS_DIR = os.path.join(BASE_DIR, "models")
TEST_IMAGES_DIR = os.path.join(BASE_DIR, "test_images")
OUTPUTS_DIR = os.path.join(BASE_DIR, "outputs")
os.makedirs(OUTPUTS_DIR, exist_ok=True)

person_model = YOLO(os.path.join(MODELS_DIR, "yolov8n.pt"))
ppe_model = YOLO(os.path.join(MODELS_DIR, "ppe.pt"))

CLASSES_OF_INTEREST = {
    "Gloves": ["Gloves", "NO-Gloves"],
    "Goggles": ["Goggles", "NO-Goggles"],
    "Mask": ["Mask", "NO-Mask"],
    "Hardhat": ["Hardhat", "NO-Hardhat"],
    "Safety Vest": ["Safety Vest", "NO-Safety Vest"]
}

REGION_LIMITS = {
    "Gloves": (0.20, 0.80),
    "Goggles": (-0.15, 0.35),
    "Mask": (-0.10, 0.40),
    "Hardhat": (-0.15, 0.45),
    "Safety Vest": (0.10, 0.75),
}

def detect_workers(img_bgr, conf=0.40):
    results = person_model(img_bgr, classes=[0], conf=conf, verbose=False)[0]
    boxes = []
    if results.boxes is not None:
        for b in results.boxes:
            x1, y1, x2, y2 = b.xyxy[0].tolist()
            boxes.append([int(x1), int(y1), int(x2), int(y2)])
    boxes.sort(key=lambda b: b[0])
    return boxes

def get_class_category(cls_name):
    c = cls_name.lower().replace("-", " ").replace("_", " ").strip()
    is_neg = c.startswith("no ") or c.startswith("no_")
    if "glove" in c:
        return "Gloves", is_neg
    if "goggle" in c:
        return "Goggles", is_neg
    if "mask" in c:
        return "Mask", is_neg
    if "hardhat" in c or "helmet" in c:
        return "Hardhat", is_neg
    if "vest" in c:
        return "Safety Vest", is_neg
    return None, is_neg

def run_diagnostics():
    image_paths = sorted(glob.glob(os.path.join(TEST_IMAGES_DIR, "ppe12_*.png")))
    print(f"Loaded {len(image_paths)} images for diagnosis.\n")

    # Separation tracking: for each class -> list of max positive conf for True workers and False workers
    conf_records = {
        "Gloves": {"has_item": [], "no_item": []},
        "Goggles": {"has_item": [], "no_item": []},
        "Mask": {"has_item": [], "no_item": []},
        "Hardhat": {"has_item": [], "no_item": []},
        "Safety Vest": {"has_item": [], "no_item": []},
    }

    # Tracking for crops vs whole image 640 vs whole image 1280
    source_records = {
        "crop": {k: {"has_item": [], "no_item": []} for k in ["Gloves", "Goggles", "Mask"]},
        "whole_640": {k: {"has_item": [], "no_item": []} for k in ["Gloves", "Goggles", "Mask"]},
        "whole_1280": {k: {"has_item": [], "no_item": []} for k in ["Gloves", "Goggles", "Mask"]},
    }

    for img_path in image_paths:
        fname = os.path.basename(img_path)
        img_bgr = cv2.imread(img_path)
        img_h, img_w = img_bgr.shape[:2]
        
        workers = detect_workers(img_bgr, conf=0.40)
        gt = GROUND_TRUTH.get(fname, {})
        
        print(f"================================================================================")
        print(f"IMAGE: {fname} ({img_w}x{img_h}) - Detected {len(workers)} workers")
        print(f"================================================================================")

        # 1. Whole Image @ 640 & 1280
        whole_results_640 = ppe_model(img_bgr, conf=0.05, imgsz=640, verbose=False)[0]
        whole_results_1280 = ppe_model(img_bgr, conf=0.05, imgsz=1280, verbose=False)[0]

        # Draw diagnostics on copy
        diag_img = img_bgr.copy()

        # Print detailed worker detections
        for w_idx, box in enumerate(workers, start=1):
            x1, y1, x2, y2 = box
            w = x2 - x1
            h = y2 - y1
            person_h = max(1, h)
            w_gt = gt.get(w_idx, {"helmet": True, "vest": True, "gloves": False, "goggles": False, "mask": False})

            cv2.rectangle(diag_img, (x1, y1), (x2, y2), (255, 200, 0), 2)
            cv2.putText(diag_img, f"W{w_idx}", (x1 + 5, y1 + 25), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 200, 0), 2)

            print(f"\n--- Worker {w_idx} (Box: [{x1}, {y1}, {x2}, {y2}]) ---")
            print(f"    Ground Truth: Hardhat={w_gt['helmet']}, Vest={w_gt['vest']}, Gloves={w_gt['gloves']}, Goggles={w_gt['goggles']}, Mask={w_gt['mask']}")

            # Crop exactly as pipeline does (5% padding)
            pad_w = int(w * 0.05)
            pad_h = int(h * 0.05)
            cx1 = max(0, x1 - pad_w)
            cy1 = max(0, y1 - pad_h)
            cx2 = min(img_w, x2 + pad_w)
            cy2 = min(img_h, y2 + pad_h)
            crop = img_bgr[cy1:cy2, cx1:cx2]

            crop_results = ppe_model(crop, conf=0.05, verbose=False)[0]

            print("    [Source 1: Per-Worker Crop (conf=0.05)]")
            crop_item_confs = {k: {"pos": [], "neg": []} for k in CLASSES_OF_INTEREST.keys()}
            if crop_results.boxes is not None:
                for b in crop_results.boxes:
                    cls_id = int(b.cls[0].item())
                    cls_name = ppe_model.names.get(cls_id, str(cls_id))
                    conf = float(b.conf[0].item())
                    bx1, by1, bx2, by2 = b.xyxy[0].tolist()
                    cy_center = (by1 + by2) / 2.0
                    global_cy = cy1 + cy_center
                    rel_y = (global_cy - y1) / float(person_h)
                    rel_y_pct = rel_y * 100.0

                    cat, is_neg = get_class_category(cls_name)
                    if cat:
                        min_r, max_r = REGION_LIMITS[cat]
                        pass_region = (min_r <= rel_y <= max_r)
                        pass_dec = (conf >= 0.30)
                        status_str = f"PassRegion={pass_region}, PassDec30={pass_dec}"
                        print(f"      -> {cls_name:14s} conf={conf:.3f} | rel_y={rel_y_pct:5.1f}% | {status_str}")
                        
                        if pass_region:
                            if is_neg:
                                crop_item_confs[cat]["neg"].append(conf)
                            else:
                                crop_item_confs[cat]["pos"].append(conf)

            # Check whole image 640 mapped to this worker
            whole640_item_confs = {k: {"pos": [], "neg": []} for k in CLASSES_OF_INTEREST.keys()}
            if whole_results_640.boxes is not None:
                for b in whole_results_640.boxes:
                    bx1, by1, bx2, by2 = b.xyxy[0].tolist()
                    bcx = (bx1 + bx2) / 2.0
                    bcy = (by1 + by2) / 2.0
                    if x1 <= bcx <= x2 and y1 <= bcy <= y2:
                        cls_id = int(b.cls[0].item())
                        cls_name = ppe_model.names.get(cls_id, str(cls_id))
                        conf = float(b.conf[0].item())
                        rel_y = (bcy - y1) / float(person_h)
                        cat, is_neg = get_class_category(cls_name)
                        if cat:
                            min_r, max_r = REGION_LIMITS[cat]
                            if min_r <= rel_y <= max_r:
                                if is_neg:
                                    whole640_item_confs[cat]["neg"].append(conf)
                                else:
                                    whole640_item_confs[cat]["pos"].append(conf)

            # Check whole image 1280 mapped to this worker
            whole1280_item_confs = {k: {"pos": [], "neg": []} for k in CLASSES_OF_INTEREST.keys()}
            if whole_results_1280.boxes is not None:
                for b in whole_results_1280.boxes:
                    bx1, by1, bx2, by2 = b.xyxy[0].tolist()
                    bcx = (bx1 + bx2) / 2.0
                    bcy = (by1 + by2) / 2.0
                    if x1 <= bcx <= x2 and y1 <= bcy <= y2:
                        cls_id = int(b.cls[0].item())
                        cls_name = ppe_model.names.get(cls_id, str(cls_id))
                        conf = float(b.conf[0].item())
                        rel_y = (bcy - y1) / float(person_h)
                        cat, is_neg = get_class_category(cls_name)
                        if cat:
                            min_r, max_r = REGION_LIMITS[cat]
                            if min_r <= rel_y <= max_r:
                                if is_neg:
                                    whole1280_item_confs[cat]["neg"].append(conf)
                                else:
                                    whole1280_item_confs[cat]["pos"].append(conf)

            # Record separation data for table
            for cat_name, gt_key in [("Gloves", "gloves"), ("Goggles", "goggles"), ("Mask", "mask"), ("Hardhat", "helmet"), ("Safety Vest", "vest")]:
                has_item = w_gt.get(gt_key, False)
                
                # Crop source max pos conf
                crop_pos = max(crop_item_confs[cat_name]["pos"]) if crop_item_confs[cat_name]["pos"] else 0.0
                if cat_name in source_records["crop"]:
                    if has_item:
                        source_records["crop"][cat_name]["has_item"].append((fname, w_idx, crop_pos))
                    else:
                        source_records["crop"][cat_name]["no_item"].append((fname, w_idx, crop_pos))

                # Whole 640
                w640_pos = max(whole640_item_confs[cat_name]["pos"]) if whole640_item_confs[cat_name]["pos"] else 0.0
                if cat_name in source_records["whole_640"]:
                    if has_item:
                        source_records["whole_640"][cat_name]["has_item"].append((fname, w_idx, w640_pos))
                    else:
                        source_records["whole_640"][cat_name]["no_item"].append((fname, w_idx, w640_pos))

                # Whole 1280
                w1280_pos = max(whole1280_item_confs[cat_name]["pos"]) if whole1280_item_confs[cat_name]["pos"] else 0.0
                if cat_name in source_records["whole_1280"]:
                    if has_item:
                        source_records["whole_1280"][cat_name]["has_item"].append((fname, w_idx, w1280_pos))
                    else:
                        source_records["whole_1280"][cat_name]["no_item"].append((fname, w_idx, w1280_pos))

                # Overall crop max
                if has_item:
                    conf_records[cat_name]["has_item"].append((fname, w_idx, crop_pos))
                else:
                    conf_records[cat_name]["no_item"].append((fname, w_idx, crop_pos))

        # Save diagnostic image
        out_diag_path = os.path.join(OUTPUTS_DIR, f"diag_{fname}")
        cv2.imwrite(out_diag_path, diag_img)

    # Print Separation Table
    print("\n" + "=" * 90)
    print("STEP 1 DIAGNOSTIC SEPARATION TABLE (ppe.pt on Per-Worker Crops)")
    print("=" * 90)
    print(f"{'Class / Item':<15} | {'Max Conf (Has Item)':<22} | {'Min Conf (Has Item)':<22} | {'Max Conf (NO Item)':<22} | {'Separable?':<12}")
    print("-" * 90)

    for item, data in conf_records.items():
        has_confs = [c[2] for c in data["has_item"]]
        no_confs = [c[2] for c in data["no_item"]]
        
        max_has = max(has_confs) if has_confs else 0.0
        min_has = min(has_confs) if has_confs else 0.0
        max_no = max(no_confs) if no_confs else 0.0
        
        separable = "YES" if (min_has > max_no and max_has > 0.0) else "NO (Overlaps/Zero Recall)"
        
        print(f"{item:<15} | {max_has:<22.3f} | {min_has:<22.3f} | {max_no:<22.3f} | {separable:<12}")

    print("\n" + "=" * 90)
    print("DETAILED BREAKDOWN BY WORKER FOR GLOVES, GOGGLES, MASK (Crop vs Whole 640 vs Whole 1280)")
    print("=" * 90)
    for cat in ["Gloves", "Goggles", "Mask"]:
        print(f"\n--- Item: {cat} ---")
        print(f"Workers WITH {cat}:")
        for i, (fn, wid, c_conf) in enumerate(source_records["crop"][cat]["has_item"]):
            w640 = source_records["whole_640"][cat]["has_item"][i][2]
            w1280 = source_records["whole_1280"][cat]["has_item"][i][2]
            print(f"  {fn} W{wid}: Crop={c_conf:.3f}, Whole640={w640:.3f}, Whole1280={w1280:.3f}")
            
        print(f"Workers WITHOUT {cat}:")
        for i, (fn, wid, c_conf) in enumerate(source_records["crop"][cat]["no_item"]):
            w640 = source_records["whole_640"][cat]["no_item"][i][2]
            w1280 = source_records["whole_1280"][cat]["no_item"][i][2]
            print(f"  {fn} W{wid}: Crop={c_conf:.3f}, Whole640={w640:.3f}, Whole1280={w1280:.3f}")

if __name__ == "__main__":
    run_diagnostics()
