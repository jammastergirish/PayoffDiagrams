import asyncio
import threading
from ib_insync import *
from dataclasses import dataclass
from typing import List, Optional, Literal
import nest_asyncio

# Apply nest_asyncio to allow nested loops if needed, though threading should isolate it
nest_asyncio.apply()

@dataclass
class PositionModel:
    ticker: str
    position_type: Literal['stock', 'call', 'put']
    qty: float
    strike: Optional[float] = None
    expiry: Optional[str] = None
    dte: Optional[int] = None
    cost_basis: Optional[float] = 0.0
    unrealized_pnl: Optional[float] = 0.0
    # Greeks
    delta: Optional[float] = None
    gamma: Optional[float] = None
    theta: Optional[float] = None
    vega: Optional[float] = None
    iv: Optional[float] = None

class IBClient:
    def __init__(self, host='127.0.0.1', port=7496, client_id=1):
        self.host = host
        self.port = port
        self.client_id = client_id
        self.ib = IB()
        self.connected = False
        self._thread = None
        self._loop = None

    def start_loop(self):
        """Runs the IB event loop in a separate thread."""
        asyncio.set_event_loop(asyncio.new_event_loop())
        self._loop = asyncio.get_event_loop()
        try:
            self.ib.connect(self.host, self.port, self.client_id)
            self.connected = True
            print(f"Connected to IBKR on {self.host}:{self.port}")
            self.ib.run()
        except Exception as e:
            print(f"IBKR Connection failed: {e}")
            self.connected = False

    async def connect(self):
        """Starts the background thread."""
        if not self.connected:
            self._thread = threading.Thread(target=self.start_loop, daemon=True)
            self._thread.start()
            # Give it a moment to connect
            await asyncio.sleep(1)

    def get_positions(self) -> List[dict]:
        if not self.connected:
            return []
        
        try:
            # Accessing ib.positions() from another thread is thread-safe in ib_insync usually
            # but safer to copy data
            positions = self.ib.positions()
            portfolio = self.ib.portfolio()
            
            # Map logic to match PositionModel
            mapped_positions = []
            
            for pos in positions:
                contract = pos.contract
                
                # Simple stock mapping
                if contract.secType == 'STK':
                    mapped_positions.append({
                        "ticker": contract.symbol,
                        "position_type": "stock",
                        "qty": pos.position,
                        "cost_basis": pos.avgCost
                    })
                
                # Option mapping
                elif contract.secType == 'OPT':
                    expiry_formatted = f"{contract.lastTradeDateOrContractMonth[:4]}-{contract.lastTradeDateOrContractMonth[4:6]}-{contract.lastTradeDateOrContractMonth[6:]}"
                    
                    # Try to find portfolio item for PnP
                    pnl = 0
                    for item in portfolio:
                        if item.contract.conId == contract.conId:
                            pnl = item.unrealizedPNL
                            break
                    
                    mapped_positions.append({
                        "ticker": contract.symbol,
                        "position_type": "call" if contract.right == 'C' else "put",
                        "qty": pos.position,
                        "strike": contract.strike,
                        "expiry": expiry_formatted,
                        "cost_basis": pos.avgCost,
                        "unrealized_pnl": pnl
                    })
            
            return mapped_positions
        except Exception as e:
            print(f"Error fetching positions: {e}")
            return []

    def disconnect(self):
        if self.connected:
            self.ib.disconnect()
            self.connected = False

ib_client = IBClient()
