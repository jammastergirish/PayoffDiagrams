# Payoff Diagram Generator

<img width="214" height="186" alt="PNG image" src="https://github.com/user-attachments/assets/6d47552c-3fca-40be-aaf0-4f02c19cb518" />

Parses Interactive Brokers TWS CSV export and generates payoff diagrams for each ticker,
properly combining stock and options positions.

REQUIRED COLUMNS (order doesn't matter):
- Financial Instrument: Stock ticker (e.g., "MU", "NVDA") or option description
  (e.g., "IREN Jan30'26 40 CALL", "NVDA Jun18'26 200 CALL")
- Position: Quantity of shares/contracts (positive for long, negative for short)
- Cost Basis: Total cost basis for the position

OPTIONAL COLUMNS:
- Last: Current price (used for stocks to get current stock price)
- Underlying Price: Underlying stock price for options (if provided, used directly;
  otherwise estimated from option prices)

You'll need to split up strategies in TWS: File->Global Configuration->Display->Ticker Row->Complex (Multi-Leg Positions)->Hide Complex Positions

Usage: `uv run main.py [CSV file] [image file]`

The plan is to uograde this to a Streamlit app, and perhaps add the ability to pull live data from Interactive Brokers via the API for pro users, or hook up to Alpaca for light users. We can also think about more complex diagrams, use of options equations over time, etc. 
