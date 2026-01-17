"""Broker factory for creating broker instances."""

from typing import Optional
from .base import BrokerInterface
from .ibkr import IBKRBroker
from .alpaca import AlpacaBroker


class BrokerFactory:
    """Factory for creating broker instances."""

    _brokers = {
        "ibkr": IBKRBroker,
        "interactive_brokers": IBKRBroker,
        "alpaca": AlpacaBroker,
        # Future brokers can be added here:
        # "schwab": SchwabBroker,
        # "etrade": ETradeBroker,
    }

    @classmethod
    def create(cls, broker_name: str) -> Optional[BrokerInterface]:
        """Create a broker instance by name.

        Args:
            broker_name: Name of the broker (e.g., 'ibkr', 'alpaca')

        Returns:
            Broker instance or None if not found
        """
        broker_class = cls._brokers.get(broker_name.lower())
        if broker_class:
            return broker_class()
        return None

    @classmethod
    def list_available(cls) -> list[str]:
        """List all available broker names."""
        return list(cls._brokers.keys())

    @classmethod
    def register(cls, name: str, broker_class: type):
        """Register a new broker implementation.

        Args:
            name: Name to register the broker under
            broker_class: Broker class that implements BrokerInterface
        """
        if not issubclass(broker_class, BrokerInterface):
            raise TypeError(f"{broker_class} must implement BrokerInterface")
        cls._brokers[name.lower()] = broker_class