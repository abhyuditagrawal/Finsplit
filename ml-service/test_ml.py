import requests
import json

print("🧪 Testing Python ML Service...\n")

# Test 1: Health Check
print("Test 1: Health Check")
try:
    response = requests.get("http://localhost:5001/health")  # Changed to 5001
    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}\n")
except Exception as e:
    print(f"❌ Error: {e}\n")

# Test 2: Simple Prediction
print("Test 2: Simple Prediction")
sample_data = {
    "user_id": "test123",
    "expenses": [
        {"amount": 2500, "category": "Food & Dining", "date": "2025-05-15", "user_share": 0},
        {"amount": 1500, "category": "Transportation", "date": "2025-05-20", "user_share": 0},
        {"amount": 3000, "category": "Shopping", "date": "2025-06-10", "user_share": 0},
        {"amount": 2000, "category": "Food & Dining", "date": "2025-06-15", "user_share": 0},
        {"amount": 1800, "category": "Transportation", "date": "2025-07-05", "user_share": 0},
        {"amount": 2200, "category": "Food & Dining", "date": "2025-07-12", "user_share": 0},
        {"amount": 2500, "category": "Shopping", "date": "2025-08-08", "user_share": 0},
        {"amount": 1600, "category": "Transportation", "date": "2025-08-18", "user_share": 0},
        {"amount": 2300, "category": "Food & Dining", "date": "2025-09-05", "user_share": 0},
        {"amount": 3200, "category": "Shopping", "date": "2025-09-22", "user_share": 0},
        {"amount": 2100, "category": "Food & Dining", "date": "2025-10-10", "user_share": 0},
        {"amount": 1700, "category": "Transportation", "date": "2025-10-15", "user_share": 0},
    ],
    "periods": 3
}

try:
    response = requests.post("http://localhost:5001/predict", json=sample_data)  # Changed to 5001
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        result = response.json()
        print("✅ Prediction successful!\n")
        print(json.dumps(result, indent=2))
    else:
        print(f"❌ Error: {response.json()}")
except Exception as e:
    print(f"❌ Error: {e}")
