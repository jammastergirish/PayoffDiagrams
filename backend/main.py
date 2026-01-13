from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from .ib_client import ib_client, PositionModel
from .massive_client import get_historical_bars, get_news, get_news_article as massive_get_article, get_ticker_details, get_daily_snapshot, get_options_chain as massive_get_options_chain
import asyncio
import json
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, Any

from contextlib import asynccontextmanager
import nest_asyncio

# Patch asyncio to allow nested event loops (required for ib_insync + uvicorn)
nest_asyncio.apply()

# Options chain cache: symbol -> (timestamp, data)
# Stored in memory - cleared on server restart
options_chain_cache: Dict[str, tuple[datetime, Any]] = {}

# Dynamic cache TTL based on market hours
def get_cache_ttl() -> int:
    """Returns cache TTL in seconds based on market hours."""
    now = datetime.now()
    weekday = now.weekday()
    hour = now.hour

    # Weekend (Saturday=5, Sunday=6): longer cache
    if weekday >= 5:
        return 300  # 5 minutes on weekends

    # Market hours (9:30 AM - 4:00 PM ET, roughly 6:30 AM - 1:00 PM PT)
    # Adjust these hours based on your timezone
    if 6 <= hour < 13:  # Pacific time market hours
        return 60  # 1 minute during market hours for fresher data
    elif 13 <= hour < 16:  # After market close but still active
        return 120  # 2 minutes
    else:
        return 180  # 3 minutes outside market hours

# Historical data cache
historical_cache: Dict[str, tuple[datetime, Any]] = {}
HISTORICAL_CACHE_TTL = 60  # 1 minute for historical data

# Daily snapshot cache (for watchlist)
snapshot_cache: Dict[str, tuple[datetime, Any]] = {}
SNAPSHOT_CACHE_TTL = 30  # 30 seconds for snapshots during market hours

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    asyncio.create_task(ib_client.connect())
    yield
    # Shutdown
    ib_client.disconnect()

app = FastAPI(lifespan=lifespan)

# Allow CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health():
    return {
        "status": "ok", 
        "ib_connected": ib_client.ib.isConnected()
    }

# ============================================
# IBKR ENDPOINTS (Live Data Only)
# - Positions, P&L, Greeks
# - Real-time market data
# ============================================

@app.get("/api/portfolio")
def get_portfolio():
    if not ib_client.ib.isConnected():
        return {"error": "Not connected to IBKR", "positions": []}
    
    data = ib_client.get_positions()
    
    if isinstance(data, list):
        return {"positions": data}
    return data


# Trade Order Model
from typing import Optional, Literal

class TradeOrder(BaseModel):
    symbol: str
    action: Literal["BUY", "SELL"]
    quantity: int
    order_type: Literal["MARKET", "LIMIT"]
    limit_price: Optional[float] = None


@app.post("/api/trade")
def place_trade(order: TradeOrder):
    """
    Place a stock order through IBKR.
    
    Args:
        order: TradeOrder with symbol, action, quantity, order_type, and optional limit_price
    
    Returns:
        Order result with success status, order_id, and message/error
    """
    if not ib_client.ib.isConnected():
        return {"success": False, "error": "Not connected to IBKR"}
    
    result = ib_client.place_order(
        symbol=order.symbol,
        action=order.action,
        quantity=order.quantity,
        order_type=order.order_type,
        limit_price=order.limit_price
    )
    
    return result


# Options Trade Order Model
from typing import List

class OptionLeg(BaseModel):
    symbol: str
    expiry: str  # YYYYMMDD format
    strike: float
    right: Literal["C", "P"]
    action: Literal["BUY", "SELL"]
    quantity: int

class OptionsTradeOrder(BaseModel):
    legs: List[OptionLeg]
    order_type: Literal["MARKET", "LIMIT"] = "MARKET"
    limit_price: Optional[float] = None


@app.post("/api/options/trade")
def place_options_trade(order: OptionsTradeOrder):
    """
    Place an options order through IBKR.
    
    Supports single-leg orders and multi-leg combos (spreads, etc.)
    
    Args:
        order: OptionsTradeOrder with legs, order_type, and optional limit_price
    
    Returns:
        Order result with success status, order_id, and message/error
    """
    if not ib_client.ib.isConnected():
        return {"success": False, "error": "Not connected to IBKR"}
    
    # Convert Pydantic models to dicts for the IB client
    legs_data = [leg.model_dump() for leg in order.legs]
    
    result = ib_client.place_options_order(
        legs=legs_data,
        order_type=order.order_type,
        limit_price=order.limit_price
    )
    
    return result

@app.get("/api/options-chain/{symbol}")
def get_options_chain_endpoint(symbol: str, max_strikes: int = 30, force_refresh: bool = False):
    """
    Get options chain for a symbol from Massive.com with caching.

    Note: Requires Massive.com Options subscription.

    Args:
        symbol: Stock ticker (e.g., AAPL)
        max_strikes: Maximum number of strikes to return (centered around ATM)
        force_refresh: Force refresh the cache

    Returns:
        Options chain with expirations, strikes, calls, and puts data
    """
    symbol_upper = symbol.upper()
    cache_key = f"{symbol_upper}_{max_strikes}"

    # Check cache unless force refresh
    if not force_refresh and cache_key in options_chain_cache:
        cached_time, cached_data = options_chain_cache[cache_key]
        cache_ttl = get_cache_ttl()
        if datetime.now() - cached_time < timedelta(seconds=cache_ttl):
            # Return cached data with cache metadata
            return {
                **cached_data,
                "cached": True,
                "cache_age_seconds": int((datetime.now() - cached_time).total_seconds())
            }

    # Fetch fresh data
    data = massive_get_options_chain(symbol_upper, max_strikes)

    # Cache the result if successful
    if not data.get("error"):
        options_chain_cache[cache_key] = (datetime.now(), data)

    return {
        **data,
        "cached": False
    }


# ============================================
# MASSIVE.COM ENDPOINTS (Historical + News + Company Info)
# - Historical OHLC bars
# - Benzinga news headlines and articles
# - Ticker details (company info, branding)
# ============================================

@app.get("/api/historical/{symbol}")
def get_historical_data(symbol: str, timeframe: str = "1M"):
    """
    Get historical price data for a symbol from Massive.com with smart caching.

    Args:
        symbol: Stock ticker (e.g., AAPL)
        timeframe: One of 1Y, 1M, 1W, 1D, 1H
    """
    cache_key = f"{symbol.upper()}_{timeframe.upper()}"

    # Check cache for recent data
    if cache_key in historical_cache:
        cached_time, cached_data = historical_cache[cache_key]
        # Shorter cache for intraday data, longer for daily/weekly/yearly
        if timeframe.upper() in ["1H", "1D"]:
            cache_ttl = 60  # 1 minute for intraday
        elif timeframe.upper() == "1W":
            cache_ttl = 120  # 2 minutes for weekly
        else:
            cache_ttl = 300  # 5 minutes for monthly/yearly

        if datetime.now() - cached_time < timedelta(seconds=cache_ttl):
            return {
                **cached_data,
                "cached": True,
                "cache_age_seconds": int((datetime.now() - cached_time).total_seconds())
            }

    # Fetch fresh data
    data = get_historical_bars(symbol.upper(), timeframe.upper())

    # Cache if successful
    if not data.get("error"):
        historical_cache[cache_key] = (datetime.now(), data)

    return data


@app.get("/api/ticker/{symbol}")
def get_ticker_info(symbol: str):
    """
    Get ticker details (company name, description, logo) from Massive.com.
    
    Args:
        symbol: Stock ticker (e.g., AAPL)
    """
    return get_ticker_details(symbol.upper())


@app.get("/api/snapshot/{symbol}")
def get_price_snapshot(symbol: str, force_refresh: bool = False):
    """
    Get current price and daily change for a symbol from Massive.com with smart caching.

    Args:
        symbol: Stock ticker (e.g., AAPL)
        force_refresh: Force bypass cache
    """
    cache_key = symbol.upper()

    # Check cache unless force refresh
    if not force_refresh and cache_key in snapshot_cache:
        cached_time, cached_data = snapshot_cache[cache_key]
        # Dynamic TTL based on market hours
        cache_ttl = 30 if get_cache_ttl() <= 60 else 60  # 30s during market, 60s otherwise

        if datetime.now() - cached_time < timedelta(seconds=cache_ttl):
            return {
                **cached_data,
                "cached": True,
                "cache_age_seconds": int((datetime.now() - cached_time).total_seconds())
            }

    # Fetch fresh data
    data = get_daily_snapshot(cache_key)

    # Cache if successful
    if data and not data.get("error"):
        snapshot_cache[cache_key] = (datetime.now(), data)

    return data


@app.get("/api/news/{symbol}")
def get_news_headlines(symbol: str, limit: int = 15):
    """
    Get news headlines for a symbol from Massive.com Benzinga API.
    
    Args:
        symbol: Stock ticker (e.g., AAPL)
        limit: Max number of headlines (1-100, default 15)
    """
    return get_news(symbol.upper(), limit)


@app.get("/api/news/article/{article_id}")
def get_article(article_id: str):
    """
    Get full article content from Benzinga.
    
    Args:
        article_id: The benzinga_id of the article
    """
    return massive_get_article(article_id)


# ============================================
# Cache Management Endpoint
# ============================================

@app.post("/api/cache/clear")
def clear_cache(cache_type: str = "all"):
    """Clear various caches. Useful for debugging or forcing fresh data."""
    cleared = []

    if cache_type in ["all", "options"]:
        options_chain_cache.clear()
        cleared.append("options")

    if cache_type in ["all", "historical"]:
        historical_cache.clear()
        cleared.append("historical")

    if cache_type in ["all", "snapshot"]:
        snapshot_cache.clear()
        cleared.append("snapshot")

    return {"status": "success", "cleared": cleared}

@app.get("/api/cache/stats")
def get_cache_stats():
    """Get cache statistics for monitoring."""
    return {
        "options_chain": {
            "entries": len(options_chain_cache),
            "symbols": list(set(k.split("_")[0] for k in options_chain_cache.keys())),
            "current_ttl": get_cache_ttl()
        },
        "historical": {
            "entries": len(historical_cache),
            "symbols": list(set(k.split("_")[0] for k in historical_cache.keys()))
        },
        "snapshot": {
            "entries": len(snapshot_cache),
            "symbols": list(snapshot_cache.keys())
        },
        "server_time": datetime.now().isoformat(),
        "market_hours_cache_ttl": get_cache_ttl()
    }

# ============================================
# WATCHLIST ENDPOINTS (Custom Tickers)
# - Stored in watchlist.json in project root
# ============================================

WATCHLIST_FILE = Path(__file__).parent.parent / "watchlist.json"


class WatchlistTicker(BaseModel):
    ticker: str


def _read_watchlist() -> list[str]:
    """Read watchlist from JSON file."""
    try:
        if WATCHLIST_FILE.exists():
            data = json.loads(WATCHLIST_FILE.read_text())
            return data.get("tickers", [])
    except Exception as e:
        print(f"Error reading watchlist: {e}")
    return []


def _write_watchlist(tickers: list[str]):
    """Write watchlist to JSON file."""
    try:
        WATCHLIST_FILE.write_text(json.dumps({"tickers": tickers}, indent=2))
    except Exception as e:
        print(f"Error writing watchlist: {e}")


@app.get("/api/watchlist")
def get_watchlist():
    """Get all tickers in the watchlist."""
    return {"tickers": _read_watchlist()}


@app.post("/api/watchlist")
def add_to_watchlist(item: WatchlistTicker):
    """Add a ticker to the watchlist."""
    ticker = item.ticker.upper().strip()
    if not ticker:
        return {"error": "Ticker cannot be empty"}
    
    tickers = _read_watchlist()
    if ticker not in tickers:
        tickers.append(ticker)
        tickers.sort()
        _write_watchlist(tickers)
    
    return {"tickers": tickers}


@app.delete("/api/watchlist/{ticker}")
def remove_from_watchlist(ticker: str):
    """Remove a ticker from the watchlist."""
    ticker = ticker.upper().strip()
    tickers = _read_watchlist()
    
    if ticker in tickers:
        tickers.remove(ticker)
        _write_watchlist(tickers)
    
    return {"tickers": tickers}
