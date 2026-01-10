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
        self._account_summary_req_id = 9001
        self._account_summary_group = "All"
        # NOTE: P&L tags (DayPnL, UnrealizedPnL, RealizedPnL) are NOT valid here!
        # P&L must be fetched via reqPnL() separately.
        self._account_summary_tags = (
            "AccountType,NetLiquidation,TotalCashValue,SettledCash,AccruedCash,"
            "BuyingPower,EquityWithLoanValue,PreviousDayEquityWithLoanValue,"
            "GrossPositionValue,RegTEquity,RegTMargin,SMA,InitMarginReq,"
            "MaintMarginReq,AvailableFunds,ExcessLiquidity,Cushion,"
            "FullInitMarginReq,FullMaintMarginReq,FullAvailableFunds,"
            "FullExcessLiquidity,LookAheadNextChange,LookAheadInitMarginReq,"
            "LookAheadMaintMarginReq,LookAheadAvailableFunds,"
            "LookAheadExcessLiquidity,HighestSeverity,DayTradesRemaining,"
            "DayTradesRemainingT+1,DayTradesRemainingT+2,DayTradesRemainingT+3,"
            "DayTradesRemainingT+4,Leverage,$LEDGER:ALL"
        )
        self._account_summary_started = False
        # P&L subscriptions - reqPnL returns live-updated PnL objects
        self.pnl_subscriptions = {}  # account -> PnL object

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
            # Generic ticks: 104=Historical Vol, 106=Implied Vol, 221=Mark Price
            # These help populate greeks and pricing data
            self.ib.reqMktData(contract, '104,106,221', False, False)
            self.subscribed_contracts.add(contract.conId)
            # Give the event loop time to receive initial data
            self.ib.sleep(0.3)
            
            # Also subscribe to underlying for options to ensure we have underlying_price
            if contract.secType == 'OPT':
                if contract.symbol not in self.subscribed_symbols:
                    try:
                        u_contract = Stock(contract.symbol, 'SMART', 'USD')
                        self.ib.reqMktData(u_contract, '221', False, False)
                        self.subscribed_symbols.add(contract.symbol)
                        self.ib.sleep(0.2)
                    except:
                        pass

    def _ensure_account_summary(self):
        if not self.ib.isConnected():
            return
        if self._account_summary_started:
            return
        try:
            self.ib.client.reqAccountSummary(
                self._account_summary_req_id,
                self._account_summary_group,
                self._account_summary_tags
            )
            self._account_summary_started = True
        except Exception as e:
            print(f"Error requesting account summary: {e}")

    def _ensure_pnl_subscription(self, account: str):
        """Subscribe to P&L updates for an account using reqPnL.
        
        This is the CORRECT way to get dailyPnL, unrealizedPnL, realizedPnL.
        reqAccountSummary does NOT support these tags despite what one might expect.
        """
        if not self.ib.isConnected():
            return None
        if account in self.pnl_subscriptions:
            return self.pnl_subscriptions[account]
        try:
            # reqPnL returns a live-updated PnL object with dailyPnL, unrealizedPnL, realizedPnL
            pnl = self.ib.reqPnL(account, '')
            self.pnl_subscriptions[account] = pnl
            print(f"DEBUG: Subscribed to P&L for account {account}")
            
            # Wait for P&L data to arrive (with timeout)
            # The subscription is async - IBKR sends data after a brief delay
            for _ in range(10):  # Try for up to 2 seconds
                self.ib.sleep(0.2)
                if not math.isnan(pnl.dailyPnL) if pnl.dailyPnL is not None else False:
                    print(f"DEBUG: P&L data received for {account}")
                    break
            
            return pnl
        except Exception as e:
            print(f"Error subscribing to P&L for {account}: {e}")
            return None

    def get_positions(self) -> List[dict]:
        if not self.connected:
            return []
        
        try:
            self._ensure_account_summary()
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
                    
                    # IMPORTANT: IBKR returns avgCost as total cost per 100 shares
                    # e.g., if you paid $5 per contract, avgCost = 500
                    # Frontend expects per-contract premium, so divide by 100
                    avg_cost_per_share = self._safe_float(pos.avgCost)
                    cost_basis_per_contract = avg_cost_per_share / 100.0 if avg_cost_per_share else 0.0
                    
                    print(f"DEBUG OPT: {contract.symbol} {contract.right}{contract.strike} exp={expiry_formatted} qty={pos.position} avgCost={pos.avgCost} cost_basis={cost_basis_per_contract} und_price={und_price} strike={contract.strike}")
                    
                    mapped_positions.append({
                        "ticker": contract.symbol,
                        "account": pos.account,
                        "position_type": "call" if contract.right == 'C' else "put",
                        "qty": self._safe_float(pos.position),
                        "strike": self._safe_float(contract.strike),
                        "expiry": expiry_formatted,
                        "cost_basis": cost_basis_per_contract,
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
            # NetLiquidation comes from accountSummary, P&L comes from reqPnL
            accounts_summary = {}
            account_summary_values = list(self.ib.wrapper.acctSummary.values())

            # First pass: extract NetLiquidation from account summary
            if account_summary_values:
                for val in account_summary_values:
                    if val.currency not in ('USD', 'BASE'):
                        continue
                    if val.account == 'All':
                        continue
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

            # Second pass: get P&L from reqPnL subscriptions (the CORRECT source)
            for acc_id in list(accounts_summary.keys()):
                pnl_obj = self._ensure_pnl_subscription(acc_id)
                if pnl_obj:
                    accounts_summary[acc_id]["daily_pnl"] = self._safe_float(pnl_obj.dailyPnL)
                    accounts_summary[acc_id]["unrealized_pnl"] = self._safe_float(pnl_obj.unrealizedPnL)
                    accounts_summary[acc_id]["realized_pnl"] = self._safe_float(pnl_obj.realizedPnL)
                    print(f"DEBUG: P&L for {acc_id}: daily={pnl_obj.dailyPnL}, unrealized={pnl_obj.unrealizedPnL}, realized={pnl_obj.realizedPnL}")

            if accounts_summary:
                self.account_summary_cache = dict(accounts_summary)
            elif self.account_summary_cache:
                accounts_summary = dict(self.account_summary_cache)

            # If a position exists for an account that had no summary (unlikely but possible), ensure it exists
            # Also get list of all accounts for the frontend dropdown
            # Filter out 'All' explicitly if it somehow sneaks in
            raw_accounts = set([p['account'] for p in mapped_positions] + list(accounts_summary.keys()))
            if 'All' in raw_accounts:
                raw_accounts.remove('All')
            all_accounts = sorted(list(raw_accounts))
            
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

    def get_historical_data(self, symbol: str, duration: str, bar_size: str) -> list:
        """
        Fetch historical OHLC data for a given symbol.
        
        Args:
            symbol: Stock ticker symbol (e.g., "AAPL")
            duration: Time span, e.g., "1 Y", "1 M", "1 W", "1 D", "3600 S"
            bar_size: Bar size, e.g., "1 day", "1 hour", "5 mins", "1 min"
            
        Returns:
            List of dicts with date, open, high, low, close, volume
        """
        if not self.connected or not self.ib.isConnected():
            return []
        
        try:
            # Create a Stock contract
            contract = Stock(symbol, 'SMART', 'USD')
            
            # Request historical data
            # whatToShow: TRADES, MIDPOINT, BID, ASK, etc.
            # useRTH: True = regular trading hours only
            bars = self.ib.reqHistoricalData(
                contract,
                endDateTime='',  # Empty string for current time
                durationStr=duration,
                barSizeSetting=bar_size,
                whatToShow='TRADES',
                useRTH=True,
                formatDate=1
            )
            
            if not bars:
                print(f"DEBUG: No historical data returned for {symbol}")
                return []
            
            print(f"DEBUG: Retrieved {len(bars)} bars for {symbol}")
            
            # Convert BarData objects to dicts
            result = []
            for bar in bars:
                result.append({
                    "date": bar.date.isoformat() if hasattr(bar.date, 'isoformat') else str(bar.date),
                    "open": float(bar.open),
                    "high": float(bar.high),
                    "low": float(bar.low),
                    "close": float(bar.close),
                    "volume": int(bar.volume) if bar.volume else 0
                })
            
            return result
            
        except Exception as e:
            print(f"Error fetching historical data for {symbol}: {e}")
            import traceback
            traceback.print_exc()
            return []

    def get_news_providers(self) -> list:
        """
        Get available news providers (cached).
        
        Returns:
            List of dicts with code and name for each provider
        """
        if not self.connected or not self.ib.isConnected():
            return []
        
        # Check cache first
        if hasattr(self, '_providers_cache') and self._providers_cache:
            return self._providers_cache
        
        try:
            old_timeout = self.ib.RequestTimeout
            self.ib.RequestTimeout = 5  # 5 second timeout
            try:
                providers = self.ib.reqNewsProviders()
            except asyncio.TimeoutError:
                print("DEBUG: News providers request timed out")
                return []
            finally:
                self.ib.RequestTimeout = old_timeout
            
            result = []
            for p in providers:
                result.append({
                    "code": p.code,
                    "name": p.name
                })
            print(f"DEBUG: Found {len(result)} news providers: {[p['code'] for p in result]}")
            
            # Cache the result
            self._providers_cache = result
            return result
        except Exception as e:
            print(f"Error fetching news providers: {e}")
            return []

    def get_historical_news(self, symbol: str, provider_codes: str = "", total_results: int = 10) -> list:
        """
        Get historical news headlines for a symbol.
        
        Args:
            symbol: Stock ticker symbol (e.g., "AAPL")
            provider_codes: Plus-separated list of provider codes (e.g., "BZ+FLY")
                           If empty, will use common default providers
            total_results: Max number of headlines to return (max 300)
            
        Returns:
            List of dicts with articleId, headline, providerCode, time
        """
        if not self.connected or not self.ib.isConnected():
            return []
        
        try:
            # Check if we have cached conId for this symbol
            if not hasattr(self, '_conid_cache'):
                self._conid_cache = {}
            
            if symbol in self._conid_cache:
                con_id = self._conid_cache[symbol]
            else:
                # Get the conId for the symbol with timeout
                contract = Stock(symbol, 'SMART', 'USD')
                
                old_timeout = self.ib.RequestTimeout
                self.ib.RequestTimeout = 5  # 5 second timeout for contract details
                try:
                    details = self.ib.reqContractDetails(contract)
                except asyncio.TimeoutError:
                    print(f"DEBUG: Contract details request timed out for {symbol}")
                    return []
                finally:
                    self.ib.RequestTimeout = old_timeout
                
                if not details:
                    print(f"DEBUG: No contract found for {symbol}")
                    return []
                
                con_id = details[0].contract.conId
                self._conid_cache[symbol] = con_id
                print(f"DEBUG: Cached conId {con_id} for {symbol}")
            
            # Use all available providers if none specified
            if not provider_codes:
                # Try cached providers first
                if hasattr(self, '_providers_cache') and self._providers_cache:
                    provider_codes = "+".join([p["code"] for p in self._providers_cache])
                else:
                    # Fallback to common providers - BRFG (Briefing) is usually available
                    provider_codes = "BRFG"
            
            print(f"DEBUG: Requesting news for {symbol} (conId={con_id}) from providers: {provider_codes}")
            
            # Set a timeout to prevent indefinite blocking
            old_timeout = self.ib.RequestTimeout
            self.ib.RequestTimeout = 10  # 10 second timeout
            
            try:
                # Request historical news
                headlines = self.ib.reqHistoricalNews(
                    conId=con_id,
                    providerCodes=provider_codes,
                    startDateTime="",  # Empty for recent news
                    endDateTime="",
                    totalResults=min(total_results, 300)
                )
            except asyncio.TimeoutError:
                print(f"DEBUG: News request timed out for {symbol}")
                return []
            finally:
                self.ib.RequestTimeout = old_timeout
            
            if not headlines:
                print(f"DEBUG: No news headlines for {symbol}")
                return []
            
            print(f"DEBUG: Found {len(headlines)} headlines for {symbol}")
            
            result = []
            for h in headlines:
                # Clean up headline - strip IBKR metadata prefix like {A:800015:L:en:K:0.90:C:...}
                headline_text = h.headline
                if headline_text.startswith('{') and '}' in headline_text:
                    # Find the closing brace and take everything after it
                    headline_text = headline_text[headline_text.index('}') + 1:].strip()
                
                result.append({
                    "articleId": h.articleId,
                    "headline": headline_text,
                    "providerCode": h.providerCode,
                    "time": h.time.isoformat() if hasattr(h.time, 'isoformat') else str(h.time)
                })
            
            # Sort by time descending (newest first)
            result.sort(key=lambda x: x["time"], reverse=True)
            
            return result
            
        except Exception as e:
            print(f"Error fetching news for {symbol}: {e}")
            import traceback
            traceback.print_exc()
            return []

    def get_news_article(self, provider_code: str, article_id: str) -> dict:
        """
        Get full news article content.
        
        Args:
            provider_code: News provider code (e.g., "BZ")
            article_id: Article ID from headline
            
        Returns:
            Dict with articleId and text (HTML content)
        """
        if not self.connected or not self.ib.isConnected():
            return {"error": "Not connected"}
        
        try:
            print(f"DEBUG: Fetching article {article_id} from {provider_code}")
            
            article = self.ib.reqNewsArticle(
                providerCode=provider_code,
                articleId=article_id
            )
            
            if not article:
                return {"error": "Article not found"}
            
            # The article text might be HTML or plain text depending on provider
            article_text = article.articleText if hasattr(article, 'articleText') else str(article)
            
            print(f"DEBUG: Retrieved article, length: {len(article_text)} chars")
            
            return {
                "articleId": article_id,
                "providerCode": provider_code,
                "text": article_text,
                "articleType": article.articleType if hasattr(article, 'articleType') else "text"
            }
            
        except Exception as e:
            print(f"Error fetching article {article_id}: {e}")
            import traceback
            traceback.print_exc()
            return {"error": str(e)}

    def disconnect(self):
        if self.connected:
            try:
                if self._account_summary_started:
                    self.ib.client.cancelAccountSummary(self._account_summary_req_id)
                    self._account_summary_started = False
            except Exception as e:
                print(f"Error canceling account summary: {e}")
            # Cancel P&L subscriptions
            for account, pnl in list(self.pnl_subscriptions.items()):
                try:
                    self.ib.cancelPnL(account, '')
                except Exception as e:
                    print(f"Error canceling P&L for {account}: {e}")
            self.pnl_subscriptions.clear()
            self.ib.disconnect()

ib_client = IBClient()
