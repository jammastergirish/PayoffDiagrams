
"use client";

import { useState, useMemo } from "react";
import Papa from "papaparse";
import { 
  Position, 
  calculatePnl, 
  getBreakevens, 
  calculateMaxRiskReward,
  getPriceRange,
  parsePositionsFromRows,
  calculateTheoreticalPnl
} from "@/lib/payoff-utils";
import { FileUpload } from "@/components/file-upload";
import { PayoffChart } from "@/components/payoff-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

import { checkBackendHealth, fetchLivePortfolio } from "@/lib/api-client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AccountSummary } from "@/lib/payoff-utils";

export function PayoffDashboard() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [stockPrices, setStockPrices] = useState<Record<string, number>>({});
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  
  // Account State
  const [accounts, setAccounts] = useState<string[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("All");
  const [accountSummaries, setAccountSummaries] = useState<Record<string, AccountSummary>>({});
  
  // Computed summary based on selection
  const activeSummary = useMemo(() => {
      if (selectedAccount !== "All" && accountSummaries[selectedAccount]) {
          return accountSummaries[selectedAccount];
      }
      return null;
  }, [selectedAccount, accountSummaries]);

  // Live Mode State
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'connected' | 'offline'>('checking');
  
  // Toggles
  const [showStock, setShowStock] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showCombined, setShowCombined] = useState(true);
  const [showT0, setShowT0] = useState(false);

  // Simulation State
  const [ivAdjustment, setIvAdjustment] = useState(0); // 0 = 0% change
  const [daysOffset, setDaysOffset] = useState(0); // 0 to 90 days

  const targetDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + daysOffset);
    return d;
  }, [daysOffset]);

  // Initial Backend Check
  useState(() => {
      checkBackendHealth().then((health) => {
          if (health && health.status === 'ok') {
              setIsLiveMode(true);
              if (health.ib_connected) {
                  setBackendStatus('connected');
                  // Auto-fetch positions
                  fetchLivePortfolio().then(data => {
                      const pos = data.positions;
                      setPositions(pos);
                      
                      // Handle Accounts
                      if (data.accounts && data.accounts.length > 0) {
                          setAccounts(data.accounts);
                          // Default to first if not "All" maybe? Or keep All.
                          // If current selection is invalid, reset to All
                          if (selectedAccount !== 'All' && !data.accounts.includes(selectedAccount)) {
                              setSelectedAccount('All');
                          }
                      }
                      
                      if (data.summary) {
                          setAccountSummaries(data.summary);
                      }
                      
                      // Extract prices from live data to populate stockPrices map
                      const livePrices: Record<string, number> = {};
                      pos.forEach(p => {
                          if (p.ticker) {
                             if (p.position_type === 'stock' && p.current_price) {
                                 livePrices[p.ticker] = p.current_price;
                             } else if (p.position_type !== 'stock' && p.underlying_price) {
                                  livePrices[p.ticker] = p.underlying_price;
                             }
                          }
                      });
                      setStockPrices(prev => ({ ...prev, ...livePrices }));
                      
                      // Initial selection if needed
                      if (pos.length > 0 && !selectedTicker) {
                           const tickers = Array.from(new Set(pos.map(p => p.ticker))).sort();
                           if (tickers.length > 0) setSelectedTicker(tickers[0]);
                      }

                      // Setup live polling every 5s
                      const interval = setInterval(async () => {
                          const updatedData = await fetchLivePortfolio();
                          const updated = updatedData.positions;
                          setPositions(updated);
                          
                          if (updatedData.accounts) setAccounts(updatedData.accounts);
                          if (updatedData.summary) setAccountSummaries(updatedData.summary);
                          
                          // Update prices again
                          const updatedPrices: Record<string, number> = {};
                          updated.forEach(p => {
                              if (p.ticker) {
                                 if (p.position_type === 'stock' && p.current_price) {
                                     updatedPrices[p.ticker] = p.current_price;
                                 } else if (p.position_type !== 'stock' && p.underlying_price) {
                                      updatedPrices[p.ticker] = p.underlying_price;
                                 }
                              }
                          });
                          setStockPrices(prev => ({ ...prev, ...updatedPrices }));
                          
                      }, 5000);
                      return () => clearInterval(interval);
                  });
              } else {
                  setBackendStatus('connected'); // Backend is connected, but TWS might not be
              }
          } else {
              setBackendStatus('offline');
          }
      });
  });

  const handleFileSelect = (file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const { positions: parsedPositions, prices } = parsePositionsFromRows(
          results.data as Record<string, unknown>[]
        );
        setPositions(parsedPositions);
        setStockPrices(prices);
        
        // Auto select first ticker
        const tickers = Array.from(new Set(parsedPositions.map(p => p.ticker))).sort();
        if (tickers.length > 0) setSelectedTicker(tickers[0]);
      }
    });
  };

  const tickers = useMemo(() => {
    // Filter positions first by Account
    let visible = positions;
    if (selectedAccount !== 'All') {
        visible = positions.filter(p => p.account === selectedAccount);
    }
    return Array.from(new Set(visible.map(p => p.ticker))).sort();
  }, [positions, selectedAccount]);

  const activePositions = useMemo(() => {
    // If no ticker selected, return empty
    if (!selectedTicker) return [];
    
    // Base filter by Ticker
    let filtered = positions.filter(p => p.ticker === selectedTicker);
    
    // Filter by Account
    if (selectedAccount !== 'All') {
        filtered = filtered.filter(p => p.account === selectedAccount);
    }
    return filtered;
  }, [positions, selectedTicker, selectedAccount]);

  const chartData = useMemo(() => {
    if (!selectedTicker || activePositions.length === 0) return { data: [], breakevens: [], stats: null };

    const currentPrice = stockPrices[selectedTicker] || 100;
    const prices = getPriceRange(activePositions, currentPrice);
    
    // Combined
    const pnl = calculatePnl(activePositions, prices);
    
    // Components
    const stockPos = activePositions.filter(p => p.position_type === 'stock');
    const optionPos = activePositions.filter(p => p.position_type !== 'stock');
    
    // Calculate component P&Ls only if they exist
    const stockPnlArr = stockPos.length > 0 ? calculatePnl(stockPos, prices) : undefined;
    const optionsPnlArr = optionPos.length > 0 ? calculatePnl(optionPos, prices) : undefined;

    const breakevens = getBreakevens(prices, pnl);
    const stats = calculateMaxRiskReward(activePositions);

    // Calculate T+0 P&L if enabled
    let t0Pnl: number[] | undefined;
    if (showT0) {
        t0Pnl = calculateTheoreticalPnl(activePositions, prices, targetDate, ivAdjustment);
    }

    const data = prices.map((price, idx) => ({
        price,
        pnl: pnl[idx],
        stockPnl: stockPnlArr ? stockPnlArr[idx] : undefined,
        optionsPnl: optionsPnlArr ? optionsPnlArr[idx] : undefined,
        t0Pnl: t0Pnl ? t0Pnl[idx] : undefined,
    }));

    return { data, breakevens, stats };
  }, [selectedTicker, activePositions, stockPrices, showT0, ivAdjustment, targetDate]);

  const currentPrice = selectedTicker ? (stockPrices[selectedTicker] || 0) : 0;
  const totalUnrealizedPnl = activePositions.reduce((sum, p) => sum + (p.unrealized_pnl || 0), 0);

  // Calculate Net Greeks
  const netRisk = useMemo(() => {
    let delta = 0, gamma = 0, theta = 0, vega = 0;
    activePositions.forEach(p => {
        const multiplier = p.position_type === 'stock' ? 1 : 100;
        delta += (p.delta || 0) * p.qty * multiplier;
        gamma += (p.gamma || 0) * p.qty * multiplier;
        theta += (p.theta || 0) * p.qty * multiplier;
        vega += (p.vega || 0) * p.qty * multiplier;
    });
    return { delta, gamma, theta, vega };
  }, [activePositions]);

  const formatCurrency = (value: number) =>
    `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const formatBound = (value: number) =>
    Number.isFinite(value) ? formatCurrency(value) : "∞";


  const portfolioUnrealizedPnl = useMemo(() => {
    return positions.reduce((sum, p) => sum + (p.unrealized_pnl || 0), 0);
  }, [positions]);

  return (
    <div className="flex flex-col gap-6">
       {!isLiveMode && !positions.length && (
           <div className="flex flex-col gap-4">
             <div className="rounded-xl border border-white/10 bg-slate-950 p-6 text-sm text-gray-300">
               <h2 className="text-base font-medium text-white flex justify-between">
                   <span>Interactive Brokers CSV Required</span>
                   <span className="text-xs font-mono text-gray-500 uppercase tracking-widest border border-gray-800 px-2 py-1 rounded">Offline Mode</span>
               </h2>
               <p className="mt-1 text-gray-400">
                 Export your portfolio from IBKR TWS and upload the CSV here.
               </p>
               <p className="mt-2 text-gray-400">
                 You'll need to split up strategies in TWS:{" "}
                 <span className="font-mono text-gray-300">
                   File-&gt;Global Configuration-&gt;Display-&gt;Ticker Row-&gt;Complex (Multi-Leg Positions)-&gt;Hide Complex Positions
                 </span>
               </p>
               <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div>
                   <p className="text-xs uppercase tracking-wider text-gray-500">Required Columns</p>
                   <p className="mt-1">
                     Financial Instrument, Position, Last, Cost Basis, Underlying Price
                   </p>
                 </div>
                 <div>
                   <p className="text-xs uppercase tracking-wider text-gray-500">Recommended Columns</p>
                   <p className="mt-1">
                     Delta, Gamma, Theta, Vega, Implied Vol. (IV), Prob. of Profit (POP), Unrealized P&amp;L
                   </p>
                 </div>
               </div>
             </div>
             <FileUpload onFileSelect={handleFileSelect} />
           </div>
       )}

       {isLiveMode && (
           <div className={`flex items-center gap-2 p-3 rounded-lg text-sm border ${backendStatus === 'connected' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'}`}>
               <div className={`w-2 h-2 rounded-full animate-pulse ${backendStatus === 'connected' ? 'bg-green-500' : 'bg-yellow-500'}`} />
               {backendStatus === 'connected' ? "Live Connection to IBKR TWS" : "Backend Connected (Waiting for TWS...)"}
                <div className="ml-auto flex items-center gap-4">
                   {/* Account Selector */}
                   {accounts.length > 0 && (
                       <div className="flex items-center gap-2">
                           <span className="text-gray-400 text-xs uppercase tracking-wider">Account:</span>
                           <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                             <SelectTrigger className="w-[180px] bg-slate-900 border-white/10 text-white h-8 text-xs">
                               <SelectValue placeholder="Select Account" />
                             </SelectTrigger>
                             <SelectContent className="bg-slate-900 border-white/10 text-white">
                               <SelectItem value="All">All Accounts</SelectItem>
                               {accounts.map(acc => (
                                   <SelectItem key={acc} value={acc}>{acc}</SelectItem>
                               ))}
                             </SelectContent>
                           </Select>
                       </div>
                   )}
                   <span className="text-xs font-mono opacity-70 border-l border-white/10 pl-4">
                       {backendStatus === 'connected' ? "CONNECTED" : "Loc: 8000 OK / TWS: --"}
                   </span>
                </div>
           </div>
       )}

       {positions.length === 0 && (
           <div className="flex flex-col items-center justify-center p-12 text-center border-t border-white/5">
                <div className="text-gray-500 mb-2 text-lg">No positions found</div>
                <div className="text-gray-600 text-sm max-w-md">
                    Check your TWS connection and ensure you have open positions in the selected account. 
                    If you are using a paper trading account, make sure it is active.
                </div>
           </div>
       )}

       {positions.length > 0 && (
         <div className="flex flex-col gap-6">
           {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {accountSummaries && selectedAccount !== 'All' && accountSummaries[selectedAccount] && (
             <>
                <Card className="bg-slate-900 border-white/10 shadow-lg">
                  <CardContent className="pt-6">
                    <div className="text-sm font-medium text-gray-400">Account Net Liq</div>
                    <div className="text-2xl font-bold text-white mt-2">
                      {formatCurrency(accountSummaries[selectedAccount].net_liquidation)}
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-slate-900 border-white/10 shadow-lg">
                  <CardContent className="pt-6">
                    <div className="text-sm font-medium text-gray-400">Today's P&L</div>
                    <div className={`text-2xl font-bold mt-2 ${accountSummaries[selectedAccount].daily_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {accountSummaries[selectedAccount].daily_pnl >= 0 ? '+' : ''}{formatCurrency(accountSummaries[selectedAccount].daily_pnl)}
                    </div>
                  </CardContent>
                </Card>
             </>
        )}
        {accountSummaries && selectedAccount === 'All' && (
             <>
                <Card className="bg-slate-900 border-white/10 shadow-lg">
                  <CardContent className="pt-6">
                    <div className="text-sm font-medium text-gray-400">Total Net Liq</div>
                    <div className="text-2xl font-bold text-white mt-2">
                      {formatCurrency(Object.values(accountSummaries).reduce((sum, s) => sum + s.net_liquidation, 0))}
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-slate-900 border-white/10 shadow-lg">
                  <CardContent className="pt-6">
                    <div className="text-sm font-medium text-gray-400">Total Today's P&L</div>
                    <div className={`text-2xl font-bold mt-2 ${Object.values(accountSummaries).reduce((sum, s) => sum + s.daily_pnl, 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {Object.values(accountSummaries).reduce((sum, s) => sum + s.daily_pnl, 0) >= 0 ? '+' : ''}{formatCurrency(Object.values(accountSummaries).reduce((sum, s) => sum + s.daily_pnl, 0))}
                    </div>
                  </CardContent>
                </Card>
             </>
        )}

        <Card className="bg-slate-900 border-white/10 shadow-lg">
          <CardContent className="pt-6">
            <div className="text-sm font-medium text-gray-400">Total Unrealized P&L</div>
            <div className={`text-2xl font-bold mt-2 ${portfolioUnrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {portfolioUnrealizedPnl >= 0 ? '+' : ''}{formatCurrency(portfolioUnrealizedPnl)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              across {positions.length} positions
            </div>
          </CardContent>
        </Card>
      </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Sidebar */}
            <Card className="md:col-span-1 h-fit bg-slate-950 border-white/10 text-white">
               <CardHeader>
                 <CardTitle className="text-gray-400 font-normal uppercase tracking-wider text-xs">Tickers</CardTitle>
               </CardHeader>
               <CardContent className="flex flex-col gap-2">
                  {tickers.map(t => (
                    <Button 
                      key={t} 
                      variant="ghost"
                      className={`justify-start w-full text-sm ${selectedTicker === t ? "bg-orange-500/20 text-orange-500 hover:bg-orange-500/30 hover:text-orange-400" : "text-gray-400 hover:text-white hover:bg-white/5"}`}
                      onClick={() => setSelectedTicker(t)}
                    >
                      {t}
                    </Button>
                  ))}
                  
                  <div className="my-2 border-b border-white/10" />
                  <Button variant="ghost" onClick={() => setPositions([])} className="w-full text-red-500 hover:text-red-400 hover:bg-red-500/10">
                    Reset
                  </Button>
               </CardContent>
            </Card>

            {/* Main Content */}
            <div className="md:col-span-3 flex flex-col gap-6">
               <Card className="bg-slate-950 border-white/10 text-white overflow-hidden">
                 <CardHeader className="flex flex-row items-center justify-between pb-6 border-b border-white/5 bg-white/5">
                    <CardTitle className="text-xl font-light tracking-wide">{selectedTicker}</CardTitle>
                    <div className="flex items-center gap-6 text-sm">
                       <div className="flex items-center gap-2">
                          <Switch 
                            checked={showStock} 
                            onCheckedChange={setShowStock} 
                            id="show-stock" 
                            className="data-[state=checked]:bg-slate-700"
                          />
                          <Label htmlFor="show-stock" className="text-slate-400 cursor-pointer">Stock</Label>
                       </div>
                       <div className="flex items-center gap-2">
                          <Switch 
                            checked={showOptions} 
                            onCheckedChange={setShowOptions} 
                            id="show-options" 
                            className="data-[state=checked]:bg-purple-600"
                          />
                          <Label htmlFor="show-options" className="text-purple-400 cursor-pointer">Options</Label>
                       </div>
                       <div className="flex items-center gap-2">
                          <Switch 
                            checked={showCombined} 
                            onCheckedChange={setShowCombined} 
                            id="show-combined" 
                            className="data-[state=checked]:bg-orange-600"
                          />
                          <Label htmlFor="show-combined" className="font-bold text-orange-500 cursor-pointer">Combined</Label>
                       </div>
                       <div className="pl-4 border-l border-white/10 flex items-center gap-2">
                          <Switch 
                            checked={showT0} 
                            onCheckedChange={setShowT0} 
                            id="show-t0" 
                            className="data-[state=checked]:bg-cyan-500"
                          />
                          <Label htmlFor="show-t0" className="text-cyan-400 cursor-pointer">Show T+0 Prediction</Label>
                       </div>
                    </div>
                 </CardHeader>
                 <CardContent className="pt-6">
                    {/* Simulation Controls */}
                    {showT0 && (
                        <div className="mb-8 p-4 bg-cyan-950/20 border border-cyan-500/20 rounded-lg grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div>
                                <div className="flex justify-between mb-2">
                                    <Label className="text-cyan-100">Implied Volatility (IV) Adjustment</Label>
                                    <span className={`text-sm font-mono ${ivAdjustment > 0 ? 'text-green-400' : ivAdjustment < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                                        {ivAdjustment > 0 ? '+' : ''}{(ivAdjustment * 100).toFixed(0)}%
                                    </span>
                                </div>
                                <Slider 
                                    min={-0.5} 
                                    max={0.5} 
                                    step={0.01} 
                                    value={[ivAdjustment]} 
                                    onValueChange={(vals) => setIvAdjustment(vals[0])}
                                    className="py-2"
                                />
                                <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                                    <span>-50%</span>
                                    <span>0%</span>
                                    <span>+50%</span>
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between mb-2">
                                    <Label className="text-cyan-100">Date Simulation</Label>
                                    <span className="text-sm font-mono text-cyan-200">
                                        {targetDate.toLocaleDateString()} <span className="text-xs text-gray-500">({daysOffset === 0 ? 'Today' : `+${daysOffset}d`})</span>
                                    </span>
                                </div>
                                <Slider 
                                    min={0} 
                                    max={180} 
                                    step={1} 
                                    value={[daysOffset]} 
                                    onValueChange={(vals) => setDaysOffset(vals[0])}
                                    className="py-2"
                                />
                                <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                                    <span>Today</span>
                                    <span>+6 Months</span>
                                </div>
                            </div>
                        </div>
                    )}

                    <PayoffChart 
                       data={chartData.data} 
                       currentPrice={currentPrice}
                       breakevens={chartData.breakevens}
                       showStock={showStock}
                       showOptions={showOptions}
                       showCombined={showCombined}
                       showT0={showT0}
                    />
                    
                    {chartData.stats && (
                        <div className="grid grid-cols-4 gap-4 mt-8">
                            <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30">
                                <p className="text-xs text-green-400 font-medium uppercase tracking-wider">Max Profit</p>
                                <p className="text-2xl font-light text-green-300 mt-1">
                                    {formatBound(chartData.stats.maxProfit)}
                                </p>
                            </div>
                            <div className={`p-4 rounded-lg border ${chartData.stats.maxLoss > 0 ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30"}`}>
                                <p className={`text-xs font-medium uppercase tracking-wider ${chartData.stats.maxLoss > 0 ? "text-green-400" : "text-red-400"}`}>
                                    {chartData.stats.maxLoss > 0 ? "Guaranteed Profit" : "Max Loss"}
                                </p>
                                <p className={`text-2xl font-light mt-1 ${chartData.stats.maxLoss > 0 ? "text-green-300" : "text-red-300"}`}>
                                    {chartData.stats.maxLoss > 0 
                                        ? formatBound(chartData.stats.maxLoss)
                                        : formatBound(-1 * chartData.stats.maxLoss)
                                    }
                                </p>
                            </div>
                            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Breakevens</p>
                                <p className="text-2xl font-light text-white mt-1">
                                    {chartData.breakevens.length > 0 
                                      ? chartData.breakevens.map(b => `$${b.toFixed(0)}`).join(", ") 
                                      : "None"}
                                </p>
                            </div>
                            <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
                                <p className="text-xs text-blue-400 font-medium uppercase tracking-wider">Unrealized P&L</p>
                                <p className={`text-2xl font-light mt-1 ${totalUnrealizedPnl >= 0 ? "text-blue-300" : "text-red-300"}`}>
                                    {totalUnrealizedPnl >= 0 ? "+" : ""}${totalUnrealizedPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Risk Dashboard */}
                    <div className="mt-6 pt-6 border-t border-white/5">
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Risk Profile (Greeks)</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="p-4 rounded-lg bg-orange-500/5 border border-orange-500/20">
                            <p className="text-xs text-orange-400 font-medium uppercase tracking-wider">Net Delta</p>
                            <p className="text-xl font-mono text-orange-200 mt-1">{netRisk.delta.toFixed(0)}</p>
                            <p className="text-[10px] text-gray-500 mt-1">Eq. Shares exposure</p>
                            </div>
                            <div className="p-4 rounded-lg bg-purple-500/5 border border-purple-500/20">
                            <p className="text-xs text-purple-400 font-medium uppercase tracking-wider">Net Gamma</p>
                            <p className="text-xl font-mono text-purple-200 mt-1">{netRisk.gamma.toFixed(2)}</p>
                            <p className="text-[10px] text-gray-500 mt-1">Delta acceleration</p>
                            </div>
                            <div className="p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                            <p className="text-xs text-emerald-400 font-medium uppercase tracking-wider">Net Theta</p>
                            <p className="text-xl font-mono text-emerald-200 mt-1">${netRisk.theta.toFixed(0)}</p>
                            <p className="text-[10px] text-gray-500 mt-1">Daily time decay</p>
                            </div>
                            <div className="p-4 rounded-lg bg-cyan-500/5 border border-cyan-500/20">
                            <p className="text-xs text-cyan-400 font-medium uppercase tracking-wider">Net Vega</p>
                            <p className="text-xl font-mono text-cyan-200 mt-1">${netRisk.vega.toFixed(0)}</p>
                            <p className="text-[10px] text-gray-500 mt-1">Vol sensitivity</p>
                            </div>
                        </div>
                    </div>
                 </CardContent>
               </Card>
               
               {/* Positions Table */}
               <Card className="bg-slate-950 border-white/10 text-white">
                  <CardHeader><CardTitle className="text-gray-400 font-normal uppercase tracking-wider text-xs">Positions</CardTitle></CardHeader>
                  <CardContent>
                      <div className="space-y-2">
                          {activePositions.map((pos, i) => (
                              <div key={i} className="flex justify-between items-center p-4 bg-white/5 rounded-lg border border-white/5 hover:bg-white/10 transition-colors">
                                  <div>
                                      <span className={`font-medium ${pos.position_type === 'call' ? 'text-green-400' : pos.position_type === 'put' ? 'text-red-400' : 'text-blue-400'}`}>
                                          {pos.qty > 0 ? '+' : ''}{pos.qty} {pos.position_type.toUpperCase()}
                                      </span>
                                      {pos.strike && <span className="ml-2 text-gray-300">@ {pos.strike}</span>}
                                      {pos.expiry && <span className="ml-2 text-xs text-gray-500 border border-white/10 px-2 py-0.5 rounded-full">
                                          {pos.expiry} <span className="text-gray-400">({pos.dte}d)</span>
                                      </span>}
                                      {pos.iv !== undefined && pos.iv > 0 && <span className="ml-2 text-xs text-orange-400 border border-orange-500/20 bg-orange-500/10 px-2 py-0.5 rounded-full">IV {pos.iv.toFixed(1)}%</span>}
                                  </div>
                                  <div className="text-right">
                                      <div className="text-sm font-mono text-gray-400">
                                          ${pos.cost_basis?.toFixed(2)}
                                      </div>
                                      {pos.unrealized_pnl !== undefined && (
                                          <div className={`text-xs font-mono font-bold ${pos.unrealized_pnl >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                                              {pos.unrealized_pnl >= 0 ? "+" : ""}{pos.unrealized_pnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                          </div>
                                      )}
                                  </div>
                              </div>
                          ))}
                      </div>
                  </CardContent>
               </Card>
            </div>
         </div>
          </div>
       )}

    </div>
  );
}
