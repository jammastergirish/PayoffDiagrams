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
    allow_origins=["http://localhost:3000"],
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
