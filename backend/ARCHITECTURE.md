# Backend Architecture - Modular Design

## Overview
The backend has been refactored to support multiple brokers and data providers through a modular, pluggable architecture.

## Directory Structure
```
backend/
├── brokers/           # Broker implementations
│   ├── base.py       # BrokerInterface (abstract base)
│   ├── factory.py    # BrokerFactory for creating instances
│   └── ibkr.py       # Interactive Brokers implementation
├── providers/         # Data provider implementations
│   ├── base.py       # DataProviderInterface (abstract base)
│   ├── factory.py    # DataProviderFactory
│   └── massive.py    # Massive data provider implementation
├── common/           # Shared utilities and models
│   ├── models.py     # Common data models (Position, Order, etc.)
│   ├── cache.py      # CacheManager for all caching needs
│   └── utils.py      # Common utility functions
├── config.py         # Configuration management
└── main.py          # FastAPI application
```

## Key Components

### 1. Broker Interface (`brokers/base.py`)
Defines the standard interface all brokers must implement:
- `connect()` / `disconnect()` - Connection management
- `get_positions()` - Get current positions
- `get_account_summary()` - Account information
- `place_stock_order()` / `place_option_order()` - Order placement
- `get_option_chain()` - Options data

### 2. Data Provider Interface (`providers/base.py`)
Defines the standard interface for market data providers:
- `get_historical_data()` - Historical price bars
- `get_ticker_details()` - Company information
- `get_daily_snapshot()` - Daily price data
- `get_news()` / `get_market_news()` - News data
- `get_options_chain()` - Options chain data

### 3. Common Models (`common/models.py`)
Universal data models used across all implementations:
- `Position` - Position data structure
- `AccountSummary` - Account information
- `TradeOrder` / `OptionOrder` - Order structures
- `HistoricalBar` - OHLCV data
- `OptionQuote` - Option quote data

### 4. Cache Management (`common/cache.py`)
Centralized caching with market-hours-aware TTL:
- Automatic TTL adjustment based on market hours
- Per-cache-type instances (options, historical, news, etc.)
- Cache statistics and management

### 5. Configuration (`config.py`)
Environment-based configuration:
```python
BROKER=ibkr              # or alpaca, schwab, etc.
DATA_PROVIDER=massive    # or polygon, yahoo, etc.
```

## Adding New Brokers

To add a new broker (e.g., Alpaca):

1. Create `backend/brokers/alpaca.py`:
```python
from .base import BrokerInterface

class AlpacaBroker(BrokerInterface):
    def connect(self) -> bool:
        # Alpaca-specific connection logic
        pass
    # ... implement all required methods
```

2. Register in the factory:
```python
# In brokers/factory.py
BrokerFactory.register("alpaca", AlpacaBroker)
```

3. Use via environment variable:
```bash
BROKER=alpaca python main.py
```

## Adding New Data Providers

Similarly for data providers:

1. Create `backend/providers/polygon.py`:
```python
from .base import DataProviderInterface

class PolygonProvider(DataProviderInterface):
    def get_historical_data(self, symbol, timeframe):
        # Polygon-specific implementation
        pass
    # ... implement all required methods
```

2. Register and use the same way as brokers.

## Benefits

1. **Modularity** - Easy to add new brokers/providers
2. **Consistency** - All implementations follow the same interface
3. **Testability** - Can mock interfaces for testing
4. **Flexibility** - Switch brokers/providers without code changes
5. **DRY** - Common functionality shared across implementations
6. **Caching** - Centralized, intelligent caching system

## Migration Path

The existing `ib_client.py` and `massive_client.py` remain functional and are wrapped by the new adapters, ensuring backward compatibility while enabling the new modular architecture.