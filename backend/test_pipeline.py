import os
import glob
import cv2
from pipeline import analyze_image, annotate

def main():
    test_images_dir = os.path.join("test_images")
    output_dir = os.path.join("outputs")
    os.makedirs(output_dir, exist_ok=True)

    image_extensions = ("*.jpg", "*.jpeg", "*.png", "*.bmp", "*.webp")
    image_paths = []
    for ext in image_extensions:
        image_paths.extend(glob.glob(os.path.join(test_images_dir, ext)))
        image_paths.extend(glob.glob(os.path.join(test_images_dir, ext.upper())))

    image_paths = sorted(list(set(image_paths)))

    if not image_paths:
        print(f"No test images found in {test_images_dir}.")
        return

    print("=" * 70)
    print("PPE SAFETY MONITORING PIPELINE VERIFICATION")
    print("=" * 70)

    for img_path in image_paths:
        filename = os.path.basename(img_path)
        img = cv2.imread(img_path)
        if img is None:
            print(f"Error: Could not read {filename}")
            continue

        result = analyze_image(img)
        annotated_img = annotate(img, result)

        out_path = os.path.join(output_dir, f"result_{filename}")
        cv2.imwrite(out_path, annotated_img)

        print(f"\nIMAGE: {filename}")
        print("-" * 70)
        
        if not result["workers"]:
            print("No workers detected.")
        else:
            for w in result["workers"]:
                h_str = f"YES ({w['helmet_conf']:.2f})" if w['helmet'] else f"NO  ({w['helmet_conf']:.2f})"
                v_str = f"YES ({w['vest_conf']:.2f})" if w['vest'] else f"NO  ({w['vest_conf']:.2f})"
                
                missing_info = f" [Missing: {', '.join(w['missing'])}]" if w['missing'] else ""
                print(f"  Worker {w['id']} | Helmet: {h_str} | Vest: {v_str} | {w['status']}{missing_info}")

        print("-" * 70)
        print(f"SUMMARY: Total Workers: {result['total']} | Compliant: {result['compliant']} | Violations: {result['violations']}")
        print(f"Saved annotated result to: {out_path}\n")

    print("=" * 70)

if __name__ == "__main__":
    main()
