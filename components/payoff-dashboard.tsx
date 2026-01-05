
"use client";

import { useState, useMemo } from "react";
import Papa from "papaparse";
import { 
  Position, 
  parseFinancialInstrument, 
  cleanNumber, 
  calculatePnl, 
  getBreakevens, 
  analyzeRiskReward, 
  getPriceRange,
  calculateDte,
  findColumn
} from "@/lib/payoff-utils";
import { FileUpload } from "@/components/file-upload";
import { PayoffChart } from "@/components/payoff-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function PayoffDashboard() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [stockPrices, setStockPrices] = useState<Record<string, number>>({});
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  
  // Toggles
  const [showStock, setShowStock] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showCombined, setShowCombined] = useState(true);

  const handleFileSelect = (file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsedPositions: Position[] = [];
        const prices: Record<string, number> = {};

        results.data.forEach((r: unknown) => {
          const row = r as Record<string, unknown>;
          
          // Helper to safely get value from fuzzy column matching
          const getValue = (key: string) => {
              const col = findColumn(row, key);
              return col ? row[col] : undefined;
          };

          const instrument = getValue('Financial Instrument') as string;
          if (!instrument) return;

          const parsed = parseFinancialInstrument(instrument);
          const qty = cleanNumber(getValue('Position'));
          if (qty === 0) return;

          const lastPrice = cleanNumber(getValue('Last'));
          const costBasisTotal = cleanNumber(getValue('Cost Basis'));
          const unrealizedPnl = cleanNumber(getValue('Unrealized P&L'));
          
          if (parsed.type === 'stock') {
             const costBasisPerShare = qty !== 0 ? Math.abs(costBasisTotal) / Math.abs(qty) : 0;
             
             prices[parsed.ticker] = lastPrice;
             
             parsedPositions.push({
               ticker: parsed.ticker,
               position_type: 'stock',
               qty: qty,
               cost_basis: costBasisPerShare,
               unrealized_pnl: unrealizedPnl,
               delta: 1.0, // Stock delta is 1
               gamma: 0,
               theta: 0,
               vega: 0
             });
          } else {
             // Option
             const underlyingPrice = cleanNumber(getValue('Underlying Price'));
             if (underlyingPrice > 0) {
                 prices[parsed.ticker] = underlyingPrice;
             }
             
             const costBasisPerContract = qty !== 0 ? Math.abs(costBasisTotal) / Math.abs(qty) : 0;
             const costBasisPerShare = costBasisPerContract / 100.0;
             
             // Greeks
             const delta = cleanNumber(getValue('Delta'));
             const gamma = cleanNumber(getValue('Gamma'));
             const theta = cleanNumber(getValue('Theta'));
             const vega = cleanNumber(getValue('Vega'));
             
             // Advanced Metrics
             const iv = cleanNumber(getValue('Implied Vol.') || getValue('IV'));
             const pop = cleanNumber(getValue('Prob. of Profit') || getValue('POP'));

             parsedPositions.push({
                 ticker: parsed.ticker,
                 position_type: parsed.type,
                 qty: qty,
                 strike: parsed.strike,
                 expiry: parsed.expiry,
                 dte: parsed.expiry ? calculateDte(parsed.expiry) : undefined,
                 cost_basis: costBasisPerShare,
                 unrealized_pnl: unrealizedPnl,
                 delta, gamma, theta, vega,
                 iv, pop
             });
          }
        });

        setPositions(parsedPositions);
        setStockPrices(prices);
        
        // Auto select first ticker
        const tickers = Array.from(new Set(parsedPositions.map(p => p.ticker))).sort();
        if (tickers.length > 0) setSelectedTicker(tickers[0]);
      }
    });
  };

  const tickers = useMemo(() => {
    return Array.from(new Set(positions.map(p => p.ticker))).sort();
  }, [positions]);

  const activePositions = useMemo(() => {
    if (!selectedTicker) return [];
    return positions.filter(p => p.ticker === selectedTicker);
  }, [positions, selectedTicker]);

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

    const data = prices.map((price, idx) => ({
        price,
        pnl: pnl[idx],
        stockPnl: stockPnlArr ? stockPnlArr[idx] : undefined,
        optionsPnl: optionsPnlArr ? optionsPnlArr[idx] : undefined,
    }));

    const breakevens = getBreakevens(prices, pnl);
    const stats = analyzeRiskReward(pnl);

    return { data, breakevens, stats };
  }, [selectedTicker, activePositions, stockPrices]);

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

  return (
    <div className="flex flex-col gap-6">
       {!positions.length && (
           <FileUpload onFileSelect={handleFileSelect} />
       )}

       {positions.length > 0 && (
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
                    </div>
                 </CardHeader>
                 <CardContent className="pt-6">
                    <PayoffChart 
                       data={chartData.data} 
                       currentPrice={currentPrice}
                       breakevens={chartData.breakevens}
                       showStock={showStock}
                       showOptions={showOptions}
                       showCombined={showCombined}
                    />
                    
                    {chartData.stats && (
                        <div className="grid grid-cols-4 gap-4 mt-8">
                            <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30">
                                <p className="text-xs text-green-400 font-medium uppercase tracking-wider">Max Profit</p>
                                <p className="text-2xl font-light text-green-300 mt-1">
                                    {chartData.stats.maxProfit > 1e6 ? "Unlimited" : `$${chartData.stats.maxProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                                </p>
                            </div>
                            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                                <p className="text-xs text-red-400 font-medium uppercase tracking-wider">Max Loss</p>
                                <p className="text-2xl font-light text-red-300 mt-1">
                                    {chartData.stats.maxLoss < -1e6 ? "Unlimited" : `$${chartData.stats.maxLoss.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
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
                                      {pos.iv && pos.iv > 0 && <span className="ml-2 text-xs text-orange-400 border border-orange-500/20 bg-orange-500/10 px-2 py-0.5 rounded-full">IV {pos.iv.toFixed(1)}%</span>}
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
       )}
    </div>
  );
}
