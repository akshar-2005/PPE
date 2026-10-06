import os
import sys
import glob
import cv2

BASE_DIR = r"c:\Users\aksha\OneDrive\Desktop\Computer vision\ppe-vision\backend"
sys.path.insert(0, BASE_DIR)

from scratch.test_pipeline_candidate import check_ppe_enhanced, detect_workers, person_model

TEST_IMAGES_DIR = os.path.join(BASE_DIR, "test_images")
DEMO_IMAGES_DIR = os.path.join(BASE_DIR, "..", "demo_images")

def test_regression():
    print("\n=== 1. Regression on demo_images/1_mixed.png ===")
    p = os.path.join(DEMO_IMAGES_DIR, "1_mixed.png")
    img = cv2.imread(p)
    boxes = detect_workers(img, conf=0.40)
    print(f"Workers detected: {len(boxes)}")
    compliant = 0
    violations = 0
    for wid, b in enumerate(boxes, 1):
        res = check_ppe_enhanced(img, b, decision_conf=0.30)
        # Default requirements: helmet=True, vest=True
        is_safe = res["helmet"] and res["vest"]
        if is_safe:
            compliant += 1
        else:
            violations += 1
        print(f"  Worker {wid}: Safe={is_safe}, H={res['helmet']}({res['helmet_conf']}), V={res['vest']}({res['vest_conf']})")
        
    print(f"Total: {len(boxes)}, Compliant: {compliant}, Violations: {violations}")
    assert len(boxes) == 3 and compliant == 1 and violations == 2, "Regression failed on 1_mixed.png!"
    print(">>> 1_mixed.png regression check PASSED! <<<")

    print("\n=== 2. Regression on Image 1.png to Image 6.png ===")
    for i in range(1, 7):
        fn = f"Image {i}.png"
        p = os.path.join(TEST_IMAGES_DIR, fn)
        img = cv2.imread(p)
        boxes = detect_workers(img, conf=0.40)
        comp = 0
        viol = 0
        for wid, b in enumerate(boxes, 1):
            res = check_ppe_enhanced(img, b, decision_conf=0.30)
            if res["helmet"] and res["vest"]:
                comp += 1
            else:
                viol += 1
        print(f"  {fn}: Workers={len(boxes)}, Safe={comp}, Violations={viol}")

if __name__ == "__main__":
    test_regression()
