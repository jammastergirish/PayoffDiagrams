import { Position } from "./payoff-utils";

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

export async function fetchLivePortfolio(): Promise<Position[]> {
    try {
        const res = await fetch(`${API_BASE}/api/portfolio`);
        if (!res.ok) throw new Error("Failed to fetch portfolio");
        const data = await res.json();
        return data.positions; // Backend returns { positions: [...] }
    } catch (e) {
        console.error(e);
        return [];
    }
}
