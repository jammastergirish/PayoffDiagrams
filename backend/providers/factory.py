"""Data provider factory for creating provider instances."""

from typing import Optional
from .base import DataProviderInterface
from .massive import MassiveProvider


class DataProviderFactory:
    """Factory for creating data provider instances."""

    _providers = {
        "massive": MassiveProvider,
        # Future providers can be added here:
        # "polygon": PolygonProvider,
        # "alpha_vantage": AlphaVantageProvider,
        # "yahoo": YahooFinanceProvider,
        # "tradier": TradierProvider,
    }

    @classmethod
    def create(cls, provider_name: str) -> Optional[DataProviderInterface]:
        """Create a data provider instance by name.

        Args:
            provider_name: Name of the provider (e.g., 'massive', 'polygon')

        Returns:
            Provider instance or None if not found
        """
        provider_class = cls._providers.get(provider_name.lower())
        if provider_class:
            return provider_class()
        return None

    @classmethod
    def list_available(cls) -> list[str]:
        """List all available provider names."""
        return list(cls._providers.keys())

    @classmethod
    def register(cls, name: str, provider_class: type):
        """Register a new provider implementation.

        Args:
            name: Name to register the provider under
            provider_class: Provider class that implements DataProviderInterface
        """
        if not issubclass(provider_class, DataProviderInterface):
            raise TypeError(f"{provider_class} must implement DataProviderInterface")
        cls._providers[name.lower()] = provider_class