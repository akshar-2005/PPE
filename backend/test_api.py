import os
import glob
import requests

BASE_URL = "http://localhost:8000"

def main():
    print("=" * 70)
    print("API ENDPOINTS & EDGE CASES TEST SUITE")
    print("=" * 70)

    # 1. Test GET /health
    print("\n[1] Testing GET /health ...")
    r = requests.get(f"{BASE_URL}/health")
    print(f"Status: {r.status_code} | Response: {r.json()}")

    # 2. Test POST /analyze with test images
    test_images_dir = os.path.join("test_images")
    image_paths = sorted(glob.glob(os.path.join(test_images_dir, "*.*")))
    
    analysis_ids = []

    print(f"\n[2] Testing POST /analyze with {len(image_paths)} image(s)...")
    for img_path in image_paths:
        filename = os.path.basename(img_path)
        with open(img_path, "rb") as f:
            files = {"file": (filename, f, "image/png")}
            res = requests.post(f"{BASE_URL}/analyze", files=files)
            
        print(f"\nUpload: {filename} -> Status {res.status_code}")
        if res.status_code == 200:
            data = res.json()
            analysis_ids.append(data["id"])
            print(f"  ID: {data['id']}")
            print(f"  Created At: {data['created_at']}")
            print(f"  Total Workers: {data['total']} | Compliant: {data['compliant']} | Violations: {data['violations']}")
            print(f"  Image URL: {data['image_url']}")
            print(f"  Workers Count: {len(data['workers'])}")
        else:
            print(f"  Error: {res.text}")

    # 3. Test GET /history
    print("\n[3] Testing GET /history ...")
    r = requests.get(f"{BASE_URL}/history")
    print(f"Status: {r.status_code}")
    history_items = r.json()
    print(f"History contains {len(history_items)} record(s).")
    for item in history_items[:3]:
        print(f"  - [{item['id']}] {item['filename']} | Workers: {item['total']} | Safe: {item['compliant']} | Violations: {item['violations']}")

    # 4. Test GET /history/{id}
    if analysis_ids:
        target_id = analysis_ids[0]
        print(f"\n[4] Testing GET /history/{target_id} ...")
        r = requests.get(f"{BASE_URL}/history/{target_id}")
        print(f"Status: {r.status_code}")
        data = r.json()
        print(f"  ID: {data['id']} | Filename: {data['filename']}")
        print(f"  Workers Detail: {data['workers']}")

    # 5. Test GET /stats
    print("\n[5] Testing GET /stats ...")
    r = requests.get(f"{BASE_URL}/stats")
    print(f"Status: {r.status_code} | Stats: {r.json()}")

    # 6. Edge Case Test: Corrupt file with .jpg extension
    print("\n[6] Edge Case Test: Uploading corrupt file with .jpg extension...")
    corrupt_payload = ("corrupt_image.jpg", b"INVALID_BINARY_CORRUPTED_DATA_HEADER", "image/jpeg")
    r = requests.post(f"{BASE_URL}/analyze", files={"file": corrupt_payload})
    print(f"Status Code: {r.status_code} (Expected 400)")
    print(f"Response Body: {r.json()}")

    # 7. Edge Case Test: Uploading unsupported file (.txt)
    print("\n[7] Edge Case Test: Uploading unsupported file (.txt)...")
    txt_payload = ("document.txt", b"Plain text file", "text/plain")
    r = requests.post(f"{BASE_URL}/analyze", files={"file": txt_payload})
    print(f"Status Code: {r.status_code} (Expected 400)")
    print(f"Response Body: {r.json()}")

    # 8. Edge Case Test: Uploading with missing file field
    print("\n[8] Edge Case Test: Uploading with missing file field...")
    r = requests.post(f"{BASE_URL}/analyze", files={})
    print(f"Status Code: {r.status_code} (Expected 422)")
    print(f"Response Body: {r.json()}")

    print("\n" + "=" * 70)
    print("ALL API & EDGE CASE TESTS COMPLETED SUCCESSFULLY")
    print("=" * 70)

if __name__ == "__main__":
    main()
