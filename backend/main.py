from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from .brokers.ibkr import ib_client, PositionModel
from .providers.massive import get_historical_bars, get_news, get_market_news, get_news_article as massive_get_article, get_ticker_details, get_daily_snapshot, get_options_chain as massive_get_options_chain
from .llm_client import analyze_market_news, analyze_ticker_news
from .common.utils import validate_symbol, format_error_response
from .common.cache import options_cache, historical_cache, snapshot_cache
import asyncio
import json
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, Any

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

# Allow CORS for local development and LAN access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for LAN access
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
        return format_error_response("Not connected to IBKR", positions=[])
    
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
        return format_error_response("Not connected to IBKR", success=False)
    
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
        return format_error_response("Not connected to IBKR", success=False)
    
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
    symbol_validated = validate_symbol(symbol)
    cache_key = f"{symbol_validated}_{max_strikes}"

    # Check cache unless force refresh
    if not force_refresh:
        cached_result = options_cache.get_with_metadata(cache_key)
        if cached_result:
            return {**cached_result["data"], **cached_result}

    # Fetch fresh data
    data = massive_get_options_chain(symbol_validated, max_strikes)

    # Cache the result if successful
    if not data.get("error"):
        options_cache.set(cache_key, data)

    return {**data, "cached": False}


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
    cache_key = f"{validate_symbol(symbol)}_{timeframe.upper()}"

    # Check cache with dynamic TTL based on timeframe
    if timeframe.upper() in ["1H", "1D"]:
        ttl = 60  # 1 minute for intraday
    elif timeframe.upper() == "1W":
        ttl = 120  # 2 minutes for weekly
    else:
        ttl = 300  # 5 minutes for monthly/yearly

    cached_result = historical_cache.get_with_metadata(cache_key, ttl)
    if cached_result:
        return {**cached_result["data"], **cached_result}

    # Fetch fresh data
    data = get_historical_bars(validate_symbol(symbol), timeframe.upper())

    # Cache if successful
    if not data.get("error"):
        historical_cache.set(cache_key, data)

    return data


@app.get("/api/ticker/{symbol}")
def get_ticker_info(symbol: str):
    """
    Get ticker details (company name, description, logo) from Massive.com.
    
    Args:
        symbol: Stock ticker (e.g., AAPL)
    """
    return get_ticker_details(validate_symbol(symbol))


@app.get("/api/snapshot/{symbol}")
def get_price_snapshot(symbol: str, force_refresh: bool = False):
    """
    Get current price and daily change for a symbol from Massive.com with smart caching.

    Args:
        symbol: Stock ticker (e.g., AAPL)
        force_refresh: Force bypass cache
    """
    cache_key = validate_symbol(symbol)

    # Check cache unless force refresh
    if not force_refresh:
        # Use market-hours-aware TTL from cache manager
        cached_result = snapshot_cache.get_with_metadata(cache_key)
        if cached_result:
            return {**cached_result["data"], **cached_result}

    # Fetch fresh data
    data = get_daily_snapshot(validate_symbol(symbol))

    # Cache if successful
    if data and not data.get("error"):
        snapshot_cache.set(cache_key, data)

    return data


@app.get("/api/news/market")
def get_market_news_headlines(limit: int = 25):
    """
    Get general market news from Massive.com across major indices.
    
    Args:
        limit: Max number of headlines (1-50, default 25)
    """
    return get_market_news(limit)


@app.get("/api/news/{symbol}")
def get_news_headlines(symbol: str, limit: int = 15):
    """
    Get news headlines for a symbol from Massive.com Benzinga API.
    
    Args:
        symbol: Stock ticker (e.g., AAPL)
        limit: Max number of headlines (1-100, default 15)
    """
    return get_news(validate_symbol(symbol), limit)


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
        options_cache.clear()
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
        "options_chain": options_cache.stats(),
        "historical": historical_cache.stats(),
        "snapshot": snapshot_cache.stats(),
        "server_time": datetime.now().isoformat(),
        "market_hours_cache_ttl": options_cache.get_market_hours_ttl()
    }


# ==================
# LLM Analysis Routes
# ==================

class ArticleForAnalysis(BaseModel):
    headline: str
    body: str | None = None

class MarketNewsAnalysisRequest(BaseModel):
    articles: list[ArticleForAnalysis]
    tickers: list[str]

class TickerNewsAnalysisRequest(BaseModel):
    articles: list[ArticleForAnalysis]
    ticker: str


@app.post("/api/llm/analyze-market-news")
def llm_analyze_market_news(request: MarketNewsAnalysisRequest):
    """
    Analyze market news articles for portfolio impact using LLM.
    
    Returns AI-generated summary of how articles affect the portfolio.
    """
    articles = [a.model_dump() for a in request.articles]
    result = analyze_market_news(articles, request.tickers)
    return result


@app.post("/api/llm/analyze-ticker-news")
def llm_analyze_ticker_news(request: TickerNewsAnalysisRequest):
    """
    Analyze news articles for a specific ticker using LLM.
    
    Returns AI-generated summary of how articles affect the stock.
    """
    articles = [a.model_dump() for a in request.articles]
    result = analyze_ticker_news(articles, request.ticker)
    return result
