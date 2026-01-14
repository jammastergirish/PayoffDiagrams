import { Position, AccountSummary } from "./payoff-utils";

const API_BASE = "http://localhost:8000";

export async function checkBackendHealth(): Promise<{ status: string; ib_connected: boolean } | null> {
    try {
        const res = await fetch(`${API_BASE}/api/health`);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        return null;
    }
}

export async function fetchLivePortfolio(): Promise<{ 
    accounts: string[], 
    positions: Position[], 
    summary: Record<string, AccountSummary> 
}> {
    try {
        const res = await fetch(`${API_BASE}/api/portfolio`);
        if (!res.ok) throw new Error("Failed to fetch portfolio");
        const data = await res.json();
        
        if (Array.isArray(data)) {
             return { accounts: [], positions: data, summary: {} };
        } else if (data.positions) {
             // Handle legacy summary (single object) vs new summary (map)
             let summaryMap: Record<string, AccountSummary> = {};
             
             if (data.summary) {
                 // Check if it's the new map keyed by ID or the old single object
                 // Simple heuristic: check if values are objects
                 const keys = Object.keys(data.summary);
                 if (keys.length > 0 && typeof data.summary[keys[0]] === 'object') {
                     summaryMap = data.summary;
                 } else {
                     // Legacy single summary, assign to "default" or try to infer
                     summaryMap["default"] = data.summary;
                 }
             }

             return { 
                 accounts: data.accounts || [], 
                 positions: data.positions, 
                 summary: summaryMap 
             };
        }
        return { accounts: [], positions: [], summary: {} };
    } catch (e) {
        console.error(e);
        return { accounts: [], positions: [], summary: {} };
    }
}

export interface HistoricalBar {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export async function fetchHistoricalData(
    symbol: string, 
    timeframe: string = "1M"
): Promise<{ symbol: string; timeframe: string; bars: HistoricalBar[] }> {
    try {
        const res = await fetch(`${API_BASE}/api/historical/${symbol}?timeframe=${timeframe}`);
        if (!res.ok) throw new Error("Failed to fetch historical data");
        return await res.json();
    } catch (e) {
        console.error(e);
        return { symbol, timeframe, bars: [] };
    }
}

// =====================
// Ticker Details (Company Info, Branding)
// =====================

export interface TickerDetails {
    symbol: string;
    name?: string;
    description?: string;
    homepage_url?: string;
    market_cap?: number;
    total_employees?: number;
    list_date?: string;
    branding?: {
        logo_url?: string;
        icon_url?: string;
    };
    error?: string;
}

export async function fetchTickerDetails(symbol: string): Promise<TickerDetails> {
    try {
        const res = await fetch(`${API_BASE}/api/ticker/${symbol}`);
        if (!res.ok) throw new Error("Failed to fetch ticker details");
        return await res.json();
    } catch (e) {
        console.error(e);
        return { symbol, error: "Failed to fetch details" };
    }
}

// =====================
// News API Types & Functions
// =====================

export interface NewsHeadline {
    articleId: string;
    headline: string;
    providerCode: string;
    providerName?: string;  // Full publisher name (e.g., "Benzinga", "Investing.com")
    time: string;
    teaser?: string;   // Short summary
    body?: string;     // Full article content (from Benzinga)
    url?: string;      // Link to original article
    author?: string;
    channels?: string[];
    imageUrl?: string; // Article thumbnail image
}

export interface NewsArticle {
    articleId: string;
    providerCode: string;
    text: string;
    articleType?: string;
    error?: string;
}

export async function fetchNewsHeadlines(
    symbol: string,
    limit: number = 10
): Promise<{ symbol: string; headlines: NewsHeadline[] }> {
    try {
        // Add timeout to prevent hanging - news API can be slow
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
        
        const res = await fetch(`${API_BASE}/api/news/${symbol}?limit=${limit}`, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (!res.ok) throw new Error("Failed to fetch news");
        return await res.json();
    } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') {
            console.warn(`News request for ${symbol} timed out`);
        } else {
            console.error(e);
        }
        return { symbol, headlines: [] };
    }
}

export async function fetchMarketNewsHeadlines(
    limit: number = 25
): Promise<{ headlines: NewsHeadline[] }> {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        const res = await fetch(`${API_BASE}/api/news/market?limit=${limit}`, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (!res.ok) throw new Error("Failed to fetch market news");
        return await res.json();
    } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') {
            console.warn('Market news request timed out');
        } else {
            console.error(e);
        }
        return { headlines: [] };
    }
}

export async function fetchNewsArticle(
    providerCode: string,
    articleId: string
): Promise<NewsArticle> {
    try {
        // New Massive.com Benzinga endpoint only needs articleId
        const res = await fetch(`${API_BASE}/api/news/article/${encodeURIComponent(articleId)}`);
        if (!res.ok) throw new Error("Failed to fetch article");
        return await res.json();
    } catch (e) {
        console.error(e);
        return { articleId, providerCode, text: "", error: "Failed to fetch article" };
    }
}


// =====================
// Watchlist API Functions
// =====================

export async function fetchWatchlist(): Promise<string[]> {
    try {
        const res = await fetch(`${API_BASE}/api/watchlist`);
        if (!res.ok) throw new Error("Failed to fetch watchlist");
        const data = await res.json();
        return data.tickers || [];
    } catch (e) {
        console.error(e);
        return [];
    }
}

export async function addToWatchlist(ticker: string): Promise<string[]> {
    try {
        const res = await fetch(`${API_BASE}/api/watchlist`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ticker }),
        });
        if (!res.ok) throw new Error("Failed to add to watchlist");
        const data = await res.json();
        return data.tickers || [];
    } catch (e) {
        console.error(e);
        return [];
    }
}

export async function removeFromWatchlist(ticker: string): Promise<string[]> {
    try {
        const res = await fetch(`${API_BASE}/api/watchlist/${encodeURIComponent(ticker)}`, {
            method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to remove from watchlist");
        const data = await res.json();
        return data.tickers || [];
    } catch (e) {
        console.error(e);
        return [];
    }
}


// =====================
// Daily Snapshot API
// =====================

export interface DailySnapshot {
    symbol: string;
    current_price?: number;
    previous_close?: number;
    change?: number;
    change_pct?: number;
    error?: string;
}

export async function fetchDailySnapshot(symbol: string): Promise<DailySnapshot | null> {
    try {
        const res = await fetch(`${API_BASE}/api/snapshot/${encodeURIComponent(symbol)}`);
        if (!res.ok) throw new Error("Failed to fetch snapshot");
        return await res.json();
    } catch (e) {
        console.error(e);
        return null;
    }
}


// =====================
// Trade Order API
// =====================

export interface TradeOrder {
    symbol: string;
    action: "BUY" | "SELL";
    quantity: number;
    order_type: "MARKET" | "LIMIT";
    limit_price?: number;
}

export interface TradeResult {
    success: boolean;
    order_id?: number;
    status?: string;
    message?: string;
    error?: string;
}

export async function placeTrade(order: TradeOrder): Promise<TradeResult> {
    try {
        const res = await fetch(`${API_BASE}/api/trade`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(order),
        });
        if (!res.ok) throw new Error("Failed to place trade");
        return await res.json();
    } catch (e) {
        console.error(e);
        return { success: false, error: e instanceof Error ? e.message : "Failed to place trade" };
    }
}


// =====================
// Options Chain API
// =====================

export interface OptionQuote {
    strike: number;
    expiration: string;
    bid: number;
    ask: number;
    last: number;
    mid: number;
    volume: number;
    openInterest: number;
    iv: number | null;
    delta: number | null;
    gamma: number | null;
    theta: number | null;
    vega: number | null;
}

export interface OptionsChain {
    symbol: string;
    underlying_price: number;
    expirations: string[];
    strikes: number[];
    calls: Record<string, Record<number, OptionQuote>>; // expiry -> strike -> quote
    puts: Record<string, Record<number, OptionQuote>>;
    error?: string;
}

export async function fetchOptionsChain(symbol: string, maxStrikes: number = 30): Promise<OptionsChain> {
    try {
        const res = await fetch(`${API_BASE}/api/options-chain/${symbol}?max_strikes=${maxStrikes}`);
        if (!res.ok) throw new Error("Failed to fetch options chain");
        return await res.json();
    } catch (e) {
        console.error(e);
        return { 
            symbol, 
            underlying_price: 0,
            expirations: [], 
            strikes: [], 
            calls: {}, 
            puts: {},
            error: e instanceof Error ? e.message : "Failed to fetch options chain"
        };
    }
}


// =====================
// Options Trading API
// =====================

export interface OptionLeg {
    symbol: string;
    expiry: string;  // YYYYMMDD format
    strike: number;
    right: "C" | "P";
    action: "BUY" | "SELL";
    quantity: number;
}

export interface OptionsTradeOrder {
    legs: OptionLeg[];
    order_type: "MARKET" | "LIMIT";
    limit_price?: number;
}

export async function placeOptionsOrder(order: OptionsTradeOrder): Promise<TradeResult> {
    try {
        const res = await fetch(`${API_BASE}/api/options/trade`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(order),
        });
        if (!res.ok) throw new Error("Failed to place options order");
        return await res.json();
    } catch (e) {
        console.error(e);
        return { success: false, error: e instanceof Error ? e.message : "Failed to place options order" };
    }
}
