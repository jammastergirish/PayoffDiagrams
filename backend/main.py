from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .ib_client import ib_client, PositionModel
from .massive_client import get_historical_bars, get_news, get_news_article as massive_get_article, get_ticker_details
import asyncio

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

