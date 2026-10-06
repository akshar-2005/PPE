import os
import glob
import cv2
import numpy as np
from ultralytics import YOLO
from ground_truth_mask import GROUND_TRUTH_MASK

BASE_DIR = os.path.dirname(__file__)
MODELS_DIR = os.path.join(BASE_DIR, "models")
TEST_IMAGES_DIR = os.path.join(BASE_DIR, "test_images")
OUTPUTS_DIR = os.path.join(BASE_DIR, "outputs")
os.makedirs(OUTPUTS_DIR, exist_ok=True)

person_model = YOLO(os.path.join(MODELS_DIR, "yolov8n.pt"))
ppe_model = YOLO(os.path.join(MODELS_DIR, "ppe.pt"))

def detect_workers(img_bgr, conf=0.40):
    results = person_model(img_bgr, classes=[0], conf=conf, verbose=False)[0]
    boxes = []
    if results.boxes is not None:
        for b in results.boxes:
            x1, y1, x2, y2 = b.xyxy[0].tolist()
            boxes.append([int(x1), int(y1), int(x2), int(y2)])
    boxes.sort(key=lambda b: b[0])
    return boxes

def run_mask_diagnosis():
    image_paths = sorted(glob.glob(os.path.join(TEST_IMAGES_DIR, "ppe12_*.png")))
    print("=" * 95)
    print(f"STEP 1: MASK DIAGNOSTICS WITH models/ppe.pt (conf=0.01)")
    print("=" * 95)

    # Tracking per setup:
    # setups: "whole_640", "whole_1280", "head_crop_upscaled"
    # for classes: "Mask", "NO-Mask"
    # store list of max confidences for wearers (w_mask) and non-wearers (wo_mask)
    stats = {
        setup: {
            "Mask": {"w_mask": [], "wo_mask": []},
            "NO-Mask": {"w_mask": [], "wo_mask": []}
        }
        for setup in ["whole_640", "whole_1280", "head_crop_upscaled"]
    }

    for img_path in image_paths:
        fname = os.path.basename(img_path)
        img_bgr = cv2.imread(img_path)
        img_h, img_w = img_bgr.shape[:2]
        gt = GROUND_TRUTH_MASK.get(fname, {})
        
        workers = detect_workers(img_bgr, conf=0.40)
        diag_img = img_bgr.copy()

        print(f"\n{'='*95}")
        print(f"IMAGE: {fname} ({img_w}x{img_h}) - Workers detected: {len(workers)}")
        print(f"{'='*95}")

        # Setup (a): Whole image @ 640
        res_w640 = ppe_model(img_bgr, conf=0.01, imgsz=640, verbose=False)[0]
        # Setup (b): Whole image @ 1280
        res_w1280 = ppe_model(img_bgr, conf=0.01, imgsz=1280, verbose=False)[0]

        for w_idx, box in enumerate(workers, start=1):
            if w_idx not in gt:
                continue
            w_gt = gt[w_idx]
            has_mask = w_gt["mask"]
            x1, y1, x2, y2 = box
            pw = max(1, x2 - x1)
            ph = max(1, y2 - y1)

            cv2.rectangle(diag_img, (x1, y1), (x2, y2), (255, 200, 0), 2)
            cv2.putText(diag_img, f"W{w_idx} (MaskGT:{has_mask})", (x1 + 5, y1 + 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 200, 0), 2)

            print(f"\n--- Worker {w_idx} (Box: [{x1}, {y1}, {x2}, {y2}]) | Ground Truth Mask: {has_mask} ---")

            # Setup (a) filter detections inside worker box
            w640_mask_confs = []
            w640_nomask_confs = []
            if res_w640.boxes is not None:
                for b in res_w640.boxes:
                    cid = int(b.cls[0].item())
                    cname = ppe_model.names.get(cid, str(cid))
                    conf = float(b.conf[0].item())
                    bx1, by1, bx2, by2 = b.xyxy[0].tolist()
                    bcx = (bx1 + bx2) / 2.0
                    bcy = (by1 + by2) / 2.0
                    if x1 <= bcx <= x2 and y1 <= bcy <= y2:
                        rel_y = (bcy - y1) / float(ph)
                        if "mask" in cname.lower():
                            print(f"  [Whole 640]  {cname:<10s} conf={conf:.4f} at center_y={rel_y*100:.1f}%")
                            if "no" in cname.lower():
                                w640_nomask_confs.append(conf)
                            else:
                                w640_mask_confs.append(conf)

            # Setup (b) filter detections inside worker box
            w1280_mask_confs = []
            w1280_nomask_confs = []
            if res_w1280.boxes is not None:
                for b in res_w1280.boxes:
                    cid = int(b.cls[0].item())
                    cname = ppe_model.names.get(cid, str(cid))
                    conf = float(b.conf[0].item())
                    bx1, by1, bx2, by2 = b.xyxy[0].tolist()
                    bcx = (bx1 + bx2) / 2.0
                    bcy = (by1 + by2) / 2.0
                    if x1 <= bcx <= x2 and y1 <= bcy <= y2:
                        rel_y = (bcy - y1) / float(ph)
                        if "mask" in cname.lower():
                            print(f"  [Whole 1280] {cname:<10s} conf={conf:.4f} at center_y={rel_y*100:.1f}%")
                            if "no" in cname.lower():
                                w1280_nomask_confs.append(conf)
                            else:
                                w1280_mask_confs.append(conf)

            # Setup (c): Head crop (top 35% with 15% padding, upscaled to >=640px)
            pad_w = int(pw * 0.15)
            pad_h = int(ph * 0.15)
            head_x1 = max(0, x1 - pad_w)
            head_y1 = max(0, y1 - pad_h)
            head_x2 = min(img_w, x2 + pad_w)
            head_y2 = min(img_h, y1 + int(ph * 0.35) + pad_h)
            
            head_crop = img_bgr[head_y1:head_y2, head_x1:head_x2]
            head_mask_confs = []
            head_nomask_confs = []

            if head_crop.size > 0:
                scale = 640.0 / max(head_crop.shape[:2])
                new_w = max(1, int(head_crop.shape[1] * scale))
                new_h = max(1, int(head_crop.shape[0] * scale))
                head_up = cv2.resize(head_crop, (new_w, new_h), interpolation=cv2.INTER_AREA)
                
                res_head = ppe_model(head_up, conf=0.01, verbose=False)[0]
                if res_head.boxes is not None:
                    for b in res_head.boxes:
                        cid = int(b.cls[0].item())
                        cname = ppe_model.names.get(cid, str(cid))
                        conf = float(b.conf[0].item())
                        bx1, by1, bx2, by2 = b.xyxy[0].tolist()
                        cy_center = (by1 + by2) / 2.0
                        rel_y_crop = cy_center / float(new_h)
                        if "mask" in cname.lower():
                            print(f"  [Head Upscaled 640] {cname:<10s} conf={conf:.4f} at crop_y={rel_y_crop*100:.1f}%")
                            if "no" in cname.lower():
                                head_nomask_confs.append(conf)
                            else:
                                head_mask_confs.append(conf)

            # Record stats
            max_m_640 = max(w640_mask_confs) if w640_mask_confs else 0.0
            max_nm_640 = max(w640_nomask_confs) if w640_nomask_confs else 0.0
            max_m_1280 = max(w1280_mask_confs) if w1280_mask_confs else 0.0
            max_nm_1280 = max(w1280_nomask_confs) if w1280_nomask_confs else 0.0
            max_m_head = max(head_mask_confs) if head_mask_confs else 0.0
            max_nm_head = max(head_nomask_confs) if head_nomask_confs else 0.0

            target_key = "w_mask" if has_mask else "wo_mask"
            stats["whole_640"]["Mask"][target_key].append((fname, w_idx, max_m_640))
            stats["whole_640"]["NO-Mask"][target_key].append((fname, w_idx, max_nm_640))

            stats["whole_1280"]["Mask"][target_key].append((fname, w_idx, max_m_1280))
            stats["whole_1280"]["NO-Mask"][target_key].append((fname, w_idx, max_nm_1280))

            stats["head_crop_upscaled"]["Mask"][target_key].append((fname, w_idx, max_m_head))
            stats["head_crop_upscaled"]["NO-Mask"][target_key].append((fname, w_idx, max_nm_head))

        # Save diagnostic image
        out_path = os.path.join(OUTPUTS_DIR, f"diag_mask_{fname}")
        cv2.imwrite(out_path, diag_img)

    # Print Separation Summary Table
    print("\n" + "=" * 95)
    print("STEP 1: MASK SEPARATION TABLE (models/ppe.pt at conf=0.01)")
    print("=" * 95)
    print(f"{'Setup / Configuration':<24} | {'Class':<8} | {'Max (Wearers)':<15} | {'Min (Wearers)':<15} | {'Max (Non-Wearers)':<18} | {'Separable?':<10}")
    print("-" * 95)

    for setup, sname in [
        ("whole_640", "(a) Whole Img 640"),
        ("whole_1280", "(b) Whole Img 1280"),
        ("head_crop_upscaled", "(c) Head Crop Up 640")
    ]:
        for cls_name in ["Mask", "NO-Mask"]:
            wearer_confs = [c[2] for c in stats[setup][cls_name]["w_mask"]]
            non_wearer_confs = [c[2] for c in stats[setup][cls_name]["wo_mask"]]

            max_w = max(wearer_confs) if wearer_confs else 0.0
            min_w = min(wearer_confs) if wearer_confs else 0.0
            max_nw = max(non_wearer_confs) if non_wearer_confs else 0.0

            separable = "YES" if (min_w > max_nw and max_w > 0.0) else "NO (0 Recall/Overlap)"
            print(f"{sname:<24} | {cls_name:<8} | {max_w:<15.4f} | {min_w:<15.4f} | {max_nw:<18.4f} | {separable:<10}")

    print("=" * 95)

if __name__ == "__main__":
    run_mask_diagnosis()
