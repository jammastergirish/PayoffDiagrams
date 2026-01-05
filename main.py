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
    qty: float
    strike: Optional[float] = None
    cost_basis: Optional[float] = None
    expiry: Optional[str] = None
    dte: Optional[int] = None


def clean_number(value) -> float:
    """Clean number strings that may have commas, quotes, or other formatting."""
    if pd.isna(value):
        return 0.0
    if isinstance(value, (int, float, np.number)):
        return float(value)

    cleaned = str(value).strip()
    if cleaned == '':
        return 0.0

    # Handle negatives like (123.45)
    is_paren_negative = cleaned.startswith('(') and cleaned.endswith(')')
    if is_paren_negative:
        cleaned = cleaned[1:-1].strip()

    # Remove commas, quotes, and common formatting
    cleaned = cleaned.replace(',', '').replace("'", '').replace('"', '').strip()
    # Strip option side prefixes like C5.16 or P0.26
    cleaned = re.sub(r'^[CP](?=\d|\.)', '', cleaned, flags=re.IGNORECASE)
    # Strip currency symbol
    cleaned = re.sub(r'^\$', '', cleaned)

    if is_paren_negative and not cleaned.startswith('-'):
        cleaned = '-' + cleaned
    try:
        return float(cleaned)
    except (ValueError, TypeError):
        return 0.0


def format_qty(qty: float) -> str:
    """Format quantities without trailing .0, preserving fractional shares."""
    qty_abs = abs(qty)
    if qty_abs.is_integer():
        return str(int(qty_abs))
    return f"{qty_abs:.4f}".rstrip('0').rstrip('.')


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
        return {'ticker': instrument.upper(), 'type': 'stock'}

    # Parse option format: "IREN Jan30'26 40 CALL" or "NVDA Jun18'26 200 CALL"
    # Pattern: TICKER MonthDD'YY Strike CALL/PUT
    # Also handles formats like "AAAU Mar20'26 39 PUT" or
    # "MU Dec26'25 272.5 CALL"
    pattern = (r'^([A-Z0-9.-]+)\s+([A-Za-z]{3})(\d{1,2})\'(\d{2})\s+'
               r'(\d+(?:\.\d+)?)\s+(CALL|PUT)$')
    match = re.match(pattern, instrument, re.IGNORECASE)
    if match:
        ticker = match.group(1).upper()
        month_str = match.group(2).title()
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
    return {'ticker': instrument.upper(), 'type': 'stock'}


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
                cost_basis_per_share = abs(cost_basis_total) / abs(position_qty)
            else:
                cost_basis_per_share = 0
            stock_prices[parsed['ticker']] = last_price
            is_estimated[parsed['ticker']] = False  # Real stock price

            positions.append(Position(
                ticker=parsed['ticker'],
                position_type='stock',
                qty=position_qty,
                cost_basis=cost_basis_per_share
            ))
        else:
            # For options, cost basis is total, need per contract, then per share
            # Position is in contracts, cost basis is total
            if position_qty != 0:
                cost_basis_per_contract = abs(cost_basis_total) / abs(position_qty)
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
                qty=position_qty,
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


def get_breakevens(prices: np.ndarray, pnl: np.ndarray) -> List[float]:
    """Find price points where P&L crosses zero."""
    if len(prices) != len(pnl):
        return []
    
    # Sign changes indicate zero crossings
    # use signbit to handle -0.0 correctly and detecting crossing
    # efficiently
    sign_changes = np.where(np.diff(np.signbit(pnl)))[0]
    breakevens = []
    
    for idx in sign_changes:
        # Linear interpolation to find more precise zero crossing
        p1, p2 = prices[idx], prices[idx+1]
        v1, v2 = pnl[idx], pnl[idx+1]
        
        if v1 == v2: # Avoid division by zero
            continue
            
        # x = x1 + (0 - y1) * (x2 - x1) / (y2 - y1)
        zero_price = p1 + (0 - v1) * (p2 - p1) / (v2 - v1)
        breakevens.append(zero_price)
        
    return breakevens


def analyze_risk_reward(pnl: np.ndarray) -> dict:
    """Analyze P&L array for max profit, max loss, and risk/reward ratio."""
    max_profit = np.max(pnl)
    max_loss = np.min(pnl)
    
    return {
        'max_profit': max_profit,
        'max_loss': max_loss,
    }


def calculate_pnl(positions: List[Position], prices: np.ndarray) -> np.ndarray:
    """Calculate total P&L across all positions for a range of prices.

    For options, we use the universal P&L formula:
    P&L = (Exit_Price - Entry_Price) * Qty
    
    Where:
    - Exit_Price = Intrinsic Value at expiry
    - Entry_Price = Cost Basis (always positive magnitude)
    
    This works for:
    - Long (Qty > 0): (Intrinsic - Cost) * Qty
    - Short (Qty < 0): (Intrinsic - Cost) * Qty  [equivalent to (Cost - Intrinsic) * |Qty|]
    """
    total_pnl = np.zeros_like(prices)
    for pos in positions:
        if pos.position_type == 'stock':
            total_pnl += (prices - pos.cost_basis) * pos.qty
        elif pos.position_type == 'call':
            intrinsic = np.maximum(0, prices - pos.strike)
            # Universal formula works for both long (qty>0) and short (qty<0)
            # P&L = (Exit_Price - Entry_Price) * Qty
            # Exit = Intrinsic, Entry = Cost Basis
            total_pnl += (intrinsic - pos.cost_basis) * pos.qty * 100
        else:  # put
            intrinsic = np.maximum(0, pos.strike - prices)
            total_pnl += (intrinsic - pos.cost_basis) * pos.qty * 100
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


def calculate_unrealized_pnl_per_ticker(
    csv_path: str, positions: List[Position], stock_prices: dict[str, float]
) -> dict[str, float]:
    """Calculate unrealized P&L per ticker from CSV.

    Sums all instruments per ticker using the CSV's Unrealized P&L values.
    """
    df = pd.read_csv(csv_path)
    unrealized_pnl = {}

    # Group positions by ticker
    ticker_positions_map = {}
    for pos in positions:
        if pos.ticker not in ticker_positions_map:
            ticker_positions_map[pos.ticker] = []
        ticker_positions_map[pos.ticker].append(pos)

    for ticker, ticker_positions in ticker_positions_map.items():
        if ticker not in stock_prices:
            continue

        total_pnl = 0.0

        # Iterate through positions to ensure we match each one exactly
        for pos in ticker_positions:
            # Find matching CSV row for this position
            for _, row in df.iterrows():
                instrument = row.get('Financial Instrument', '')
                if pd.isna(instrument):
                    continue

                parsed = parse_financial_instrument(str(instrument))

                # Match by ticker
                if parsed['ticker'] != ticker:
                    continue

                # For stocks, match by type
                if pos.position_type == 'stock' and parsed['type'] == 'stock':
                    pnl = clean_number(row.get('Unrealized P&L', 0))
                    total_pnl += pnl
                    break  # Found match, move to next position

                # For options, match by type, strike, and expiry
                if (pos.position_type != 'stock' and
                    parsed['type'] == pos.position_type and
                    parsed.get('strike') is not None and
                    pos.strike is not None and
                        abs(parsed['strike'] - pos.strike) < 0.01):
                    # Check expiry if available
                    if pos.expiry and parsed.get('expiry'):
                        if pos.expiry != parsed['expiry']:
                            continue
                    # Match found
                    pnl = clean_number(row.get('Unrealized P&L', 0))
                    total_pnl += pnl
                    break  # Found match, move to next position

        unrealized_pnl[ticker] = total_pnl

    return unrealized_pnl


def plot_ticker_pnl(
    positions: List[Position], ticker: str, current_price: float,
    is_estimated: bool, ax, unrealized_pnl: Optional[float] = None
):
    """Plot P&L curve for a single ticker.

    Shows P&L at each expiration date for options on that ticker.
    """
    ticker_positions = [p for p in positions if p.ticker == ticker]
    if not ticker_positions:
        return

    stock_positions = [p for p in ticker_positions if p.position_type == 'stock']
    option_positions = [
        p for p in ticker_positions if p.position_type in ('call', 'put')
    ]
    expiries = sorted({p.expiry for p in option_positions if p.expiry})
    unknown_expiry_positions = [p for p in option_positions if not p.expiry]

    prices = get_price_range(ticker_positions, current_price)

    # Format expiration date for display
    def format_expiry(expiry_str):
        if not expiry_str:
            return "Unknown"
        # Return as-is if already in YYYY-MM-DD format, otherwise try to parse
        if expiry_str and len(expiry_str) == 10 and expiry_str[4] == '-' and expiry_str[7] == '-':
            return expiry_str
        try:
            from datetime import datetime
            dt = datetime.strptime(expiry_str, '%Y-%m-%d')
            return dt.strftime('%Y-%m-%d')
        except:
            return expiry_str

    curves = []
    if expiries:
        for expiry in expiries:
            curve_positions = stock_positions + unknown_expiry_positions + [
                p for p in option_positions if p.expiry == expiry
            ]
            pnl = calculate_pnl(curve_positions, prices)
            curves.append((f"Expiry {format_expiry(expiry)}", pnl))
    else:
        pnl = calculate_pnl(ticker_positions, prices)
        label = 'P&L at Expiration'
        if unknown_expiry_positions:
            label = 'P&L at Expiration (unknown)'
        curves.append((label, pnl))

    pnl_min, pnl_max = min(np.min(pnl) for _, pnl in curves), max(np.max(pnl) for _, pnl in curves)
    
    # Calculate stats using the total P&L curve (sum of all curves at same expiry if single, else use first one)
    # For simplicity, if multiple expiries, we analyze the curve for the LATEST expiry
    latest_expiry_curve = curves[-1][1]
    breakevens = get_breakevens(prices, latest_expiry_curve)
    risk_reward = analyze_risk_reward(latest_expiry_curve)
    
    y_min = min(pnl_min, 0.0)
    y_max = max(pnl_max, 0.0)
    span = y_max - y_min
    if span == 0:
        span = max(abs(y_min), 1.0)
    y_padding = span * 0.1 # Increased padding
    y_min -= y_padding
    y_max += y_padding

    # Add background colors (will be clipped to plot area automatically)
    ax.axhspan(0, y_max, alpha=0.1, color='green', zorder=0)
    ax.axhspan(y_min, 0, alpha=0.1, color='red', zorder=0)

    if len(curves) == 1:
        label, pnl = curves[0]
        ax.plot(prices, pnl, 'b-', linewidth=2, label=label, zorder=2)
    else:
        cmap = plt.get_cmap('tab10')
        for idx, (label, pnl) in enumerate(curves):
            ax.plot(prices, pnl, linewidth=2, color=cmap(idx % cmap.N), 
                    label=label, zorder=2)

    ax.axhline(y=0, color='black', linestyle='-', linewidth=0.8, zorder=1)
    
    # Draw Breakeven Lines
    for be in breakevens:
        ax.axvline(x=be, color='black', linestyle='-.', linewidth=1, alpha=0.7)
        ax.text(be, y_max*0.95, f'BE\n{be:.1f}', ha='center', va='top', fontsize=8, fontweight='bold',
                bbox=dict(facecolor='white', alpha=0.8, edgecolor='none', pad=1))
        
    if is_estimated:
        ax.axvline(x=current_price, color='orange', linestyle=':', linewidth=1.5,
                   label=f'Est: ${current_price:.2f}')
    else:
        ax.axvline(x=current_price, color='darkorange', linestyle='--', linewidth=1.5,
                   label=f'Now: ${current_price:.2f}')

    for pos in ticker_positions:
        if pos.strike:
            color = 'darkgreen' if pos.position_type == 'call' else 'darkred'
            ax.axvline(x=pos.strike, color=color, linestyle=':', alpha=0.3)
            
            if pos.expiry:
                expiry_label = format_expiry(pos.expiry)
                if expiry_label:
                    # Only label strikes if they are far enough apart or just label unique ones
                    pass 

    current_pnl = calculate_pnl(ticker_positions, np.array([current_price]))[0]
    if unrealized_pnl is not None:
        current_pnl = unrealized_pnl
    ax.plot(current_price, current_pnl, 'D', color='darkorange', markersize=6, zorder=4)

    # Set y-axis limits to ensure labels are visible
    ax.set_ylim(y_min, y_max)
    
    ax.set_xlabel('Stock Price ($)')
    ax.set_ylabel('Profit/Loss ($)')
    
    title = f'{ticker} Analysis'
    if len(expiries) == 1:
        title += f' (Exp: {format_expiry(expiries[0])})'
    ax.set_title(title, fontweight='bold')
    
    ax.legend(loc='upper left', fontsize=8)
    ax.grid(True, alpha=0.3, linestyle='--')
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'${x:,.0f}'))

    # Position summary box (Top Left)
    # summary = [] ... (omitted, existing logic is fine but re-implementing for placement)
    # Actually let's use the new location: Bottom Left for positions, Top Right for Stats
    
    # Stats Box (Top Right)
    max_p_str = f"${risk_reward['max_profit']:,.0f}"
    max_l_str = f"${risk_reward['max_loss']:,.0f}"
    
    stats_text = [
        f"Max Profit: {max_p_str}",
        f"Max Loss:   {max_l_str}",
    ]
    if breakevens:
        stats_text.append(f"Breakeven:  ${breakevens[0]:.1f}" + (f" & ${breakevens[1]:.1f}" if len(breakevens) > 1 else ""))
        
    ax.text(0.98, 0.98, '\n'.join(stats_text), transform=ax.transAxes, fontsize=9,
            verticalalignment='top', horizontalalignment='right', family='monospace',
            bbox=dict(boxstyle='round', facecolor='white', alpha=0.9, edgecolor='gray'))
            
    # Position details (Bottom Left)
    pos_text = []
    for pos in ticker_positions:
        qty_str = format_qty(pos.qty)
        sign = '+' if pos.qty > 0 else ''
        if pos.position_type == 'stock':
            pos_text.append(f"{sign}{qty_str} Stock @ {pos.cost_basis:.1f}")
        else:
            opt = 'C' if pos.position_type == 'call' else 'P'
            pos_text.append(f"{sign}{qty_str} {pos.strike:.1f}{opt} @ {pos.cost_basis:.2f}")
            
    ax.text(0.02, 0.02, '\n'.join(pos_text), transform=ax.transAxes, fontsize=8,
            verticalalignment='bottom', horizontalalignment='left', family='monospace',
            bbox=dict(boxstyle='round', facecolor='white', alpha=0.8, edgecolor='lightgray'))


def plot_consolidated_pnl(
    positions: List[Position], stock_prices: dict[str, float],
    is_estimated: dict[str, bool], output_path: str = 'consolidated.png'
):
    """Plot consolidated P&L chart with all tickers normalized to percentage change.

    Each ticker's P&L curve is normalized to its own percentage change from current price,
    allowing comparison of sensitivities across different tickers.
    """
    tickers = sorted(
        set(p.ticker for p in positions if p.ticker in stock_prices))

    if len(tickers) == 0:
        print("No valid positions found with stock prices.")
        return

    _, ax = plt.subplots(figsize=(12, 8))

    # Define percentage range (e.g., -50% to +50%)
    pct_range = np.linspace(-50, 50, 200)

    # Use a colormap to assign different colors to each ticker
    cmap = plt.get_cmap('tab20')
    colors = cmap(np.linspace(0, 1, len(tickers)))

    # Track overall P&L range for y-axis
    all_pnl_min = float('inf')
    all_pnl_max = float('-inf')

    for idx, ticker in enumerate(tickers):
        ticker_positions = [p for p in positions if p.ticker == ticker]
        if not ticker_positions:
            continue

        current_price = stock_prices[ticker]

        # Convert percentage change to actual prices for this ticker
        prices = current_price * (1 + pct_range / 100.0)

        # Calculate P&L for this ticker
        pnl = calculate_pnl(ticker_positions, prices)

        # Update overall P&L range
        pnl_min = np.min(pnl)
        pnl_max = np.max(pnl)
        all_pnl_min = min(all_pnl_min, pnl_min)
        all_pnl_max = max(all_pnl_max, pnl_max)

        # Plot this ticker's curve
        label = ticker
        if is_estimated.get(ticker, False):
            label += " (est.)"

        ax.plot(pct_range, pnl, linewidth=2,
                color=colors[idx], label=label, zorder=2)

        # Mark current point (0% change)
        current_pnl = calculate_pnl(
            ticker_positions, np.array([current_price]))[0]
        ax.plot(0, current_pnl, 'o', color=colors[idx], markersize=8, zorder=3)

    # Add background colors
    ax.axhspan(0, all_pnl_max, alpha=0.2, color='lightgreen', zorder=0)
    ax.axhspan(all_pnl_min, 0, alpha=0.2, color='lightcoral', zorder=0)

    # Add zero lines
    ax.axhline(y=0, color='gray', linestyle='-', linewidth=0.5, zorder=1)
    ax.axvline(x=0, color='gray', linestyle='--', linewidth=0.5, zorder=1)

    # Set axis labels and title
    ax.set_xlabel('Percentage Change from Current Price (%)', fontsize=12)
    ax.set_ylabel('Profit/Loss ($)', fontsize=12)
    title = 'Consolidated P&L - All Tickers (Normalized to % Change)'
    ax.set_title(title, fontsize=14, fontweight='bold')

    # Format axes
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'${x:,.0f}'))
    ax.xaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'{x:.0f}%'))

    # Set y-axis limits with padding
    y_padding = (all_pnl_max - all_pnl_min) * 0.05
    ax.set_ylim(all_pnl_min - y_padding, all_pnl_max + y_padding)

    # Add legend
    ax.legend(loc='best', fontsize=9, framealpha=0.9)
    ax.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig(output_path, dpi=150)
    print(f"Saved {output_path}")


def main(csv_path: str, output_path: str = 'payoffdiagrams.png'):
    """Generate combined P&L chart for all tickers."""
    positions, stock_prices, is_estimated = load_positions(csv_path)

    # Calculate unrealized P&L per ticker
    unrealized_pnl = calculate_unrealized_pnl_per_ticker(
        csv_path, positions, stock_prices
    )

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
            is_estimated.get(ticker, False), axes[idx],
            unrealized_pnl.get(ticker)
        )

    for i in range(n, len(axes)):
        axes[i].set_visible(False)

    plt.tight_layout()
    plt.savefig(output_path, dpi=150)
    print(f"Saved {output_path}")

    # Also generate consolidated view
    plot_consolidated_pnl(positions, stock_prices,
                          is_estimated, 'consolidated.png')


if __name__ == '__main__':
    csv_path = sys.argv[1] if len(sys.argv) > 1 else 'positions.csv'
    output_path = sys.argv[2] if len(sys.argv) > 2 else 'all_positions_pnl.png'
    main(csv_path, output_path)
