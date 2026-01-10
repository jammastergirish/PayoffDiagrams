from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .ib_client import ib_client, PositionModel
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

@app.get("/api/portfolio")
def get_portfolio():
    if not ib_client.ib.isConnected():
        return {"error": "Not connected to IBKR", "positions": []}
    
    # In a real app we might want to await this if it was fetching live data
    # positions() is usually cached in ib_insync
    data = ib_client.get_positions()
    
    # Legacy check: if it's a list (old IBClient), wrap it. 
    # If it's a dict (New IBClient with summary), return as is.
    if isinstance(data, list):
        return {"positions": data}
    return data

# Timeframe presets mapping to IBKR parameters
TIMEFRAME_PRESETS = {
    "1Y": {"duration": "1 Y", "bar_size": "1 day"},
    "1M": {"duration": "1 M", "bar_size": "1 day"},
    "1W": {"duration": "1 W", "bar_size": "1 hour"},
    "1D": {"duration": "1 D", "bar_size": "5 mins"},
    "1H": {"duration": "3600 S", "bar_size": "1 min"},
}

@app.get("/api/historical/{symbol}")
def get_historical_data(symbol: str, timeframe: str = "1M"):
    """
    Get historical price data for a symbol.
    
    Args:
        symbol: Stock ticker (e.g., AAPL)
        timeframe: One of 1Y, 1M, 1W, 1D, 1H
    """
    if not ib_client.ib.isConnected():
        return {"error": "Not connected to IBKR", "bars": []}
    
    preset = TIMEFRAME_PRESETS.get(timeframe.upper(), TIMEFRAME_PRESETS["1M"])
    
    bars = ib_client.get_historical_data(
        symbol=symbol.upper(),
        duration=preset["duration"],
        bar_size=preset["bar_size"]
    )
    
    return {"symbol": symbol.upper(), "timeframe": timeframe, "bars": bars}

