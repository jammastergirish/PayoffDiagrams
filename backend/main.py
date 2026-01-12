from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from .ib_client import ib_client, PositionModel
from .massive_client import get_historical_bars, get_news, get_news_article as massive_get_article, get_ticker_details, get_daily_snapshot
import asyncio
import json
from pathlib import Path

from contextlib import asynccontextmanager
import nest_asyncio

# Patch asyncio to allow nested event loops (required for ib_insync + uvicorn)
nest_asyncio.apply()

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


# ============================================
# MASSIVE.COM ENDPOINTS (Historical + News + Company Info)
# - Historical OHLC bars
# - Benzinga news headlines and articles
# - Ticker details (company info, branding)
# ============================================

@app.get("/api/historical/{symbol}")
def get_historical_data(symbol: str, timeframe: str = "1M"):
    """
    Get historical price data for a symbol from Massive.com.
    
    Args:
        symbol: Stock ticker (e.g., AAPL)
        timeframe: One of 1Y, 1M, 1W, 1D, 1H
    """
    return get_historical_bars(symbol.upper(), timeframe.upper())


@app.get("/api/ticker/{symbol}")
def get_ticker_info(symbol: str):
    """
    Get ticker details (company name, description, logo) from Massive.com.
    
    Args:
        symbol: Stock ticker (e.g., AAPL)
    """
    return get_ticker_details(symbol.upper())


@app.get("/api/snapshot/{symbol}")
def get_price_snapshot(symbol: str):
    """
    Get current price and daily change for a symbol from Massive.com.
    
    Args:
        symbol: Stock ticker (e.g., AAPL)
    """
    return get_daily_snapshot(symbol.upper())


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
