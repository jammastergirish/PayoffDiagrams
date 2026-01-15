"""Common utility functions."""

import math
import traceback
from typing import Any, Optional, Dict, List, Callable
from datetime import datetime, timedelta
from functools import wraps


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


# ======================
# Error Handling Utilities
# ======================

def with_error_handling(
    operation_name: str,
    module_name: str = "API",
    default_return: Optional[Any] = None,
    include_traceback: bool = False
):
    """
    Decorator for standardized error handling.

    Args:
        operation_name: Description of the operation for error messages
        module_name: Name of the module for error logging
        default_return: Default return value on error
        include_traceback: Whether to print traceback on error
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            try:
                result = func(*args, **kwargs)
                return result
            except Exception as e:
                error_msg = f"ERROR [{module_name}]: Failed to {operation_name}"

                # Include symbol/identifier in error message if available
                if args and hasattr(args[0], '__self__'):
                    # Method call - look for symbol in args
                    func_args = args[1:] if len(args) > 1 else []
                else:
                    # Function call
                    func_args = args

                if func_args:
                    # Try to find symbol/identifier in first argument
                    first_arg = func_args[0]
                    if isinstance(first_arg, str):
                        error_msg += f" for {first_arg}"

                error_msg += f": {e}"
                print(error_msg)

                if include_traceback:
                    traceback.print_exc()

                # Return appropriate error response based on default_return type
                if default_return is None:
                    return format_error_response(str(e))
                elif isinstance(default_return, dict):
                    result = default_return.copy()
                    result["error"] = str(e)
                    return result
                else:
                    return default_return

        return wrapper
    return decorator


def handle_api_error(
    operation_name: str,
    symbol: Optional[str] = None,
    module_name: str = "API",
    include_traceback: bool = False,
    additional_data: Optional[Dict[str, Any]] = None
) -> Callable:
    """
    Context manager and decorator for API error handling with symbol-aware responses.

    Args:
        operation_name: Description of the operation
        symbol: Symbol being processed (for error response)
        module_name: Module name for logging
        include_traceback: Whether to print full traceback
        additional_data: Additional data to include in error response
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs) -> Dict[str, Any]:
            try:
                result = func(*args, **kwargs)
                return result
            except Exception as e:
                # Extract symbol from args if not provided
                actual_symbol = symbol
                if actual_symbol is None and args:
                    # Try to get symbol from first argument
                    first_arg = args[1] if len(args) > 1 and hasattr(args[0], '__self__') else (args[0] if args else None)
                    if isinstance(first_arg, str):
                        actual_symbol = first_arg.upper()

                error_msg = f"ERROR [{module_name}]: Failed to {operation_name}"
                if actual_symbol:
                    error_msg += f" for {actual_symbol}"
                error_msg += f": {e}"
                print(error_msg)

                if include_traceback:
                    traceback.print_exc()

                # Create standardized error response
                response = {}
                if actual_symbol:
                    response["symbol"] = actual_symbol
                response["error"] = str(e)

                if additional_data:
                    response.update(additional_data)

                return response

        return wrapper
    return decorator


def safe_execute(
    func: Callable,
    *args,
    operation_name: str = "operation",
    default_return: Any = None,
    log_errors: bool = True,
    **kwargs
) -> Any:
    """
    Safely execute a function with error handling.

    Args:
        func: Function to execute
        *args: Arguments for the function
        operation_name: Name of operation for error logging
        default_return: Return value if function fails
        log_errors: Whether to log errors
        **kwargs: Keyword arguments for the function
    """
    try:
        return func(*args, **kwargs)
    except Exception as e:
        if log_errors:
            print(f"ERROR: Failed to {operation_name}: {e}")
        return default_return