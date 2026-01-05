
# Payoff Visualizer

A privacy-focused, client-side web application for visualizing stock and option payoff diagrams.

Upload your Interactive Brokers (IBKR) CSV export and instantly analyze your portfolio's risk profile, breakeven points, and Greeks.

## Features

*   **Interactive Charts**: visualizing P&L at different price points.
*   **Privacy First**: All data processing happens in your browser. Your CSV is never uploaded to any server.
*   **Risk Dashboard**: View Net Delta, Gamma, Theta, and Vega to understand your portfolio's true exposure.
*   **Advanced Metrics**: Supports Implied Volatility (IV) and Probability of Profit (POP) analysis.
*   **Instant Insights**: Automatically calculates Breakevens, Max Profit/Loss, and Days to Expiry (DTE).

## How to Run

1.  Install dependencies (first time only):
    ```bash
    npm install
    ```

2.  Start the development server:
    ```bash
    npm run dev
    ```

3.  Open [http://localhost:3000](http://localhost:3000) in your browser.

## Testing

Unit tests are powered by Vitest and live under `tests/`.

```bash
npm test
```

For watch mode:

```bash
npm run test:watch
```

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
