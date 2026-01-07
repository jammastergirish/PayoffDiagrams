import asyncio
import threading
from typing import Optional, List, Literal
from dataclasses import dataclass
from ib_insync import IB, Stock, Option, util
import math
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
    # Live Data
    current_price: Optional[float] = 0.0 # Underlying price for stocks, Mark for options
    underlying_price: Optional[float] = None
    # Greeks
    delta: Optional[float] = None
    gamma: Optional[float] = None
    theta: Optional[float] = None
    vega: Optional[float] = None
    iv: Optional[float] = None

import random

class IBClient:
    def __init__(self, host='127.0.0.1', port=7496, client_id=None):
        self.host = host
        self.port = port
        self.client_id = client_id if client_id is not None else random.randint(1000, 9999)
        self.ib = IB()
        self.connected = False
        self._thread = None
        self._loop = None
        # Cache for live market data tickers
        self.market_data = {} 
        self.subscribed_contracts = set()
        self.subscribed_symbols = set()
        self.subscribed_accounts = set()
        self.account_summary_cache = {} # Cache for live account summary data

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
            await asyncio.sleep(1)

    def _safe_float(self, val, default=0.0):
        """Converts value to float, handling None and NaN."""
        if val is None:
            return default
        try:
            f_val = float(val)
            if math.isnan(f_val) or math.isinf(f_val):
                return default
            return f_val
        except (ValueError, TypeError):
            return default

    def _ensure_market_data(self, contract):
        """Subscribes to market data if not already subscribed."""
        if contract.conId not in self.subscribed_contracts:
            # Generic ticks: 221=Mark Price (good for offline/charts)
            self.ib.reqMktData(contract, '221', False, False)
            self.subscribed_contracts.add(contract.conId)
            # Also subscribe to underlying for options to get 'underlying_price'
            # Note: For simplicity, we rely on option greeks to give underlying price often, or request separately
            if contract.secType == 'OPT':
                # We could request the underlying contract too, but let's see if option market data is enough first
                pass

    def get_positions(self) -> List[dict]:
        if not self.connected:
            return []
        
        try:
            positions = self.ib.positions()
            portfolio = self.ib.portfolio()
            print(f"DEBUG: Found {len(positions)} positions from IB")
            print(f"DEBUG: Found {len(portfolio)} portfolio items from IB")
            
            mapped_positions = []
            
            for pos in positions:
                contract = pos.contract
                
                # Check for nulls
                if not contract: continue

                # Fix for Error 321: Ensure Exchange and Currency are set
                # IBKR positions sometimes have empty exchange for options
                if not contract.exchange:
                    contract.exchange = 'SMART'
                if not contract.currency:
                    contract.currency = 'USD'
                
                # Subscribe to Account Updates to ensure portfolio() is populated
                if pos.account not in self.subscribed_accounts:
                    try:
                        print(f"Subscribing to Account Updates for {pos.account}")
                        # Use low-level client method to avoid blocking wait in ib_insync's IB.reqAccountUpdates
                        self.ib.client.reqAccountUpdates(True, pos.account)
                        self.subscribed_accounts.add(pos.account)
                    except Exception as e:
                        print(f"Error subscribing to account updates for {pos.account}: {e}")

            # Now process positions and portfolio items
            for pos in positions:
                contract = pos.contract
                
                # Ensure we are subscribed to live data
                self._ensure_market_data(contract)
                
                # Get latest ticker snapshot
                ticker = self.ib.ticker(contract)
                
                # If ticker is None (shouldn't happen if contract is valid but good safety)
                if ticker is None:
                    print(f"DEBUG: Ticker not found for {contract.symbol} (ConId: {contract.conId})")
                    continue
                
                print(f"DEBUG: Processing {contract.symbol} | SecType: {contract.secType}")

                current_price = self._safe_float(ticker.marketPrice()) or self._safe_float(ticker.last) or self._safe_float(ticker.close) or 0.0
                prior_close = self._safe_float(ticker.close)
                
                # Greeks extraction
                delta, gamma, theta, vega, iv, und_price = 0.0, 0.0, 0.0, 0.0, 0.0, 0.0
                if ticker.modelGreeks:
                    delta = self._safe_float(ticker.modelGreeks.delta)
                    gamma = self._safe_float(ticker.modelGreeks.gamma)
                    theta = self._safe_float(ticker.modelGreeks.theta)
                    vega = self._safe_float(ticker.modelGreeks.vega)
                    iv = self._safe_float(ticker.modelGreeks.impliedVol)
                    und_price = self._safe_float(ticker.modelGreeks.undPrice)
                
                # Fallback for underlying price from live stock ticker if option
                # If it's an option, we need the underlying price for the diagram
                if contract.secType == 'OPT' and (und_price == 0 or und_price is None):
                     found_price = 0.0
                     # Search through all tickers we are connected to
                     for t in self.ib.tickers():
                         if t.contract.symbol == contract.symbol and t.contract.secType == 'STK':
                             found_price = self._safe_float(t.marketPrice()) or self._safe_float(t.last) or self._safe_float(t.close)
                             if found_price > 0:
                                 break
                     
                     if found_price == 0:
                         # Automatically subscribe to the underlying Stock if not done yet
                         if contract.symbol not in self.subscribed_symbols:
                            try:
                                u_contract = Stock(contract.symbol, 'SMART', 'USD')
                                self.ib.reqMktData(u_contract, '221', False, False)
                                self.subscribed_symbols.add(contract.symbol)
                            except:
                                pass
                     else:
                         und_price = found_price

                # Calculate Daily P&L Manually
                # (Mark - Prior Close) * Qty * Multiplier
                # Multiplier is usually 1 for STK, 100 for OPT
                if contract.secType == 'OPT':
                    multiplier = 100.0
                else:
                    multiplier = 1.0
                
                pos_daily_pnl = 0.0
                if current_price > 0 and prior_close > 0:
                    pos_daily_pnl = (current_price - prior_close) * self._safe_float(pos.position) * multiplier
                
                if contract.secType == 'STK':
                    mapped_positions.append({
                        "ticker": contract.symbol,
                        "account": pos.account,
                        "position_type": "stock",
                        "qty": self._safe_float(pos.position),
                        "cost_basis": self._safe_float(pos.avgCost),
                        "current_price": current_price,
                        "unrealized_pnl": (current_price - self._safe_float(pos.avgCost)) * self._safe_float(pos.position) if current_price else 0.0,
                        "daily_pnl": pos_daily_pnl,
                        "delta": 1.0,
                        "gamma": 0.0, "theta": 0.0, "vega": 0.0, "iv": 0.0
                    })
                
                elif contract.secType == 'OPT':
                    expiry_formatted = f"{contract.lastTradeDateOrContractMonth[:4]}-{contract.lastTradeDateOrContractMonth[4:6]}-{contract.lastTradeDateOrContractMonth[6:]}"
                    
                    # PnL from portfolio is often delayed/static compared to live calc
                    # but let's prefer portfolio PnL if available as it matches account window
                    pnl = 0.0
                    pnl = 0.0
                    found_in_portfolio = False
                    for item in portfolio:
                        # Match by conId AND Account
                        if item.contract.conId == contract.conId and item.account == pos.account:
                            pnl = item.unrealizedPNL
                            found_in_portfolio = True
                            break
                    
                    # Fallback live P&L calculation if portfolio data missing/zero but we have live prices
                    # Some portfolio items might be missing or zero if not subscribed
                    if (pnl == 0.0 or not found_in_portfolio) and current_price > 0:
                         # (Mark - AvgCost) * Qty * Multiplier
                         # Using 100 as multiplier for standard US options.
                         pnl = (current_price - self._safe_float(pos.avgCost)) * self._safe_float(pos.position) * 100.0
                    
                    mapped_positions.append({
                        "ticker": contract.symbol,
                        "account": pos.account,
                        "position_type": "call" if contract.right == 'C' else "put",
                        "qty": self._safe_float(pos.position),
                        "strike": self._safe_float(contract.strike),
                        "expiry": expiry_formatted,
                        "cost_basis": self._safe_float(pos.avgCost),
                        "unrealized_pnl": self._safe_float(pnl),
                        "daily_pnl": pos_daily_pnl,
                        "current_price": current_price,
                        "underlying_price": und_price,
                        "delta": delta,
                        "gamma": gamma,
                        "theta": theta,
                        "vega": vega,
                        "iv": iv * 100 # Convert to percentage for frontend
                    })
            
            # Extract Account Summary per Account
            # Use ib.accountValues() which is populated by reqAccountUpdates
            # Structure: { "U123": { "net_liquidation": 0.0, ... } }
            accounts_summary = {}

            # Fallback to accountValues (populated by reqAccountUpdates)
            account_values = self.ib.accountValues()
            
            if account_values:
                for val in account_values:
                    if val.currency == 'USD': 
                        acc_id = val.account
                        if acc_id not in accounts_summary:
                            accounts_summary[acc_id] = {
                                "net_liquidation": 0.0,
                                "unrealized_pnl": 0.0,
                                "realized_pnl": 0.0,
                                "daily_pnl": 0.0
                            }
                            
                        if val.tag == 'NetLiquidation':
                            accounts_summary[acc_id]["net_liquidation"] = self._safe_float(val.value)
                        elif val.tag == 'UnrealizedPnL':
                            accounts_summary[acc_id]["unrealized_pnl"] = self._safe_float(val.value)
                        elif val.tag == 'RealizedPnL':
                            accounts_summary[acc_id]["realized_pnl"] = self._safe_float(val.value)
                        elif val.tag == 'DayPnL' or val.tag == 'DailyPnL': # Check for alternative names
                            accounts_summary[acc_id]["daily_pnl"] = self._safe_float(val.value)
            
            # If API daily_pnl is 0 (missing), use our manual aggregation
            # This handles accounts where 'DailyPnL' tag is not sent
            for acc_id, summary in accounts_summary.items():
                if summary['daily_pnl'] == 0.0:
                    manual_daily_sum = sum(p.get('daily_pnl', 0.0) for p in mapped_positions if p['account'] == acc_id)
                    # Add realized P&L since manual is just Unrealized Daily Change
                    # Daily Total = Unrealized Daily Change + Realized Today
                    summary['daily_pnl'] = manual_daily_sum + summary['realized_pnl']

            # If a position exists for an account that had no summary (unlikely but possible), ensure it exists
            # Also get list of all accounts for the frontend dropdown
            all_accounts = sorted(list(set([p['account'] for p in mapped_positions] + list(accounts_summary.keys()))))
            
            print(f"DEBUG: Returning {len(mapped_positions)} mapped positions")

            return {
                "accounts": all_accounts,
                "positions": mapped_positions,
                "summary": accounts_summary
            }
        except Exception as e:
            print(f"Error fetching positions: {e}")
            import traceback
            traceback.print_exc()
            traceback.print_exc()
            return {
                "accounts": [],
                "positions": [],
                "summary": {}
            }

    def disconnect(self):
        if self.connected:
            self.ib.disconnect()

ib_client = IBClient()
