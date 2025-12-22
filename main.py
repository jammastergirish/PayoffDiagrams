# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "pandas",
#   "numpy",
#   "matplotlib",
# ]
# ///

import re
import sys
from dataclasses import dataclass
from typing import List, Optional, Tuple

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd


@dataclass
class Position:
    """Represents a trading position (stock or option)."""
    ticker: str
    position_type: str  # 'stock', 'call', 'put'
    qty: int
    strike: Optional[float] = None
    cost_basis: Optional[float] = None
    expiry: Optional[str] = None
    dte: Optional[int] = None


def clean_number(value) -> float:
    """Clean number strings that may have commas, quotes, or other formatting."""
    if pd.isna(value):
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)

    # Remove commas, quotes, and other formatting
    cleaned = str(value).replace(',', '').replace(
        "'", '').replace('"', '').strip()
    # Handle negative numbers that might be formatted as '-value
    if cleaned.startswith("'-"):
        cleaned = '-' + cleaned[2:]
    try:
        return float(cleaned)
    except (ValueError, TypeError):
        return 0.0


def parse_financial_instrument(instrument: str) -> dict:
    """Parse Interactive Brokers TWS financial instrument format.

    Handles:
    - Stocks: "MU", "NVDA", etc.
    - Options: "IREN Jan30'26 40 CALL", "NVDA Jun18'26 200 CALL", etc.
    """
    if pd.isna(instrument):
        return {'ticker': '', 'type': 'stock'}

    instrument = str(instrument).strip()

    # Check if it's just a ticker (stock) - no CALL/PUT keywords
    if ' CALL' not in instrument and ' PUT' not in instrument:
        return {'ticker': instrument, 'type': 'stock'}

    # Parse option format: "IREN Jan30'26 40 CALL" or "NVDA Jun18'26 200 CALL"
    # Pattern: TICKER MonthDD'YY Strike CALL/PUT
    # Also handles formats like "AAAU Mar20'26 39 PUT" or
    # "MU Dec26'25 272.5 CALL"
    pattern = (r'^([A-Z]+)\s+([A-Za-z]{3})(\d{1,2})\'(\d{2})\s+'
               r'(\d+(?:\.\d+)?)\s+(CALL|PUT)$')
    match = re.match(pattern, instrument)
    if match:
        ticker = match.group(1)
        month_str = match.group(2)
        day = match.group(3)
        year_short = match.group(4)
        strike = float(match.group(5))
        opt_type = match.group(6).lower()

        # Convert month abbreviation to number
        month_map = {
            'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
            'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
            'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
        }
        month = month_map.get(month_str, '01')
        year = f"20{year_short}"
        expiry = f"{year}-{month}-{day.zfill(2)}"

        return {
            'ticker': ticker,
            'type': opt_type,
            'strike': strike,
            'expiry': expiry
        }

    # Fallback: treat as stock
    return {'ticker': instrument, 'type': 'stock'}


def estimate_stock_price_from_options(
    df: pd.DataFrame, positions: List[Position]
) -> dict[str, float]:
    """Estimate stock prices for option-only tickers based on option prices.

    Uses option prices and strikes to estimate stock price. For calls: if option
    has significant value, stock is likely above strike. For puts: if option has
    significant value, stock is likely below strike. This is a rough estimate.
    """
    estimated_prices = {}

    # Group positions by ticker
    ticker_options = {}
    for pos in positions:
        if pos.position_type != 'stock' and pos.strike:
            if pos.ticker not in ticker_options:
                ticker_options[pos.ticker] = []
            ticker_options[pos.ticker].append(pos)

    # Estimate price for each ticker with only options
    for ticker, opts in ticker_options.items():
        if not opts:
            continue

        estimates = []
        strikes = [o.strike for o in opts]

        # Get option prices from CSV and estimate stock price
        for opt in opts:
            # Find matching row in CSV
            for _, row in df.iterrows():
                instrument = str(row.get('Financial Instrument', '')).strip()
                if ticker in instrument and ('CALL' in instrument or 'PUT' in instrument):
                    parsed = parse_financial_instrument(instrument)
                    if (parsed.get('ticker') == ticker and
                            abs(parsed.get('strike', 0) - opt.strike) < 0.01 and
                            parsed.get('type') == opt.position_type):
                        option_price = clean_number(row.get('Last', 0))
                        if option_price > 0:
                            # Rough estimate: assume some intrinsic value
                            # For calls: stock likely >= strike + some of option price
                            # For puts: stock likely <= strike - some of option price
                            # This is approximate but better than midpoint of strikes
                            if opt.position_type == 'call':
                                # If call has value, stock is likely above strike
                                estimates.append(opt.strike + option_price)
                            else:  # put
                                # If put has value, stock is likely below strike
                                estimates.append(opt.strike - option_price)
                        break

        if estimates:
            # Use average of estimates
            estimated_prices[ticker] = sum(estimates) / len(estimates)
        else:
            # Fallback: use center of strike range (not ideal, but needed for plotting)
            estimated_prices[ticker] = (min(strikes) + max(strikes)) / 2

    return estimated_prices


def load_positions(
    csv_path: str
) -> Tuple[List[Position], dict[str, float], dict[str, bool]]:
    """Load positions from Interactive Brokers TWS CSV export.

    Returns:
        Tuple of (positions list, stock_prices dict, is_estimated dict)
    """
    df = pd.read_csv(csv_path)
    positions = []
    stock_prices = {}
    is_estimated = {}  # Track which prices are estimated vs real

    for _, row in df.iterrows():
        instrument = row.get('Financial Instrument', '')
        if pd.isna(instrument) or str(instrument).strip() == '':
            continue

        parsed = parse_financial_instrument(str(instrument))
        position_qty = clean_number(row.get('Position', 0))

        if position_qty == 0:
            continue

        last_price = clean_number(row.get('Last', 0))
        cost_basis_total = clean_number(row.get('Cost Basis', 0))

        if parsed['type'] == 'stock':
            # For stocks, cost basis is total, need per share
            if position_qty != 0:
                cost_basis_per_share = cost_basis_total / abs(position_qty)
            else:
                cost_basis_per_share = 0
            stock_prices[parsed['ticker']] = last_price
            is_estimated[parsed['ticker']] = False  # Real stock price

            positions.append(Position(
                ticker=parsed['ticker'],
                position_type='stock',
                qty=int(position_qty),
                cost_basis=cost_basis_per_share
            ))
        else:
            # For options, cost basis is total, need per contract, then per share
            # Position is in contracts, cost basis is total
            if position_qty != 0:
                cost_basis_per_contract = cost_basis_total / abs(position_qty)
            else:
                cost_basis_per_contract = 0
            # Cost per share of option = cost per contract / 100
            cost_basis_per_share = cost_basis_per_contract / 100.0

            # Check for underlying stock price column
            if 'Underlying Price' in row and not pd.isna(row['Underlying Price']):
                underlying_price = clean_number(row['Underlying Price'])
                if underlying_price > 0:
                    if parsed['ticker'] not in stock_prices:
                        stock_prices[parsed['ticker']] = underlying_price
                        # Real price from column
                        is_estimated[parsed['ticker']] = False

            positions.append(Position(
                ticker=parsed['ticker'],
                position_type=parsed['type'],
                qty=int(position_qty),
                strike=parsed['strike'],
                cost_basis=cost_basis_per_share,
                expiry=parsed.get('expiry')
            ))

    # Estimate stock prices for option-only tickers
    estimated_prices = estimate_stock_price_from_options(df, positions)
    for ticker, price in estimated_prices.items():
        if ticker not in stock_prices:
            stock_prices[ticker] = price
            is_estimated[ticker] = True  # Estimated price

    return positions, stock_prices, is_estimated


def calculate_pnl(positions: List[Position], prices: np.ndarray) -> np.ndarray:
    """Calculate total P&L across all positions for a range of prices.

    For options:
    - Long positions (qty > 0): cost_basis is positive (premium paid)
      P&L = (intrinsic - cost_basis) * qty * 100
    - Short positions (qty < 0): cost_basis is negative (premium received)
      P&L = (premium_received - intrinsic_paid) * |qty| * 100
      = (-cost_basis - intrinsic) * |qty| * 100
      = (cost_basis + intrinsic) * qty * 100  (since qty < 0, |qty| = -qty)
    """
    total_pnl = np.zeros_like(prices)
    for pos in positions:
        if pos.position_type == 'stock':
            total_pnl += (prices - pos.cost_basis) * pos.qty
        elif pos.position_type == 'call':
            intrinsic = np.maximum(0, prices - pos.strike)
            if pos.qty > 0:  # Long position
                total_pnl += (intrinsic - pos.cost_basis) * pos.qty * 100
            else:  # Short position
                # Premium received is -cost_basis, intrinsic paid is intrinsic
                total_pnl += (pos.cost_basis + intrinsic) * pos.qty * 100
        else:  # put
            intrinsic = np.maximum(0, pos.strike - prices)
            if pos.qty > 0:  # Long position
                total_pnl += (intrinsic - pos.cost_basis) * pos.qty * 100
            else:  # Short position
                # Premium received is -cost_basis, intrinsic paid is intrinsic
                total_pnl += (pos.cost_basis + intrinsic) * pos.qty * 100
    return total_pnl


def get_price_range(positions: List[Position], current_price: float) -> np.ndarray:
    """Determine appropriate price range for plotting."""
    strikes = [p.strike for p in positions if p.strike]
    if strikes:
        low = min(min(strikes) * 0.8, current_price * 0.7)
        high = max(max(strikes) * 1.2, current_price * 1.3)
    else:
        low, high = current_price * 0.7, current_price * 1.3
    return np.linspace(low, high, 200)


def plot_ticker_pnl(
    positions: List[Position], ticker: str, current_price: float,
    is_estimated: bool, ax
):
    """Plot P&L curve for a single ticker.

    Shows P&L at the latest expiration date. Earlier-expiring options
    are assumed to be settled at their intrinsic value at that date.
    """
    ticker_positions = [p for p in positions if p.ticker == ticker]
    if not ticker_positions:
        return

    # Find the latest expiration date
    expiries = [p.expiry for p in ticker_positions if p.expiry]
    latest_expiry = max(expiries) if expiries else None

    prices = get_price_range(ticker_positions, current_price)
    pnl = calculate_pnl(ticker_positions, prices)

    # Calculate y-axis range: ensure it spans from 10% below lowest strike to 10% above highest strike
    # while also including all P&L values
    pnl_min, pnl_max = min(pnl), max(pnl)
    strikes = [p.strike for p in ticker_positions if p.strike and p.position_type in [
        'call', 'put']]

    if strikes:
        # Calculate strike-based range (10% below lowest, 10% above highest)
        strike_min = min(strikes) * 0.9
        strike_max = max(strikes) * 1.1

        # The y-axis shows P&L (dollars), not stock prices, so we need to ensure
        # the range includes both the P&L values AND spans at least the strike range
        # Take the union: y_min should be the minimum of (P&L_min, strike_min)
        # and y_max should be the maximum of (P&L_max, strike_max)
        y_min = min(pnl_min, strike_min)
        y_max = max(pnl_max, strike_max)

        # Add small padding for better visibility
        y_padding = (y_max - y_min) * 0.05
        y_min -= y_padding
        y_max += y_padding
    else:
        # Fallback to P&L-based range if no strikes found
        y_padding = max(abs(pnl_min), abs(pnl_max)) * 0.15
        y_min = pnl_min - y_padding
        y_max = pnl_max + y_padding

    # Add background colors (will be clipped to plot area automatically)
    ax.axhspan(0, y_max, alpha=0.2, color='lightgreen', zorder=0)
    ax.axhspan(y_min, 0, alpha=0.2, color='lightcoral', zorder=0)

    ax.plot(prices, pnl, 'b-', linewidth=2,
            label='P&L at Expiration', zorder=2)
    ax.axhline(y=0, color='gray', linestyle='-', linewidth=0.5, zorder=1)
    if is_estimated:
        ax.axvline(x=current_price, color='orange', linestyle=':', linewidth=1.5,
                   label=f'Est. Price: ${current_price:.2f}')
    else:
        ax.axvline(x=current_price, color='orange', linestyle='--', linewidth=1.5,
                   label=f'Current: ${current_price:.2f}')

    # Format expiration date for display
    def format_expiry(expiry_str):
        if not expiry_str:
            return None
        # Return as-is if already in YYYY-MM-DD format, otherwise try to parse
        if expiry_str and len(expiry_str) == 10 and expiry_str[4] == '-' and expiry_str[7] == '-':
            return expiry_str
        try:
            from datetime import datetime
            dt = datetime.strptime(expiry_str, '%Y-%m-%d')
            return dt.strftime('%Y-%m-%d')
        except:
            return expiry_str

    for pos in ticker_positions:
        if pos.strike:
            color = 'green' if pos.position_type == 'call' else 'red'
            ax.axvline(x=pos.strike, color=color,
                       linestyle=':' if pos.qty < 0 else '-', alpha=0.5)

            # Add expiration date label if available
            if pos.expiry:
                expiry_label = format_expiry(pos.expiry)
                if expiry_label:
                    # Position text to the right of the strike line, vertically centered
                    # Use a small offset from the strike price
                    x_offset = (max(prices) - min(prices)) * \
                        0.01  # 1% of price range
                    y_pos = (y_min + y_max) / 2  # Center vertically
                    ax.text(pos.strike + x_offset, y_pos, expiry_label,
                            rotation=90, ha='left', va='center',
                            fontsize=7, color=color, alpha=0.7)

    current_pnl = calculate_pnl(ticker_positions, np.array([current_price]))[0]
    ax.plot(current_price, current_pnl, 'o', color='orange', markersize=10)

    # Set y-axis limits to ensure labels are visible
    ax.set_ylim(y_min, y_max)

    ax.set_xlabel('Stock Price ($)')
    ax.set_ylabel('Profit/Loss ($)')
    if latest_expiry:
        ax.set_title(f'{ticker} - P&L at Latest Expiration ({latest_expiry})')
    else:
        ax.set_title(f'{ticker} - P&L at Expiration')
    ax.legend()
    ax.grid(True, alpha=0.3)
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'${x:,.0f}'))

    # Position summary
    summary = []
    for pos in ticker_positions:
        if pos.position_type == 'stock':
            summary.append(f"+{pos.qty} shares @ ${pos.cost_basis:.2f}")
        else:
            sign = '+' if pos.qty > 0 else ''
            opt = 'C' if pos.position_type == 'call' else 'P'
            if pos.dte:
                dte_str = f" ({pos.dte} DTE)"
            elif pos.expiry:
                dte_str = f" ({pos.expiry})"
            else:
                dte_str = ""
            summary.append(f"{sign}{pos.qty} ${pos.strike:.1f}{opt}{dte_str}")

    ax.text(0.02, 0.98, '\n'.join(summary), transform=ax.transAxes, fontsize=9,
            verticalalignment='top', fontfamily='monospace',
            bbox={"boxstyle": 'round', "facecolor": 'wheat', "alpha": 0.5})


def main(csv_path: str, output_path: str = 'payoffdiagrams.png'):
    """Generate combined P&L chart for all tickers."""
    positions, stock_prices, is_estimated = load_positions(csv_path)

    tickers = sorted(
        set(p.ticker for p in positions if p.ticker in stock_prices))
    n = len(tickers)
    if n == 0:
        print("No valid positions found with stock prices.")
        return

    cols = min(3, n)
    rows = (n + cols - 1) // cols

    _, axes = plt.subplots(rows, cols, figsize=(6*cols, 5*rows))
    axes = [axes] if n == 1 else axes.flatten()

    for idx, ticker in enumerate(tickers):
        plot_ticker_pnl(
            positions, ticker, stock_prices[ticker],
            is_estimated.get(ticker, False), axes[idx]
        )

    for i in range(n, len(axes)):
        axes[i].set_visible(False)

    plt.tight_layout()
    plt.savefig(output_path, dpi=150)
    print(f"Saved {output_path}")


if __name__ == '__main__':
    csv_path = sys.argv[1] if len(sys.argv) > 1 else 'positions.csv'
    output_path = sys.argv[2] if len(sys.argv) > 2 else 'all_positions_pnl.png'
    main(csv_path, output_path)
