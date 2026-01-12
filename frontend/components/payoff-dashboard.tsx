
"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { 
  Position, 
  calculatePnl, 
  getBreakevens, 
  calculateMaxRiskReward,
  getPriceRange,
  calculateTheoreticalPnl
} from "@/lib/payoff-utils";
import { PayoffChart } from "@/components/payoff-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { checkBackendHealth, fetchLivePortfolio, fetchHistoricalData, HistoricalBar, fetchNewsHeadlines, NewsHeadline, fetchTickerDetails, TickerDetails } from "@/lib/api-client";
import { NewsModal } from "@/components/news-modal";
import { CandlestickChart } from "@/components/candlestick-chart";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine } from "recharts";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AccountSummary } from "@/lib/payoff-utils";

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  handler: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item === undefined) return;
      await handler(item);
    }
  });
  await Promise.all(workers);
}

// Decode HTML entities like &#39; -> ' and &amp; -> &
function decodeHtmlEntities(text: string): string {
  const textarea = typeof document !== 'undefined' ? document.createElement('textarea') : null;
  if (textarea) {
    textarea.innerHTML = text;
    return textarea.value;
  }
  // Fallback for SSR - handle common entities
  return text
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

// Format date as YYYY-MM-DD
function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Format datetime as YYYY-MM-DD HH:MM
function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${mins}`;
}

export function PayoffDashboard() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [stockPrices, setStockPrices] = useState<Record<string, number>>({});
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  const [loadTasks, setLoadTasks] = useState<Record<string, "pending" | "done">>({});
  const newsCacheRef = useRef<Record<string, NewsHeadline[]>>({});
  const isMountedRef = useRef(true);
  
  // Account State
  const [accounts, setAccounts] = useState<string[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("All");
  const [accountSummaries, setAccountSummaries] = useState<Record<string, AccountSummary>>({});

  const selectedAccountRef = useRef(selectedAccount);
  const selectedTickerRef = useRef<string | null>(selectedTicker);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    selectedAccountRef.current = selectedAccount;
  }, [selectedAccount]);

  useEffect(() => {
    selectedTickerRef.current = selectedTicker;
  }, [selectedTicker]);
  
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
  const [ibConnected, setIbConnected] = useState(false);
  
  // Toggles
  const [showStock, setShowStock] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showCombined, setShowCombined] = useState(true);
  const [showT0, setShowT0] = useState(false);

  // Simulation State
  const [ivAdjustment, setIvAdjustment] = useState(0); // 0 = 0% change
  const [daysOffset, setDaysOffset] = useState(0); // 0 to 90 days

  // Stock Chart State
  const [chartTimeframe, setChartTimeframe] = useState<string>("1M");
  const [priceChartData, setPriceChartData] = useState<HistoricalBar[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [priceChartCache, setPriceChartCache] = useState<Record<string, Record<string, HistoricalBar[]>>>({}); // Cache for preloaded data

  // News State
  const [newsHeadlines, setNewsHeadlines] = useState<NewsHeadline[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<{ articleId: string; providerCode: string; headline: string; body?: string; url?: string } | null>(null);
  const [isNewsModalOpen, setIsNewsModalOpen] = useState(false);

  // Ticker Details State (company name, logo)
  const [tickerDetailsCache, setTickerDetailsCache] = useState<Record<string, TickerDetails>>({});

  const startLoadTask = useCallback((key: string) => {
    setLoadTasks(prev => {
      if (prev[key] === "pending") return prev;
      return { ...prev, [key]: "pending" };
    });
  }, []);

  const completeLoadTask = useCallback((key: string) => {
    setLoadTasks(prev => {
      if (!prev[key] || prev[key] === "done") return prev;
      return { ...prev, [key]: "done" };
    });
  }, []);

  const registerLoadTasks = useCallback((keys: string[]) => {
    if (keys.length === 0) return;
    setLoadTasks(prev => {
      let changed = false;
      const next = { ...prev };
      keys.forEach(key => {
        if (!next[key]) {
          next[key] = "pending";
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, []);

  const { totalLoadTasks, completedLoadTasks, pendingLoadTasks, loadProgress, currentLoadingItem } = useMemo(() => {
    const entries = Object.entries(loadTasks);
    const total = entries.length;
    const completed = entries.filter(([, status]) => status === "done").length;
    const pending = total - completed;
    
    // Find the first pending task and parse its key to show what's loading
    const pendingTasks = entries.filter(([, status]) => status === "pending").map(([key]) => key);
    let currentItem = "";
    if (pendingTasks.length > 0) {
      const key = pendingTasks[0];
      // Parse keys like "chart:AAPL:1M" or "news:GOOG"
      const parts = key.split(":");
      if (parts[0] === "chart") {
        currentItem = `chart for ${parts[1]}`;
      } else if (parts[0] === "news") {
        currentItem = `news for ${parts[1]}`;
      } else {
        currentItem = parts.slice(1).join(" ") || key;
      }
    }
    
    return {
      totalLoadTasks: total,
      completedLoadTasks: completed,
      pendingLoadTasks: pending,
      loadProgress: total === 0 ? 0 : completed / total,
      currentLoadingItem: currentItem,
    };
  }, [loadTasks]);

  const targetDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + daysOffset);
    return d;
  }, [daysOffset]);

  const cachedChartBars = selectedTicker ? priceChartCache[selectedTicker]?.[chartTimeframe] : undefined;

  // Fetch historical data when ticker or timeframe changes
  useEffect(() => {
    let isCurrent = true;

    if (!selectedTicker || !isLiveMode || !ibConnected) {
      setPriceChartData([]);
      setChartLoading(false);
      return () => {
        isCurrent = false;
      };
    }
    
    if (cachedChartBars && cachedChartBars.length > 0) {
      setPriceChartData(cachedChartBars);
      setChartLoading(false);
      return () => {
        isCurrent = false;
      };
    }
    
    const taskKey = `chart:${selectedTicker}:${chartTimeframe}`;
    startLoadTask(taskKey);
    setChartLoading(true);
    fetchHistoricalData(selectedTicker, chartTimeframe)
      .then(data => {
        if (!isMountedRef.current || !isCurrent) return;
        const bars = data.bars || [];
        setPriceChartData(bars);
        if (bars.length > 0) {
          setPriceChartCache(prev => ({
            ...prev,
            [selectedTicker]: {
              ...(prev[selectedTicker] || {}),
              [chartTimeframe]: bars,
            },
          }));
        }
      })
      .finally(() => {
        if (!isMountedRef.current) return;
        completeLoadTask(taskKey);
        if (isCurrent) {
          setChartLoading(false);
        }
      });
    return () => {
      isCurrent = false;
    };
  }, [selectedTicker, chartTimeframe, isLiveMode, ibConnected, cachedChartBars, startLoadTask, completeLoadTask]);

  // Fetch news when ticker changes and poll every 30 seconds
  useEffect(() => {
    if (!selectedTicker || !isLiveMode || !ibConnected) {
      setNewsHeadlines([]);
      setNewsLoading(false);
      return;
    }
    
    let isCurrent = true;
    const ticker = selectedTicker;
    const cached = newsCacheRef.current[ticker];
    const hasCached = Array.isArray(cached);

    if (hasCached) {
      setNewsHeadlines(cached);
      setNewsLoading(false);
    } else {
      setNewsHeadlines([]);
      setNewsLoading(true);
    }

    const fetchNews = (trackLoad: boolean) => {
      const taskKey = `news:${ticker}`;
      if (trackLoad) {
        startLoadTask(taskKey);
      }

      fetchNewsHeadlines(ticker, 25)
        .then(data => {
          if (!isMountedRef.current || !isCurrent) return;
          const headlines = data.headlines || [];
          const existing = newsCacheRef.current[ticker];
          const hasExistingData = Array.isArray(existing) && existing.length > 0;
          if (headlines.length > 0 || !hasExistingData) {
            newsCacheRef.current[ticker] = headlines;
            setNewsHeadlines(headlines);
          }
        })
        .catch(err => {
          console.error("Error fetching news:", err);
          const hasCacheNow = Array.isArray(newsCacheRef.current[ticker]);
          if (isMountedRef.current && isCurrent && !hasCacheNow) {
            setNewsHeadlines([]);
          }
        })
        .finally(() => {
          if (trackLoad) {
            completeLoadTask(taskKey);
          }
          if (isMountedRef.current && isCurrent) {
            setNewsLoading(false);
          }
        });
    };
    
    // Initial fetch
    fetchNews(!hasCached);
    
    // Poll every 30 seconds
    const interval = setInterval(() => fetchNews(false), 30000);
    
    return () => {
      isCurrent = false;
      clearInterval(interval);
    };
  }, [selectedTicker, isLiveMode, ibConnected, startLoadTask, completeLoadTask]);

  // Fetch ticker details (company name, logo) when ticker changes
  useEffect(() => {
    if (!selectedTicker || !isLiveMode || !ibConnected) return;
    
    // Skip if already cached
    if (tickerDetailsCache[selectedTicker]) return;
    
    fetchTickerDetails(selectedTicker)
      .then(details => {
        if (details && !details.error) {
          setTickerDetailsCache(prev => ({
            ...prev,
            [selectedTicker]: details
          }));
        }
      })
      .catch(err => console.error("Failed to fetch ticker details:", err));
  }, [selectedTicker, isLiveMode, ibConnected, tickerDetailsCache]);

  // Get current ticker's details
  const currentTickerDetails = selectedTicker ? tickerDetailsCache[selectedTicker] : null;

  // Initial Backend Check
  useEffect(() => {
    let isMounted = true;
    let portfolioInterval: ReturnType<typeof setInterval> | null = null;

    const applyLivePrices = (pos: Position[]) => {
      const livePrices: Record<string, number> = {};
      pos.forEach(p => {
        if (!p.ticker) return;
        if (p.position_type === "stock" && p.current_price) {
          livePrices[p.ticker] = p.current_price;
        } else if (p.position_type !== "stock" && p.underlying_price) {
          livePrices[p.ticker] = p.underlying_price;
        }
      });
      setStockPrices(prev => ({ ...prev, ...livePrices }));
    };

    const bootstrap = async () => {
      startLoadTask("health");
      let health: Awaited<ReturnType<typeof checkBackendHealth>> | null = null;
      try {
        health = await checkBackendHealth();
      } finally {
        if (isMounted) completeLoadTask("health");
      }

      if (!isMounted) return;

      if (health && health.status === "ok") {
        setIsLiveMode(true);
        setBackendStatus("connected");
        setIbConnected(health.ib_connected);

        if (health.ib_connected) {
          startLoadTask("portfolio");
          let data: Awaited<ReturnType<typeof fetchLivePortfolio>>;
          try {
            data = await fetchLivePortfolio();
          } finally {
            if (isMounted) completeLoadTask("portfolio");
          }

          if (!isMounted) return;

          const pos = data.positions;
          setPositions(pos);

          if (data.accounts && data.accounts.length > 0) {
            setAccounts(data.accounts);
            if (selectedAccountRef.current !== "All" && !data.accounts.includes(selectedAccountRef.current)) {
              setSelectedAccount("All");
            }
          }

          if (data.summary) {
            setAccountSummaries(data.summary);
          }

          applyLivePrices(pos);

          const tickerList = Array.from(new Set(pos.map(p => p.ticker).filter(Boolean))) as string[];
          tickerList.sort();

          let primaryTicker = selectedTickerRef.current;
          if (!primaryTicker && tickerList.length > 0) {
            primaryTicker = tickerList[0];
            setSelectedTicker(primaryTicker);
          }

          portfolioInterval = setInterval(async () => {
            const updatedData = await fetchLivePortfolio();
            if (!isMounted) return;
            const updated = updatedData.positions;
            setPositions(updated);
            if (updatedData.accounts) setAccounts(updatedData.accounts);
            if (updatedData.summary) setAccountSummaries(updatedData.summary);
            applyLivePrices(updated);
          }, 5000);

          const chartPrefetchTickers = tickerList.filter(t => t !== primaryTicker);
          registerLoadTasks(chartPrefetchTickers.map(t => `chart:${t}:1M`));
          void runWithConcurrency(chartPrefetchTickers, 3, async ticker => {
            const taskKey = `chart:${ticker}:1M`;
            startLoadTask(taskKey);
            try {
              const chartData = await fetchHistoricalData(ticker, "1M");
              if (isMounted && chartData.bars?.length) {
                setPriceChartCache(prev => ({
                  ...prev,
                  [ticker]: {
                    ...(prev[ticker] || {}),
                    ["1M"]: chartData.bars,
                  },
                }));
              }
            } finally {
              if (isMounted) completeLoadTask(taskKey);
            }
          });

          const newsPrefetchTickers = tickerList.filter(t => t !== primaryTicker);
          registerLoadTasks(newsPrefetchTickers.map(t => `news:${t}`));
          void runWithConcurrency(newsPrefetchTickers, 2, async ticker => {
            const taskKey = `news:${ticker}`;
            startLoadTask(taskKey);
            try {
              const newsData = await fetchNewsHeadlines(ticker, 25);
              if (isMounted) {
                newsCacheRef.current[ticker] = newsData.headlines || [];
              }
            } finally {
              if (isMounted) completeLoadTask(taskKey);
            }
          });

          // Preload ticker details (company logos) for all tickers
          void runWithConcurrency(tickerList, 5, async ticker => {
            try {
              const details = await fetchTickerDetails(ticker);
              if (isMounted && details && !details.error) {
                setTickerDetailsCache(prev => ({
                  ...prev,
                  [ticker]: details
                }));
              }
            } catch (err) {
              // Ignore errors for ticker details
            }
          });
        }
      } else {
        setBackendStatus("offline");
      }
    };

    void bootstrap();

    return () => {
      isMounted = false;
      if (portfolioInterval) clearInterval(portfolioInterval);
    };
  }, [startLoadTask, completeLoadTask, registerLoadTasks]);



  const tickers = useMemo(() => {
    // Filter positions first by Account
    let visible = positions;
    if (selectedAccount !== 'All') {
        visible = positions.filter(p => p.account === selectedAccount);
    }
    return Array.from(new Set(visible.map(p => p.ticker))).sort();
  }, [positions, selectedAccount]);

  // Per-ticker P&L summary (aggregates stock + options)
  const perTickerPnl = useMemo(() => {
    let visible = positions;
    if (selectedAccount !== 'All') {
      visible = positions.filter(p => p.account === selectedAccount);
    }
    
    const summary: Record<string, { unrealized: number; daily: number; stockQty: number; optionCount: number }> = {};
    
    for (const p of visible) {
      if (!summary[p.ticker]) {
        summary[p.ticker] = { unrealized: 0, daily: 0, stockQty: 0, optionCount: 0 };
      }
      summary[p.ticker].unrealized += p.unrealized_pnl || 0;
      summary[p.ticker].daily += p.daily_pnl || 0;
      
      if (p.position_type === 'stock') {
        summary[p.ticker].stockQty += p.qty;
      } else {
        summary[p.ticker].optionCount += 1;
      }
    }
    
    return summary;
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

  const summaryUnrealizedPnl = useMemo(() => {
    if (!accountSummaries || Object.keys(accountSummaries).length === 0) return null;
    if (selectedAccount !== "All" && accountSummaries[selectedAccount]) {
      return accountSummaries[selectedAccount].unrealized_pnl;
    }
    if (selectedAccount === "All") {
      return Object.values(accountSummaries).reduce((sum, s) => sum + s.unrealized_pnl, 0);
    }
    return null;
  }, [accountSummaries, selectedAccount]);

  const portfolioUnrealizedPnl = useMemo(() => {
    if (summaryUnrealizedPnl !== null) return summaryUnrealizedPnl;
    return positions.reduce((sum, p) => sum + (p.unrealized_pnl || 0), 0);
  }, [positions, summaryUnrealizedPnl]);

  const positionCount = useMemo(() => {
    if (selectedAccount === "All") return positions.length;
    return positions.filter(p => p.account === selectedAccount).length;
  }, [positions, selectedAccount]);

  return (
    <div className="flex flex-col gap-6">
      {pendingLoadTasks > 0 && (
        <div className="rounded-full border border-white/5 bg-white/5 px-2 py-1">
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-orange-500 via-amber-400 to-emerald-400 transition-all duration-300 ease-out"
              style={{ width: `${Math.max(loadProgress, 0.05) * 100}%` }}
            />
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-wider text-gray-500">
            Loading {currentLoadingItem || ""} {completedLoadTasks}/{totalLoadTasks}
          </div>
        </div>
      )}


       {isLiveMode && (
           <div className={`flex items-center gap-2 p-3 rounded-lg text-sm border ${ibConnected ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'}`}>
               <div className={`w-2 h-2 rounded-full animate-pulse ${ibConnected ? 'bg-green-500' : 'bg-yellow-500'}`} />
               {ibConnected ? "Live Connection to IBKR TWS" : "Backend Connected (Waiting for TWS...)"}
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
                       {ibConnected ? "CONNECTED" : "Loc: 8000 OK / TWS: --"}
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {accountSummaries && selectedAccount !== 'All' && accountSummaries[selectedAccount] && (
             <>
                <Card className="bg-slate-900 border-white/10 shadow-lg">
                  <CardContent className="pt-4">
                    <div className="text-sm font-medium text-gray-400">Account Net Liq</div>
                    <div className="text-2xl font-bold text-white mt-1">
                      {formatCurrency(accountSummaries[selectedAccount].net_liquidation)}
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-slate-900 border-white/10 shadow-lg">
                  <CardContent className="pt-4">
                    <div className="text-sm font-medium text-gray-400">Today's P&L</div>
                    <div className={`text-2xl font-bold mt-1 ${accountSummaries[selectedAccount].daily_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {accountSummaries[selectedAccount].daily_pnl >= 0 ? '+' : ''}{formatCurrency(accountSummaries[selectedAccount].daily_pnl)}
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-slate-900 border-white/10 shadow-lg">
                  <CardContent className="pt-4">
                    <div className="text-sm font-medium text-gray-400">Realized P&L</div>
                    <div className={`text-2xl font-bold mt-1 ${accountSummaries[selectedAccount].realized_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {accountSummaries[selectedAccount].realized_pnl >= 0 ? '+' : ''}{formatCurrency(accountSummaries[selectedAccount].realized_pnl)}
                    </div>
                  </CardContent>
                </Card>
             </>
        )}
        {accountSummaries && selectedAccount === 'All' && (
             <>
                <Card className="bg-slate-900 border-white/10 shadow-lg">
                  <CardContent className="pt-4">
                    <div className="text-sm font-medium text-gray-400">Total Net Liq</div>
                    <div className="text-2xl font-bold text-white mt-1">
                      {formatCurrency(Object.values(accountSummaries).reduce((sum, s) => sum + s.net_liquidation, 0))}
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-slate-900 border-white/10 shadow-lg">
                  <CardContent className="pt-4">
                    <div className="text-sm font-medium text-gray-400">Total Today's P&L</div>
                    <div className={`text-2xl font-bold mt-1 ${Object.values(accountSummaries).reduce((sum, s) => sum + s.daily_pnl, 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {Object.values(accountSummaries).reduce((sum, s) => sum + s.daily_pnl, 0) >= 0 ? '+' : ''}{formatCurrency(Object.values(accountSummaries).reduce((sum, s) => sum + s.daily_pnl, 0))}
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-slate-900 border-white/10 shadow-lg">
                  <CardContent className="pt-4">
                    <div className="text-sm font-medium text-gray-400">Total Realized P&L</div>
                    <div className={`text-2xl font-bold mt-1 ${Object.values(accountSummaries).reduce((sum, s) => sum + s.realized_pnl, 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {Object.values(accountSummaries).reduce((sum, s) => sum + s.realized_pnl, 0) >= 0 ? '+' : ''}{formatCurrency(Object.values(accountSummaries).reduce((sum, s) => sum + s.realized_pnl, 0))}
                    </div>
                  </CardContent>
                </Card>
             </>
        )}

        <Card className="bg-slate-900 border-white/10 shadow-lg">
          <CardContent className="pt-4">
            <div className="text-sm font-medium text-gray-400">
              {selectedAccount === "All" ? "Total Unrealized P&L" : "Account Unrealized P&L"}
            </div>
            <div className={`text-2xl font-bold mt-1 ${portfolioUnrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {portfolioUnrealizedPnl >= 0 ? '+' : ''}{formatCurrency(portfolioUnrealizedPnl)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              across {positionCount} positions
            </div>
          </CardContent>
        </Card>
      </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 flex-1 min-h-0">
            {/* Sidebar */}
            <Card className="md:col-span-1 bg-slate-950 border-white/10 text-white flex flex-col max-h-[calc(100vh-320px)]">
               <CardHeader className="flex-shrink-0">
                 <CardTitle className="text-gray-400 font-normal uppercase tracking-wider text-xs">Tickers</CardTitle>
               </CardHeader>
               <CardContent className="flex flex-col gap-2 overflow-y-auto flex-1">
                  {tickers.map(t => {
                    const pnl = perTickerPnl[t] || { unrealized: 0, daily: 0, stockQty: 0, optionCount: 0 };
                    const hasStock = pnl.stockQty !== 0;
                    const hasOptions = pnl.optionCount > 0;
                    return (
                      <div 
                        key={t} 
                        className={`p-3 rounded-lg cursor-pointer transition-colors ${
                          selectedTicker === t 
                            ? "bg-orange-500/20 border border-orange-500/50" 
                            : "bg-white/5 border border-transparent hover:bg-white/10"
                        }`}
                        onClick={() => setSelectedTicker(t)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {/* Ticker Logo with placeholder spacer */}
                            <div className="w-6 h-6 flex-shrink-0 rounded bg-white/10 overflow-hidden">
                              {tickerDetailsCache[t]?.branding?.icon_url ? (
                                <img 
                                  src={tickerDetailsCache[t].branding!.icon_url!}
                                  alt={t}
                                  className="w-full h-full object-contain"
                                  onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0'; }}
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-600 text-[10px] font-bold">
                                  {t.slice(0, 2)}
                                </div>
                              )}
                            </div>
                            <span className={`font-medium ${selectedTicker === t ? "text-orange-500" : "text-white"}`}>
                              {t}
                            </span>
                            {stockPrices[t] && (
                              <span className="text-xs text-gray-400 font-mono">
                                ${stockPrices[t].toFixed(2)}
                              </span>
                            )}
                          </div>
                          <div className="flex gap-1 text-[10px]">
                            {hasStock && <span className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">{pnl.stockQty > 0 ? '+' : ''}{pnl.stockQty}</span>}
                            {hasOptions && <span className="px-1.5 py-0.5 rounded bg-purple-900/50 text-purple-300">{pnl.optionCount} opt</span>}
                          </div>
                        </div>
                        <div className="flex justify-between mt-2 text-xs">
                          <div>
                            <div className="text-gray-500">Unrealized</div>
                            <div className={pnl.unrealized >= 0 ? "text-green-400" : "text-red-400"}>
                              {pnl.unrealized >= 0 ? '+' : ''}{formatCurrency(pnl.unrealized)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-gray-500">Today</div>
                            <div className={pnl.daily >= 0 ? "text-green-400" : "text-red-400"}>
                              {pnl.daily >= 0 ? '+' : ''}{formatCurrency(pnl.daily)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  
                  <div className="my-2 border-b border-white/10" />
                  <Button variant="ghost" onClick={() => setPositions([])} className="w-full text-red-500 hover:text-red-400 hover:bg-red-500/10">
                    Reset
                  </Button>
               </CardContent>
            </Card>

            {/* Main Content */}
            <div className="md:col-span-3 flex flex-col gap-6 overflow-y-auto">
              {/* Ticker Header - visible across all tabs */}
              <div className="flex items-center gap-4 px-2">
                {/* Company Logo */}
                {currentTickerDetails?.branding?.icon_url && (
                  <img 
                    src={currentTickerDetails.branding.icon_url}
                    alt={currentTickerDetails.name || selectedTicker || ''}
                    className="w-12 h-12 rounded-lg bg-white/10 object-contain p-1"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-bold tracking-wide text-white">{selectedTicker || "Select a Ticker"}</h2>
                    {currentTickerDetails?.name && (
                      <span className="text-lg text-gray-400 font-light">{currentTickerDetails.name}</span>
                    )}
                  </div>
                  {selectedTicker && currentPrice > 0 && (
                    <div className="flex items-center gap-3">
                      <span className="text-3xl font-bold text-white">${currentPrice.toFixed(2)}</span>
                      {perTickerPnl[selectedTicker] && (
                        <div className={`flex items-center gap-1 text-sm font-medium ${perTickerPnl[selectedTicker].daily >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          <span className="text-xl">{perTickerPnl[selectedTicker].daily >= 0 ? '▲' : '▼'}</span>
                          <span>{perTickerPnl[selectedTicker].daily >= 0 ? '+' : ''}{formatCurrency(perTickerPnl[selectedTicker].daily)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <Tabs defaultValue="payoff" className="w-full">
                <TabsList className="bg-slate-900 border border-white/10">
                  <TabsTrigger value="chart" className="data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-400">Price Chart</TabsTrigger>
                  <TabsTrigger value="news" className="data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-400">News</TabsTrigger>
                  <TabsTrigger value="risk" className="data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-400">Positions & Profile</TabsTrigger>
                  <TabsTrigger value="payoff" className="data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-400">Payoff Diagram</TabsTrigger>
                </TabsList>
                <TabsContent value="chart" className="mt-4">
                  <Card className="bg-slate-950 border-white/10 text-white">
                    <CardHeader className="flex flex-row items-center justify-end pb-4 border-b border-white/5">
                      <div className="flex gap-1">
                        {([
                          { tf: "1H", label: "1H", barSize: "1min" },
                          { tf: "1D", label: "1D", barSize: "5min" },
                          { tf: "1W", label: "1W", barSize: "Hourly" },
                          { tf: "1M", label: "1M", barSize: "Daily" },
                          { tf: "1Y", label: "1Y", barSize: "Daily" },
                        ]).map(({ tf, label, barSize }) => (
                          <Button
                            key={tf}
                            variant={chartTimeframe === tf ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setChartTimeframe(tf)}
                            className={chartTimeframe === tf 
                              ? "bg-orange-500 hover:bg-orange-600 text-white" 
                              : "text-gray-400 hover:text-white hover:bg-white/10"}
                            title={`${label} (${barSize} bars)`}
                          >
                            <span>{label}</span>
                            <span className="ml-1 text-[10px] opacity-60">{barSize}</span>
                          </Button>
                        ))}
                      </div>
                    </CardHeader>
                    <CardContent className="pt-6">
                      {chartLoading && (
                        <div className="flex items-center justify-center h-[400px] text-gray-500">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
                        </div>
                      )}
                      {!chartLoading && priceChartData.length === 0 && (
                        <div className="flex items-center justify-center h-[400px] text-gray-500">
                          {selectedTicker ? "No chart data available" : "Select a ticker to view chart"}
                        </div>
                      )}
                      {!chartLoading && priceChartData.length > 0 && (
                        <CandlestickChart 
                          data={priceChartData} 
                          livePrice={currentPrice}
                          timeframe={chartTimeframe}
                        />
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* News Tab */}
                <TabsContent value="news" className="mt-4">
                  <Card className="bg-slate-950 border-white/10 text-white">
                    <CardHeader className="pb-2 border-b border-white/5">
                      <CardTitle className="text-gray-400 font-normal uppercase tracking-wider text-xs">Latest News for {selectedTicker}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-2">
                      {newsLoading && (
                        <div className="flex items-center justify-center py-12">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
                        </div>
                      )}
                      {!newsLoading && newsHeadlines.length === 0 && (
                        <div className="text-gray-500 py-8 text-center">
                          {selectedTicker ? "No news available for this ticker" : "Select a ticker to view news"}
                        </div>
                      )}
                      {!newsLoading && newsHeadlines.length > 0 && (
                        <div className="space-y-2">
                          {newsHeadlines.map((news, idx) => (
                            <div
                              key={`${news.articleId}-${idx}`}
                              className="p-4 bg-white/5 rounded-lg border border-white/5 hover:bg-white/10 hover:border-orange-500/30 transition-colors cursor-pointer group"
                              onClick={() => {
                                setSelectedArticle({
                                  articleId: news.articleId,
                                  providerCode: news.providerCode,
                                  headline: decodeHtmlEntities(news.headline),
                                  body: news.body || news.teaser,
                                  url: news.url
                                });
                                setIsNewsModalOpen(true);
                              }}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                  <h3 className="text-sm font-medium text-white group-hover:text-orange-400 transition-colors leading-snug">
                                    {decodeHtmlEntities(news.headline)}
                                  </h3>
                                  <div className="flex items-center gap-3 mt-2">
                                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                                      {news.providerName || news.providerCode}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                      {formatDateTime(news.time)}
                                    </span>
                                  </div>
                                </div>
                                <span className="text-gray-600 group-hover:text-orange-500 transition-colors text-lg">→</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* News Article Modal */}
                  {selectedArticle && (
                    <NewsModal
                      isOpen={isNewsModalOpen}
                      onClose={() => {
                        setIsNewsModalOpen(false);
                        setSelectedArticle(null);
                      }}
                      providerCode={selectedArticle.providerCode}
                      articleId={selectedArticle.articleId}
                      headline={selectedArticle.headline}
                      articleBody={selectedArticle.body}
                      articleUrl={selectedArticle.url}
                    />
                  )}
                </TabsContent>

                <TabsContent value="payoff" className="mt-4 space-y-6">
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
                                        {formatDate(targetDate)} <span className="text-xs text-gray-500">({daysOffset === 0 ? 'Today' : `+${daysOffset}d`})</span>
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
                 </CardContent>
               </Card>
                </TabsContent>

                {/* Position & Risk Profile Tab */}
                <TabsContent value="risk" className="mt-4 space-y-6">
                  {/* Positions Table */}
                  <Card className="bg-slate-950 border-white/10 text-white">
                    <CardHeader><CardTitle className="text-gray-400 font-normal uppercase tracking-wider text-xs">Positions for {selectedTicker}</CardTitle></CardHeader>
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

                  {/* Max Profit/Loss Cards */}
                  {chartData.stats && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

                  {/* Risk Dashboard (Greeks) */}
                  <Card className="bg-slate-950 border-white/10 text-white">
                    <CardHeader><CardTitle className="text-gray-400 font-normal uppercase tracking-wider text-xs">Risk Profile (Greeks)</CardTitle></CardHeader>
                    <CardContent>
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
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
         </div>
          </div>
       )}

    </div>
  );
}
