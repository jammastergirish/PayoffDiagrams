# TradeShape

<img width="796" height="454" alt="Screenshot 2026-01-05 at 10 12 03" src="https://github.com/user-attachments/assets/bea2750f-0be4-4d8a-bb6e-d1a5c433e8d5" />

A personalized trading dashboard that connects directly to Interactive Brokers (IBKR) TWS for real-time portfolio analysis, payoff diagrams, AI-powered news analysis, and more.

## Features

### 📊 Portfolio Dashboard
- **Live Connection**: Real-time sync with IBKR TWS positions and P&L
- **Multi-Account Support**: View positions across all accounts or filter by account
- **Key Metrics**: Net Liquidation, YTD %, Daily P&L, Realized P&L, Unrealized P&L, Buying Power
- **Privacy Mode**: Hide dollar amounts with a single click (shows only percentages)

### 📈 Payoff & Risk Analysis  
- **Interactive Charts**: P&L at different price points for stocks and options
- **Greeks Dashboard**: Delta, Gamma, Theta, Vega exposure per ticker
- **IV & Date Simulation**: Stress-test positions with volatility and time changes
- **Breakevens**: Automatically calculated with max profit/loss

### 📰 Market News
- **Market News Tab**: Latest headlines affecting your portfolio tickers
- **Ticker-Specific News**: News filtered per stock when viewing detail view
- **Article Popups**: Click headlines to read full articles
- **AI Analysis**: GPT-powered summaries of news impact on your positions
- **View Prompt**: See exactly what's being sent to the AI for transparency

### 📱 Mobile Responsive
- Works on phones via your local network
- Hamburger menu with slide-out sidebar
- Touch-friendly interface

<img width="798" height="451" alt="Screenshot 2026-01-05 at 10 11 48" src="https://github.com/user-attachments/assets/31c43623-beaf-4dd1-bfb6-555d4476699f" />

## Architecture

- **Frontend**: Next.js + React + TypeScript (in `frontend/`)
- **Backend**: Python FastAPI + ib_insync (in `backend/`)
- **News Data**: Massive.com API (Benzinga, Investing.com articles)
- **AI Analysis**: OpenAI GPT-4o-mini

## Quick Start

### Prerequisites
1. IBKR TWS or IB Gateway running
2. API enabled on port **7496** (or 7497 for paper trading)
3. [uv](https://docs.astral.sh/uv/) and Node.js installed

### Environment Variables

Copy `.env.example` to `.env` and add your keys:

```bash
cp .env.example .env
```

| Variable | Description | Required |
|----------|-------------|----------|
| `MASSIVE_API_KEY` | API key from [massive.com](https://massive.com) for news data | Yes (for news) |
| `OPENAI_API_KEY` | OpenAI API key for AI news analysis | Optional |

### Run Locally
```bash
./run.sh
```

This starts both:
- **Backend** at `http://localhost:8000`
- **Frontend** at `http://localhost:3000`

### Access from Phone (LAN)

The app is accessible from any device on your local network:

1. Find your Mac's IP: `ipconfig getifaddr en0`
2. On your phone, go to: `http://YOUR_IP:3000`

> **Note**: Only devices on your local WiFi can access the app. It is not exposed to the internet.

## Manual Setup

**Backend:**
```bash
uv run uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
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
4. Uncheck **"Read-Only API"** if you want trading features

## Testing

```bash
# Backend tests
uv run pytest backend/tests/ -v

# Frontend tests
cd frontend
npm test
```

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS, shadcn/ui, Recharts
- **Backend**: FastAPI, ib_insync, OpenAI, Python 3.13
- **Data Sources**: Interactive Brokers (positions/trades), Massive.com (news), Polygon.io (ticker logos)
