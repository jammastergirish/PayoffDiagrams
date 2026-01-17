import os
import sys
from dotenv import load_dotenv
from datetime import datetime, timedelta

load_dotenv()

try:
    from alpaca.data.historical import NewsClient, StockHistoricalDataClient
    from alpaca.data.requests import NewsRequest, StockBarsRequest
    from alpaca.data.timeframe import TimeFrame
except ImportError:
    print("alpaca-py not installed")
    sys.exit(1)

api_key = os.getenv("ALPACA_API_KEY")
api_secret = os.getenv("ALPACA_API_SECRET")
print(f"Keys present: {bool(api_key)}, {bool(api_secret)}")

# --- TEST NEWS ---
print("\n--- Testing NewsSet Structure ---")
try:
    news_client = NewsClient(api_key, api_secret)
    req = NewsRequest(limit=1, symbols="AAPL")
    news_data = news_client.get_news(req)
    
    print(f"Type: {type(news_data)}")
    print(f"Dir: {dir(news_data)}")
    
    if hasattr(news_data, '__dict__'):
        print(f"Dict keys: {news_data.__dict__.keys()}")
    
    # Try subscript
    try:
        print(f"Subscript ['news']: {type(news_data['news'])}")
    except Exception as e:
        print(f"Subscript failed: {e}")
        
    # Try iteration
    print("Iterating:")
    for i, item in enumerate(news_data):
        print(f"  Item {i}: {type(item)} - {item}")
        if i >= 1: break

except Exception as e:
    print(f"News test failed: {e}")

# --- TEST BARS ---
print("\n--- Testing BarSet Structure ---")
try:
    stock_client = StockHistoricalDataClient(api_key, api_secret)
    req = StockBarsRequest(
        symbol_or_symbols=["AAPL"], # Try list
        timeframe=TimeFrame.Day,
        start=datetime.now() - timedelta(days=5),
        end=datetime.now()
    )
    bars_data = stock_client.get_stock_bars(req)
    
    print(f"Type: {type(bars_data)}")
    print(f"Dir: {dir(bars_data)}")
    
    if hasattr(bars_data, 'keys'):
        print(f"Keys(): {list(bars_data.keys())}")
    
    if "AAPL" in bars_data:
        print("AAPL found")
    else:
        print("AAPL NOT found")
        
except Exception as e:
    print(f"Bars test failed: {e}")
