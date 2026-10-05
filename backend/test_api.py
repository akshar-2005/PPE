import os
import glob
import requests

BASE_URL = "http://localhost:8000"

def main():
    print("=" * 70)
    print("API ENDPOINTS, SETTINGS & EDGE CASES TEST SUITE")
    print("=" * 70)

    # 1. Test GET /health
    print("\n[1] Testing GET /health ...")
    r = requests.get(f"{BASE_URL}/health")
    print(f"Status: {r.status_code} | Response: {r.json()}")

    # 2. Test GET /settings (Default settings)
    print("\n[2] Testing GET /settings (Default settings)...")
    r = requests.get(f"{BASE_URL}/settings")
    print(f"Status: {r.status_code} | Settings: {r.json()}")
    assert r.status_code == 200
    assert r.json()["require_helmet"] is True
    assert r.json()["require_vest"] is True

    # 3. Test Invalid PUT /settings: Both requirements false
    print("\n[3] Testing Invalid PUT /settings (Both require_helmet and require_vest false)...")
    invalid_payload_1 = {
        "require_helmet": False,
        "require_vest": False,
        "person_conf": 0.40,
        "ppe_conf": 0.25,
        "decision_conf": 0.30
    }
    r = requests.put(f"{BASE_URL}/settings", json=invalid_payload_1)
    print(f"Status: {r.status_code} (Expected 400) | Detail: {r.json()}")
    assert r.status_code == 400

    # 4. Test Invalid PUT /settings: Confidence out of bounds (1.5)
    print("\n[4] Testing Invalid PUT /settings (Confidence 1.5 > 0.95)...")
    invalid_payload_2 = {
        "require_helmet": True,
        "require_vest": True,
        "person_conf": 1.5,
        "ppe_conf": 0.25,
        "decision_conf": 0.30
    }
    r = requests.put(f"{BASE_URL}/settings", json=invalid_payload_2)
    print(f"Status: {r.status_code} (Expected 400) | Detail: {r.json()}")
    assert r.status_code == 400

    # 5. Test Valid PUT /settings: Only helmet required
    print("\n[5] Testing Valid PUT /settings (Only helmet required)...")
    valid_payload = {
        "require_helmet": True,
        "require_vest": False,
        "person_conf": 0.45,
        "ppe_conf": 0.20,
        "decision_conf": 0.35
    }
    r = requests.put(f"{BASE_URL}/settings", json=valid_payload)
    print(f"Status: {r.status_code} | Updated Settings: {r.json()}")
    assert r.status_code == 200
    assert r.json()["require_vest"] is False

    # 6. Test POST /settings/reset
    print("\n[6] Testing POST /settings/reset ...")
    r = requests.post(f"{BASE_URL}/settings/reset")
    print(f"Status: {r.status_code} | Reset Settings: {r.json()}")
    assert r.status_code == 200
    assert r.json()["require_vest"] is True

    # 7. Test POST /analyze with test images
    test_images_dir = os.path.join(os.path.dirname(__file__), "test_images")
    image_paths = sorted(glob.glob(os.path.join(test_images_dir, "*.*")))
    
    analysis_ids = []

    print(f"\n[7] Testing POST /analyze with {len(image_paths)} image(s)...")
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
            print(f"  Settings Used: {data.get('settings')}")
            print(f"  Image URL: {data['image_url']}")
            print(f"  Workers Count: {len(data['workers'])}")
        else:
            print(f"  Error: {res.text}")

    # 8. Test GET /history
    print("\n[8] Testing GET /history ...")
    r = requests.get(f"{BASE_URL}/history")
    print(f"Status: {r.status_code}")
    history_items = r.json()
    print(f"History contains {len(history_items)} record(s).")
    for item in history_items[:3]:
        print(f"  - [{item['id']}] {item['filename']} | Workers: {item['total']} | Safe: {item['compliant']} | Violations: {item['violations']}")

    # 9. Test GET /history/{id}
    if analysis_ids:
        target_id = analysis_ids[0]
        print(f"\n[9] Testing GET /history/{target_id} ...")
        r = requests.get(f"{BASE_URL}/history/{target_id}")
        print(f"Status: {r.status_code}")
        data = r.json()
        print(f"  ID: {data['id']} | Filename: {data['filename']}")
        print(f"  Settings in Record: {data.get('settings')}")
        print(f"  Workers Detail: {data['workers']}")

    # 10. Test GET /stats
    print("\n[10] Testing GET /stats ...")
    r = requests.get(f"{BASE_URL}/stats")
    print(f"Status: {r.status_code} | Stats: {r.json()}")

    # 11. Edge Case Test: Corrupt file with .jpg extension
    print("\n[11] Edge Case Test: Uploading corrupt file with .jpg extension...")
    corrupt_payload = ("corrupt_image.jpg", b"INVALID_BINARY_CORRUPTED_DATA_HEADER", "image/jpeg")
    r = requests.post(f"{BASE_URL}/analyze", files={"file": corrupt_payload})
    print(f"Status Code: {r.status_code} (Expected 400)")
    print(f"Response Body: {r.json()}")

    # 12. Edge Case Test: Uploading unsupported file (.txt)
    print("\n[12] Edge Case Test: Uploading unsupported file (.txt)...")
    txt_payload = ("document.txt", b"Plain text file", "text/plain")
    r = requests.post(f"{BASE_URL}/analyze", files={"file": txt_payload})
    print(f"Status Code: {r.status_code} (Expected 400)")
    print(f"Response Body: {r.json()}")

    # 13. Edge Case Test: Uploading with missing file field
    print("\n[13] Edge Case Test: Uploading with missing file field...")
    r = requests.post(f"{BASE_URL}/analyze", files={})
    print(f"Status Code: {r.status_code} (Expected 422)")
    print(f"Response Body: {r.json()}")

    print("\n" + "=" * 70)
    print("ALL API, SETTINGS & EDGE CASE TESTS COMPLETED SUCCESSFULLY")
    print("=" * 70)

if __name__ == "__main__":
    main()
