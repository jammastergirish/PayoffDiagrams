"""Common utility functions."""

import math
from typing import Any, Optional, Dict, List
from datetime import datetime, timedelta


def safe_float(val: Any, default: float = 0.0) -> float:
    """Safely convert value to float, handling None, NaN, and Inf."""
    if val is None:
        return default
    try:
        f_val = float(val)
        if math.isnan(f_val) or math.isinf(f_val):
            return default
        return f_val
    except (TypeError, ValueError):
        return default


def safe_int(val: Any, default: int = 0) -> int:
    """Safely convert value to int."""
    if val is None:
        return default
    try:
        return int(val)
    except (TypeError, ValueError):
        return default


def format_error_response(error: str, **kwargs) -> Dict[str, Any]:
    """Format a standardized error response."""
    response = {"error": error}
    response.update(kwargs)
    return response


def format_success_response(success: bool, data: Any = None, **kwargs) -> Dict[str, Any]:
    """Format a standardized success response."""
    response = {"success": success}
    if data is not None:
        response["data"] = data
    response.update(kwargs)
    return response


def get_date_range(days_back: int = 30) -> tuple[str, str]:
    """Get date range for historical data queries."""
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days_back)
    return start_date.strftime("%Y-%m-%d"), end_date.strftime("%Y-%m-%d")


def timeframe_to_days(timeframe: str) -> int:
    """Convert timeframe string to number of days."""
    timeframes = {
        "1D": 1,
        "1W": 7,
        "1M": 30,
        "3M": 90,
        "6M": 180,
        "1Y": 365,
        "5Y": 1825
    }
    return timeframes.get(timeframe, 30)


def validate_symbol(symbol: str) -> str:
    """Validate and normalize stock symbol."""
    if not symbol:
        raise ValueError("Symbol cannot be empty")

    # Remove common invalid characters
    cleaned = symbol.upper().strip()

    # Basic validation
    if not cleaned.replace('-', '').replace('.', '').isalnum():
        raise ValueError(f"Invalid symbol: {symbol}")

    return cleaned


def calculate_position_value(position: Dict[str, Any]) -> float:
    """Calculate the market value of a position."""
    if position.get("position_type") == "stock":
        return safe_float(position.get("qty", 0)) * safe_float(position.get("current_price", 0))
    else:
        # Options: qty * 100 * mark price
        return safe_float(position.get("qty", 0)) * 100 * safe_float(position.get("current_price", 0))


def group_positions_by_ticker(positions: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """Group positions by underlying ticker."""
    grouped = {}
    for pos in positions:
        ticker = pos.get("ticker", "UNKNOWN")
        if ticker not in grouped:
            grouped[ticker] = []
        grouped[ticker].append(pos)
    return grouped