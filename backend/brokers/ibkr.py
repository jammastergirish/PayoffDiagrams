"""Interactive Brokers implementation of BrokerInterface."""

from typing import List, Dict, Any, Optional
from .base import BrokerInterface
from ..common.models import Position, AccountSummary, TradeOrder, OptionOrder
from ..common.utils import safe_float, format_error_response, format_success_response
from ..ib_client import ib_client  # Use existing IB client


class IBKRBroker(BrokerInterface):
    """Interactive Brokers broker implementation."""

    def __init__(self):
        self.client = ib_client

    async def connect(self) -> bool:
        """Connect to IBKR."""
        await self.client.connect()
        return self.client.connected

    def disconnect(self) -> None:
        """Disconnect from IBKR."""
        self.client.disconnect()

    def is_connected(self) -> bool:
        """Check if connected to IBKR."""
        return self.client.ib.isConnected()

    def get_positions(self) -> List[Position]:
        """Get all current positions from IBKR."""
        if not self.is_connected():
            return []

        ib_positions = self.client.get_positions()

        # Convert IBKR positions to common Position model
        positions = []
        for pos_dict in ib_positions:
            position = Position(
                ticker=pos_dict.get("ticker"),
                position_type=pos_dict.get("position_type"),
                qty=pos_dict.get("qty"),
                strike=pos_dict.get("strike"),
                expiry=pos_dict.get("expiry"),
                dte=pos_dict.get("dte"),
                cost_basis=pos_dict.get("cost_basis"),
                unrealized_pnl=pos_dict.get("unrealized_pnl"),
                current_price=pos_dict.get("current_price"),
                underlying_price=pos_dict.get("underlying_price"),
                delta=pos_dict.get("delta"),
                gamma=pos_dict.get("gamma"),
                theta=pos_dict.get("theta"),
                vega=pos_dict.get("vega"),
                iv=pos_dict.get("iv")
            )
            positions.append(position)

        return positions

    def get_account_summary(self) -> Dict[str, AccountSummary]:
        """Get account summary from IBKR."""
        if not self.is_connected():
            return {}

        summaries = self.client.get_account_summaries()
        if isinstance(summaries, dict) and "error" in summaries:
            return {}

        # Convert to common AccountSummary model
        result = {}
        for account_id, summary_dict in summaries.items():
            summary = AccountSummary(
                account=account_id,
                net_liquidation=safe_float(summary_dict.get("net_liquidation")),
                total_cash=safe_float(summary_dict.get("total_cash")),
                buying_power=safe_float(summary_dict.get("buying_power")),
                unrealized_pnl=safe_float(summary_dict.get("unrealized_pnl")),
                realized_pnl=safe_float(summary_dict.get("realized_pnl")),
                daily_pnl=safe_float(summary_dict.get("daily_pnl"))
            )
            result[account_id] = summary

        return result

    def place_stock_order(self, order: TradeOrder) -> Dict[str, Any]:
        """Place a stock order through IBKR."""
        if not self.is_connected():
            return format_error_response("Not connected to IBKR")

        result = self.client.place_stock_order(
            symbol=order.symbol,
            action=order.action,
            quantity=order.quantity,
            order_type=order.order_type,
            limit_price=order.limit_price
        )

        return result

    def place_option_order(self, order: OptionOrder) -> Dict[str, Any]:
        """Place an option order through IBKR."""
        if not self.is_connected():
            return format_error_response("Not connected to IBKR")

        # Convert single option order to IBKR format
        legs = [{
            "symbol": order.symbol,
            "expiry": order.expiry,
            "strike": order.strike,
            "right": order.right,
            "action": order.action,
            "quantity": order.quantity
        }]

        result = self.client.place_options_order(
            legs=legs,
            order_type=order.order_type,
            limit_price=order.limit_price
        )

        return result

    def get_option_chain(self, symbol: str, max_strikes: int = 30) -> Dict[str, Any]:
        """Get options chain from IBKR."""
        if not self.is_connected():
            return format_error_response("Not connected to IBKR")

        return self.client.get_options_chain(symbol, max_strikes)

    def subscribe_to_market_data(self, symbol: str) -> bool:
        """Subscribe to live market data for a symbol."""
        if not self.is_connected():
            return False

        # This would need implementation in ib_client
        # For now, return True if connected
        return True

    def get_market_price(self, symbol: str) -> Optional[float]:
        """Get current market price for a symbol."""
        if not self.is_connected():
            return None

        # This would need implementation in ib_client
        # For now, return None
        return None