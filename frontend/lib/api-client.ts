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

