# Payoff Diagram generator

Parses Interactive Brokers TWS CSV export and generates payoff diagrams for each ticker,
properly combining stock and options positions.

REQUIRED COLUMNS (column order doesn't matter):
- Financial Instrument: Stock ticker (e.g., "MU", "NVDA") or option description
  (e.g., "IREN Jan30'26 40 CALL", "NVDA Jun18'26 200 CALL")
- Position: Quantity of shares/contracts (positive for long, negative for short)
- Cost Basis: Total cost basis for the position

OPTIONAL COLUMNS:
- Last: Current price (used for stocks to get current stock price)
- Underlying Price: Underlying stock price for options (if provided, used directly;
  otherwise estimated from option prices)

The code automatically handles any additional columns (Market Value, Unrealized P&L,
Daily P&L, Delta, Gamma, Vega, Theta, etc.) but doesn't require them.

Usage: uv run main.py positions.csv
