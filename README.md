# Payoff Diagram Generator

<img width="358" height="301" alt="Screenshot 2025-12-19 at 21 10 06" src="https://github.com/user-attachments/assets/85a56bb0-5f7d-418f-958b-a7c6a706b6f3" />

Parses Interactive Brokers TWS CSV export and generates payoff diagrams for each ticker,
properly combining stock and options positions.

## Columns

### REQUIRED:
- Financial Instrument: Stock ticker (e.g., "MU", "NVDA") or option description
  (e.g., "IREN Jan30'26 40 CALL", "NVDA Jun18'26 200 CALL")
- Position: Quantity of shares/contracts (positive for long, negative for short)
- Cost Basis: Total cost basis for the position

### OPTIONAL (which I actually think should be required; will test on market open):
- Last: Current price (used for stocks to get current stock price)
- Underlying Price: Underlying stock price for options (if provided, used directly;
  otherwise estimated from option prices)

## TWS Setup

You'll need to split up strategies in TWS: File->Global Configuration->Display->Ticker Row->Complex (Multi-Leg Positions)->Hide Complex Positions

## Usage

`uv run main.py [CSV file] [image file]`

## Potential Next Steps

- Hook up to IBKR API for IBKR Pro users.
- Hook up to Alpaca/other data source for IBKR Lite users.
- Bring in data/connect to other brokers.
- Better user interface with Streamlit, or proper frontend.

