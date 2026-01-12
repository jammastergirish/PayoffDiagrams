"""
Massive.com REST API Client for Historical Price Data.

This module handles ONLY historical OHLC data from Massive.com.
It is completely independent of the IBKR client.

Live data (positions, P&L, Greeks, news) comes from ib_client.py.
"""

import os
from datetime import datetime, timedelta
from typing import Optional
from dotenv import load_dotenv
from massive import RESTClient

# Load environment variables from .env file
load_dotenv()

# Initialize the Massive REST client with API key
_api_key = os.getenv("MASSIVE_API_KEY")
if not _api_key:
    print("WARNING: MASSIVE_API_KEY not found in environment. Historical data will not work.")
    _client: Optional[RESTClient] = None
else:
    _client = RESTClient(api_key=_api_key)


# Timeframe configuration mapping
# Maps app timeframes to Massive API parameters
TIMEFRAME_CONFIG = {
    "1Y": {"multiplier": 1, "timespan": "day", "days_back": 365},
    "1M": {"multiplier": 1, "timespan": "day", "days_back": 30},
    "1W": {"multiplier": 1, "timespan": "hour", "days_back": 7},
    "1D": {"multiplier": 5, "timespan": "minute", "days_back": 1},
    "1H": {"multiplier": 1, "timespan": "minute", "days_back": 0, "hours_back": 1},
}


def get_historical_bars(symbol: str, timeframe: str = "1M") -> dict:
    """
    Fetch historical OHLC bars from Massive.com API.
    
    Args:
        symbol: Stock ticker (e.g., "AAPL")
        timeframe: One of "1Y", "1M", "1W", "1D", "1H"
        
    Returns:
        Dict with symbol, timeframe, and bars list
    """
    if not _client:
        return {
            "symbol": symbol,
            "timeframe": timeframe,
            "bars": [],
            "error": "Massive API key not configured"
        }
    
    config = TIMEFRAME_CONFIG.get(timeframe.upper(), TIMEFRAME_CONFIG["1M"])
    
    # Calculate date range
    now = datetime.now()
    if "hours_back" in config:
        from_date = now - timedelta(hours=config["hours_back"])
    else:
        from_date = now - timedelta(days=config["days_back"])
    
    # Format dates for Massive API (YYYY-MM-DD or millisecond timestamp)
    from_str = from_date.strftime("%Y-%m-%d")
    to_str = now.strftime("%Y-%m-%d")
    
    try:
        # Call Massive.com Aggregates (Bars) API
        # GET /v2/aggs/ticker/{stocksTicker}/range/{multiplier}/{timespan}/{from}/{to}
        aggs = _client.get_aggs(
            ticker=symbol.upper(),
            multiplier=config["multiplier"],
            timespan=config["timespan"],
            from_=from_str,
            to=to_str,
            adjusted=True,
            sort="asc",
            limit=50000
        )
        
        # Convert response to our bar format
        # The massive package returns a list of Agg objects directly
        bars = []
        if aggs:
            for agg in aggs:
                # Convert timestamp (milliseconds) to ISO date string
                ts_ms = agg.timestamp if hasattr(agg, 'timestamp') else (agg.t if hasattr(agg, 't') else 0)
                dt = datetime.fromtimestamp(ts_ms / 1000)
                
                bars.append({
                    "date": dt.isoformat(),
                    "open": float(agg.open) if hasattr(agg, 'open') else float(agg.o) if hasattr(agg, 'o') else 0,
                    "high": float(agg.high) if hasattr(agg, 'high') else float(agg.h) if hasattr(agg, 'h') else 0,
                    "low": float(agg.low) if hasattr(agg, 'low') else float(agg.l) if hasattr(agg, 'l') else 0,
                    "close": float(agg.close) if hasattr(agg, 'close') else float(agg.c) if hasattr(agg, 'c') else 0,
                    "volume": int(agg.volume) if hasattr(agg, 'volume') else int(agg.v) if hasattr(agg, 'v') else 0,
                    "vwap": float(agg.vwap) if hasattr(agg, 'vwap') else float(agg.vw) if hasattr(agg, 'vw') else None,
                    "transactions": int(agg.transactions) if hasattr(agg, 'transactions') else int(agg.n) if hasattr(agg, 'n') else None,
                })
        
        print(f"DEBUG [Massive]: Retrieved {len(bars)} bars for {symbol} ({timeframe})")
        
        return {
            "symbol": symbol.upper(),
            "timeframe": timeframe.upper(),
            "bars": bars
        }
        
    except Exception as e:
        print(f"ERROR [Massive]: Failed to fetch historical data for {symbol}: {e}")
        import traceback
        traceback.print_exc()
        return {
            "symbol": symbol.upper(),
            "timeframe": timeframe.upper(),
            "bars": [],
            "error": str(e)
        }


def get_ticker_details(symbol: str) -> dict:
    """
    Fetch ticker details (company info, branding) from Massive.com API.
    
    Args:
        symbol: Stock ticker (e.g., "AAPL")
        
    Returns:
        Dict with ticker details including name, description, branding URLs
    """
    if not _client:
        return {"error": "Massive API key not configured"}
    
    try:
        # GET /v3/reference/tickers/{ticker}
        response = _client.get_ticker_details(ticker=symbol.upper())
        
        if response and hasattr(response, 'results'):
            r = response.results
            return {
                "symbol": symbol.upper(),
                "name": getattr(r, 'name', None),
                "description": getattr(r, 'description', None),
                "homepage_url": getattr(r, 'homepage_url', None),
                "market_cap": getattr(r, 'market_cap', None),
                "total_employees": getattr(r, 'total_employees', None),
                "list_date": getattr(r, 'list_date', None),
                "branding": {
                    "logo_url": getattr(r.branding, 'logo_url', None) if hasattr(r, 'branding') else None,
                    "icon_url": getattr(r.branding, 'icon_url', None) if hasattr(r, 'branding') else None,
                } if hasattr(r, 'branding') else None
            }
        
        return {"symbol": symbol.upper(), "error": "No details found"}
        
    except Exception as e:
        print(f"ERROR [Massive]: Failed to fetch ticker details for {symbol}: {e}")
        return {"symbol": symbol.upper(), "error": str(e)}
