"""Configuration for brokers and data providers."""

import os
from typing import Optional
from .brokers.factory import BrokerFactory
from .brokers.base import BrokerInterface
from .providers.factory import DataProviderFactory
from .providers.base import DataProviderInterface


class Config:
    """Application configuration."""

    def __init__(self):
        # Read from environment variables with defaults
        self.broker_name = os.getenv("BROKER", "ibkr")
        self.data_provider_name = os.getenv("DATA_PROVIDER", "massive")

        # Broker settings
        self.ib_host = os.getenv("IB_HOST", "127.0.0.1")
        self.ib_port = int(os.getenv("IB_PORT", "7496"))
        self.ib_client_id = int(os.getenv("IB_CLIENT_ID", "1")) if os.getenv("IB_CLIENT_ID") else None

        # API Keys
        self.massive_api_key = os.getenv("MASSIVE_API_KEY", "")
        self.openai_api_key = os.getenv("OPENAI_API_KEY", "")

        # Cache settings
        self.cache_enabled = os.getenv("CACHE_ENABLED", "true").lower() == "true"

        # Initialize broker and data provider
        self._broker: Optional[BrokerInterface] = None
        self._data_provider: Optional[DataProviderInterface] = None

    @property
    def broker(self) -> Optional[BrokerInterface]:
        """Get the configured broker instance."""
        if self._broker is None:
            self._broker = BrokerFactory.create(self.broker_name)
        return self._broker

    @property
    def data_provider(self) -> Optional[DataProviderInterface]:
        """Get the configured data provider instance."""
        if self._data_provider is None:
            self._data_provider = DataProviderFactory.create(self.data_provider_name)
        return self._data_provider

    def switch_broker(self, broker_name: str) -> bool:
        """Switch to a different broker.

        Args:
            broker_name: Name of the broker to switch to

        Returns:
            True if successful, False otherwise
        """
        new_broker = BrokerFactory.create(broker_name)
        if new_broker:
            # Disconnect old broker if connected
            if self._broker:
                self._broker.disconnect()

            self._broker = new_broker
            self.broker_name = broker_name
            return True
        return False

    def switch_data_provider(self, provider_name: str) -> bool:
        """Switch to a different data provider.

        Args:
            provider_name: Name of the provider to switch to

        Returns:
            True if successful, False otherwise
        """
        new_provider = DataProviderFactory.create(provider_name)
        if new_provider:
            self._data_provider = new_provider
            self.data_provider_name = provider_name
            return True
        return False


# Global config instance
config = Config()