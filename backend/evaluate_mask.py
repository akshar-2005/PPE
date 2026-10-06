import os
import glob
import time
import cv2
from ground_truth_mask import GROUND_TRUTH_MASK
from pipeline import analyze_image

BASE_DIR = os.path.dirname(__file__)
TEST_IMAGES_DIR = os.path.join(BASE_DIR, "test_images")

def evaluate_dataset(settings: dict, title: str):
    image_paths = sorted(glob.glob(os.path.join(TEST_IMAGES_DIR, "ppe12_*.png")))
    
    print("\n" + "=" * 90)
    print(f"EVALUATION: {title}")
    print(f"Settings: require_helmet={settings.get('require_helmet')}, require_vest={settings.get('require_vest')}, require_mask={settings.get('require_mask')}")
    print(f"Thresholds: person_conf={settings.get('person_conf')}, ppe_conf={settings.get('ppe_conf')}, decision_conf={settings.get('decision_conf')}")
    print("=" * 90)

    tp = 0
    fp = 0
    tn = 0
    fn = 0
    total_time = 0.0
    total_workers_evaluated = 0

    for img_path in image_paths:
        fname = os.path.basename(img_path)
        img_bgr = cv2.imread(img_path)
        gt = GROUND_TRUTH_MASK.get(fname, {})

        t0 = time.time()
        result = analyze_image(img_bgr, settings=settings)
        dt = time.time() - t0
        total_time += dt

        print(f"\n--- {fname} ({dt*1000:.1f} ms) | Total Workers: {result['total']} | Safe: {result['compliant']} | Violations: {result['violations']} ---")
        
        for w in result["workers"]:
            wid = w["id"]
            if wid not in gt:
                continue
            total_workers_evaluated += 1
            w_gt = gt[wid]
            
            pred_mask = w.get("mask", False)
            mask_conf = w.get("mask_conf", 0.0)
            true_mask = w_gt["mask"]
            
            if true_mask and pred_mask:
                tp += 1
                status = "OK"
            elif not true_mask and not pred_mask:
                tn += 1
                status = "OK"
            elif not true_mask and pred_mask:
                fp += 1
                status = "WRONG(FP)"
            else:
                fn += 1
                status = "WRONG(FN)"
            
            pred_str = "YES" if pred_mask else "NO "
            true_str = "YES" if true_mask else "NO "
            
            h_str = "YES" if w["helmet"] else "NO "
            v_str = "YES" if w["vest"] else "NO "
            
            print(f"  Worker {wid}: Mask: {pred_str} ({mask_conf:.2f}) [GT: {true_str}] {status:<9s} | Helmet: {h_str}({w['helmet_conf']:.2f}) | Vest: {v_str}({w['vest_conf']:.2f}) | Status: {w['status']} {w['missing']}")

    total = tp + fp + tn + fn
    acc = ((tp + tn) / total * 100.0) if total > 0 else 0.0
    prec = (tp / (tp + fp) * 100.0) if (tp + fp) > 0 else 0.0
    rec = (tp / (tp + fn) * 100.0) if (tp + fn) > 0 else 0.0
    avg_time = total_time / len(image_paths) if image_paths else 0.0

    print("\n" + "-" * 90)
    print(f"{'Metric':<20} | {'Count / Value':<20}")
    print("-" * 90)
    print(f"{'True Positives (TP)':<20} | {tp:<20}")
    print(f"{'False Positives (FP)':<20} | {fp:<20}")
    print(f"{'True Negatives (TN)':<20} | {tn:<20}")
    print(f"{'False Negatives (FN)':<20} | {fn:<20}")
    print(f"{'Precision':<20} | {prec:>5.1f}%")
    print(f"{'Recall':<20} | {rec:>5.1f}%")
    print(f"{'Accuracy':<20} | {acc:>5.1f}% ({tp+tn}/{total} correct classifications)")
    print(f"{'Total Inference Time':<20} | {total_time:.3f}s ({avg_time:.3f}s per image)")
    print("-" * 90)
    
    return {"TP": tp, "FP": fp, "TN": tn, "FN": fn, "Accuracy": acc, "Precision": prec, "Recall": rec, "avg_time": avg_time}

def run_regression_checks():
    print("\n" + "=" * 90)
    print("REGRESSION CHECKS")
    print("=" * 90)

    # 1. demo_images/1_mixed.png
    demo_mixed_path = os.path.join(BASE_DIR, "..", "demo_images", "1_mixed.png")
    if os.path.exists(demo_mixed_path):
        img = cv2.imread(demo_mixed_path)
        res = analyze_image(img)
        print(f"\n1. demo_images/1_mixed.png (Default Settings):")
        print(f"   Workers: {res['total']} (Expected: 3)")
        print(f"   Compliant: {res['compliant']} (Expected: 1)")
        print(f"   Violations: {res['violations']} (Expected: 2)")
        for w in res['workers']:
            print(f"   Worker {w['id']}: Status={w['status']}, Helmet={w['helmet']}, Vest={w['vest']}, Mask={w['mask']}, Missing={w['missing']}")
    else:
        print(f"Warning: demo_images/1_mixed.png not found at {demo_mixed_path}")

    # 2. Image 1.png to Image 6.png
    print(f"\n2. Test Images (Image 1.png to Image 6.png):")
    for i in range(1, 7):
        p = os.path.join(TEST_IMAGES_DIR, f"Image {i}.png")
        if os.path.exists(p):
            img = cv2.imread(p)
            res = analyze_image(img)
            print(f"   Image {i}.png: Workers={res['total']}, Compliant={res['compliant']}, Violations={res['violations']}")

if __name__ == "__main__":
    # Run 1: Default Settings (require_mask = False)
    default_settings = {
        "require_helmet": True,
        "require_vest": True,
        "require_mask": False,
        "person_conf": 0.40,
        "ppe_conf": 0.25,
        "decision_conf": 0.30
    }
    evaluate_dataset(default_settings, "Default Settings (require_helmet=True, require_vest=True, require_mask=False)")

    # Run 2: Mask Required (require_mask = True)
    mask_req_settings = {
        "require_helmet": True,
        "require_vest": True,
        "require_mask": True,
        "person_conf": 0.40,
        "ppe_conf": 0.25,
        "decision_conf": 0.30
    }
    evaluate_dataset(mask_req_settings, "Mask Required (require_helmet=True, require_vest=True, require_mask=True)")

    # Run Regression Checks
    run_regression_checks()
