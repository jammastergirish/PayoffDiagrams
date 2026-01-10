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
// News API Types & Functions
// =====================

export interface NewsHeadline {
    articleId: string;
    headline: string;
    providerCode: string;
    time: string;
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

export async function fetchNewsArticle(
    providerCode: string,
    articleId: string
): Promise<NewsArticle> {
    try {
        const res = await fetch(`${API_BASE}/api/news/article/${providerCode}/${encodeURIComponent(articleId)}`);
        if (!res.ok) throw new Error("Failed to fetch article");
        return await res.json();
    } catch (e) {
        console.error(e);
        return { articleId, providerCode, text: "", error: "Failed to fetch article" };
    }
}

