# TradeCraft

<img width="796" height="454" alt="Screenshot 2026-01-05 at 10 12 03" src="https://github.com/user-attachments/assets/bea2750f-0be4-4d8a-bb6e-d1a5c433e8d5" />

A personalized trading dashboard that connects directly to Interactive Brokers (IBKR) TWS for real-time portfolio analysis, payoff diagrams, and market news.

## Features

### Portfolio Dashboard
- **Live Connection**: Real-time sync with IBKR TWS positions and P&L
- **Multi-Account Support**: View positions across all accounts or filter by account
- **Key Metrics**: Net Liquidation, Daily P&L, Realized P&L, Unrealized P&L

### Payoff & Risk Analysis  
- **Interactive Charts**: P&L at different price points for stocks and options
- **Greeks Dashboard**: Delta, Gamma, Theta, Vega exposure per ticker
- **IV & Date Simulation**: Stress-test positions with volatility and time changes
- **Breakevens**: Automatically calculated with max profit/loss

### Market Data
- **Price Charts**: Historical price data with 1H, 1D, 1W, 1M, 1Y timeframes
- **News Tab**: Latest headlines per ticker with full article popups

<img width="798" height="451" alt="Screenshot 2026-01-05 at 10 11 48" src="https://github.com/user-attachments/assets/31c43623-beaf-4dd1-bfb6-555d4476699f" />

## Architecture

- **Frontend**: Next.js + React (in `frontend/`)
- **Backend**: Python FastAPI + ib_insync (in `backend/`)

## Quick Start

### Prerequisites
1. IBKR TWS or IB Gateway running
2. API enabled on port **7496** (or 7497 for paper trading)
3. [uv](https://docs.astral.sh/uv/) and Node.js installed

### Run
```bash
./run.sh
```

This starts both the backend (port 8000) and frontend (port 3000).

### Manual Setup

**Backend:**
```bash
uv run uvicorn backend.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## TWS Configuration

1. Open TWS → Edit → Global Configuration → API → Settings
2. Enable **"Enable ActiveX and Socket Clients"**
3. Set Socket Port to **7496** (live) or **7497** (paper)
4. Uncheck **"Read-Only API"** if you want full access

## Testing

Unit tests are powered by Vitest:
```bash
cd frontend
npm test
```

## Tech Stack

- **Frontend**: Next.js 16, React, TypeScript, Tailwind CSS, shadcn/ui, Recharts
- **Backend**: FastAPI, ib_insync, Python 3
