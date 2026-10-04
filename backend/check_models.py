import os
import glob
import cv2
from ultralytics import YOLO

def main():
    person_model_path = os.path.join("models", "yolov8n.pt")
    ppe_model_path = os.path.join("models", "ppe.pt")
    
    print(f"Loading person model from {person_model_path}...")
    person_model = YOLO(person_model_path)
    
    print(f"Loading PPE model from {ppe_model_path}...")
    ppe_model = YOLO(ppe_model_path)
    
    print("\nPPE Model Class Names:")
    print(ppe_model.names)
    print("-" * 50)
    
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

    print(f"Found {len(image_paths)} test image(s):\n")
    
    for img_path in image_paths:
        filename = os.path.basename(img_path)
        img = cv2.imread(img_path)
        if img is None:
            print(f"Could not read image {img_path}")
            continue
            
        person_results = person_model(img, classes=[0], conf=0.4, verbose=False)[0]
        num_persons = len(person_results.boxes) if person_results.boxes is not None else 0
        
        ppe_results = ppe_model(img, conf=0.35, verbose=False)[0]
        detected_ppe_classes = []
        if ppe_results.boxes is not None:
            for b in ppe_results.boxes:
                cls_id = int(b.cls[0].item())
                cls_name = ppe_model.names.get(cls_id, str(cls_id))
                conf = float(b.conf[0].item())
                detected_ppe_classes.append(f"{cls_name} ({conf:.2f})")
        
        annotated_img = ppe_results.plot()
        annotated_img = person_results.plot(img=annotated_img)
        
        out_filename = f"check_{filename}"
        out_path = os.path.join(output_dir, out_filename)
        cv2.imwrite(out_path, annotated_img)
        
        print(f"Image: {filename}")
        print(f"  - Persons detected: {num_persons}")
        print(f"  - PPE classes detected: {detected_ppe_classes}")
        print(f"  - Output saved to: {out_path}")
        print("-" * 50)

if __name__ == "__main__":
    main()
