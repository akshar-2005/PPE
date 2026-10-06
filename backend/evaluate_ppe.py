import os
import glob
import time
import cv2
from ground_truth import GROUND_TRUTH
from pipeline import analyze_image, detect_workers, check_ppe, evaluate

BASE_DIR = os.path.dirname(__file__)
TEST_IMAGES_DIR = os.path.join(BASE_DIR, "test_images")

def run_evaluation(settings=None, title="PPE Evaluation"):
    if settings is None:
        settings = {
            "require_helmet": True,
            "require_vest": True,
            "require_gloves": True,
            "require_goggles": True,
            "require_mask": True,
            "person_conf": 0.40,
            "ppe_conf": 0.25,
            "decision_conf": 0.30
        }

    image_paths = sorted(glob.glob(os.path.join(TEST_IMAGES_DIR, "ppe12_*.png")))
    
    print("\n" + "=" * 95)
    print(f"EVALUATION: {title}")
    print("=" * 95)

    stats = {
        item: {"TP": 0, "FP": 0, "TN": 0, "FN": 0}
        for item in ["helmet", "vest", "gloves", "goggles", "mask"]
    }
    
    total_time = 0.0
    total_workers_evaluated = 0

    for img_path in image_paths:
        fname = os.path.basename(img_path)
        img_bgr = cv2.imread(img_path)
        gt = GROUND_TRUTH.get(fname, {})

        t0 = time.time()
        result = analyze_image(img_bgr, settings=settings)
        dt = time.time() - t0
        total_time += dt

        print(f"\n--- {fname} ({dt*1000:.1f} ms) ---")
        
        for w in result["workers"]:
            wid = w["id"]
            if wid not in gt:
                continue
            total_workers_evaluated += 1
            w_gt = gt[wid]
            
            w_preds = {
                "helmet": (w["helmet"], w["helmet_conf"]),
                "vest": (w["vest"], w["vest_conf"]),
                "gloves": (w.get("gloves", False), w.get("gloves_conf", 0.0)),
                "goggles": (w.get("goggles", False), w.get("goggles_conf", 0.0)),
                "mask": (w.get("mask", False), w.get("mask_conf", 0.0)),
            }
            
            line_parts = [f"  Worker {wid}:"]
            for item in ["helmet", "vest", "gloves", "goggles", "mask"]:
                pred_val, conf = w_preds[item]
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

    avg_time = total_time / len(image_paths) if image_paths else 0.0
    print("\n" + "-" * 95)
    print(f"{'Item':<12} | {'TP':<5} | {'FP':<5} | {'TN':<5} | {'FN':<5} | {'Precision':<10} | {'Recall':<10} | {'Accuracy':<10}")
    print("-" * 95)
    
    overall_correct = 0
    overall_total = 0
    
    summary_dict = {}
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
        
        summary_dict[item] = {"TP": tp, "FP": fp, "TN": tn, "FN": fn, "Precision": prec, "Recall": rec, "Accuracy": acc}
        print(f"{item.capitalize():<12} | {tp:<5} | {fp:<5} | {tn:<5} | {fn:<5} | {prec:>8.1f}% | {rec:>8.1f}% | {acc:>8.1f}%")

    overall_acc = (overall_correct / overall_total * 100.0) if overall_total > 0 else 0.0
    print("-" * 95)
    print(f"Overall Item Accuracy: {overall_acc:.1f}% ({overall_correct}/{overall_total} correct classifications across {total_workers_evaluated} workers)")
    print(f"Total Inference Time: {total_time:.3f}s ({avg_time:.3f}s per image)\n")
    
    return summary_dict, avg_time

if __name__ == "__main__":
    run_evaluation(title="Baseline (Current pipeline.py)")
