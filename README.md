# Payoff Visualizer

<img width="796" height="454" alt="Screenshot 2026-01-05 at 10 12 03" src="https://github.com/user-attachments/assets/bea2750f-0be4-4d8a-bb6e-d1a5c433e8d5" />

A privacy-focused, client-side web application for visualizing stock and option payoff diagrams.

Upload your Interactive Brokers (IBKR) CSV export and instantly analyze your portfolio's risk profile, breakeven points, and Greeks.

## Features

*   **Interactive Charts**: visualizing P&L at different price points.
*   **Privacy First**: All data processing happens in your browser. Your CSV is never uploaded to any server.
*   **Risk Dashboard**: View Net Delta, Gamma, Theta, and Vega to understand your portfolio's true exposure.
*   **Advanced Metrics**: Supports Implied Volatility (IV) and Probability of Profit (POP) analysis.
*   **Instant Insights**: Automatically calculates Breakevens, Max Profit/Loss, and Days to Expiry (DTE).
*   **simulation & Risk Analysis**:
    *   **T+0 Prediction**: Visualize your "mark-to-market" P&L curve for *today* (including theoretical option pricing) vs. the solid expiration line.
    *   **IV Simulation**: Stress-test your portfolio against Volatility crushes or spikes (Vega Risk).
    *   **Date Simulation**: Fast-forward time to see how Theta decay impacts your positions.

<img width="798" height="451" alt="Screenshot 2026-01-05 at 10 11 48" src="https://github.com/user-attachments/assets/31c43623-beaf-4dd1-bfb6-555d4476699f" />

## Architecture

*   **Frontend**: Next.js application (in `frontend/`).
*   **Backend** (Optional): Python FastAPI (in `backend/`) for live IBKR connection.

## How to Run

### Quick Start (Recommended)
Use the helper script to start both the frontend and backend (if available).

```bash
sh run.sh
```

### Manual Setup

1.  **Frontend Only (Lite Mode)**:
    ```bash
    cd frontend
    npm install
    npm run dev
    ```

2.  **Backend (Live Mode)**:
    ```bash
    pip install -r backend/requirements.txt
    python3 -m uvicorn backend.main:app --reload --port 8000
    ```

## Live Mode (IBKR)
To use Live Mode with Interactive Brokers:
1.  Open TWS or IB Gateway.
2.  Enable API on port **7497**.
3.  Run `sh run.sh`.
4.  The app will auto-detect the connection.

## Testing

Unit tests are powered by Vitest and live under `frontend/tests/`.

## Data Requirement (IBKR Export)

To get the most out of this tool, configure your **TWS (Trader Workstation)** or **IBKR Web** export to include the following columns.

You'll need to split up strategies in TWS: `File->Global Configuration->Display->Ticker Row->Complex (Multi-Leg Positions)->Hide Complex Positions`

### Essential Columns
*   `Financial Instrument` (e.g., "MU Feb20'26 300 PUT")
*   `Position` (Quantity)
*   `Last` (Current Price of the instrument)
*   `Cost Basis` (Total cost of the position)
*   `Underlying Price` (Current price of the stock)

### For Greeks & Risk Dashboard (Highly Recommended)
*   `Delta`
*   `Gamma`
*   `Theta`
*   `Vega`

### For Advanced Metrics (Optional)
*   `Implied Vol.` (or `IV`)
*   `Prob. of Profit` (or `POP`)
*   `Unrealized P&L`

### How to Export from TWS
1.  Go to your **Portfolio** tab.
2.  Right-click headers -> "Customize Layout".
3.  Add the columns listed above.
4.  Right-click any position -> "Export" -> "Export Current View".
5.  Save as `.csv`.
