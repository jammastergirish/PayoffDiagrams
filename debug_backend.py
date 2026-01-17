import os
import sys
from fastapi.testclient import TestClient

# Mock environment variables
os.environ["DATA_PROVIDER"] = "alpaca"
os.environ["NEWS_PROVIDER"] = "alpaca"
os.environ["BROKERAGE_PROVIDER"] = "alpaca"
# Assuming user has keys. If not, we might fail auth, but we want to see if it CRASHES.
# We'll set dummy keys to pass 'if key:' checks, but expect auth errors from API.
os.environ["ALPACA_API_KEY"] = "pk_DUMMY"
os.environ["ALPACA_API_SECRET"] = "sk_DUMMY"
# os.environ["MASSIVE_API_KEY"] = "mk_DUMMY"

try:
    from backend.main import app, config
    print("Successfully imported backend.main")
except Exception as e:
    print(f"Failed to import backend.main: {e}")
    sys.exit(1)

client = TestClient(app)

print(f"Configured Broker: {config.broker_name}")
print(f"Active Broker Instance: {config.broker}")

print("\n--- Testing Health ---")
try:
    response = client.get("/api/health")
    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}")
except Exception as e:
    print(f"Health check failed: {e}")

print("\n--- Testing Market News ---")
try:
    response = client.get("/api/news/market")
    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}")
except Exception as e:
    print(f"Market news failed: {e}")

print("\n--- Testing Historical Data ---")
try:
    response = client.get("/api/historical/AAPL?timeframe=1D")
    print(f"Status: {response.status_code}")
    # Truncate bars for brevity
    data = response.json()
    if "bars" in data:
        data["bars"] = f"[{len(data['bars'])} bars]"
    print(f"Response: {data}")
except Exception as e:
    print(f"Historical data failed: {e}")
