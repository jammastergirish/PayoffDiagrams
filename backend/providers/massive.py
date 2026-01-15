"""Massive data provider implementation."""

from typing import List, Dict, Any, Optional
from datetime import datetime
from .base import DataProviderInterface
from ..common.models import HistoricalBar
from ..common.cache import historical_cache, snapshot_cache, news_cache, options_cache
from ..massive_client import (
    get_historical_bars,
    get_ticker_details as massive_get_ticker_details,
    get_daily_snapshot as massive_get_snapshot,
    get_news as massive_get_news,
    get_market_news as massive_get_market_news,
    get_news_article as massive_get_article,
    get_options_chain as massive_get_options
)


class MassiveProvider(DataProviderInterface):
    """Massive data provider implementation."""

    def __init__(self):
        self.cache_ttl = {
            "historical": 60,  # 1 minute
            "snapshot": 30,    # 30 seconds
            "news": 180,       # 3 minutes
            "options": None    # Dynamic based on market hours
        }

    def get_historical_data(self, symbol: str, timeframe: str = "1M") -> List[HistoricalBar]:
        """Get historical price data from Massive."""
        cache_key = f"{symbol}:{timeframe}"

        # Check cache
        cached = historical_cache.get(cache_key, self.cache_ttl["historical"])
        if cached:
            return cached

        # Fetch from Massive
        data = get_historical_bars(symbol, timeframe)

        if "error" not in data and "bars" in data:
            # Convert to HistoricalBar objects
            bars = []
            for bar_dict in data["bars"]:
                bar = HistoricalBar(
                    date=datetime.fromisoformat(bar_dict["date"]),
                    open=bar_dict["open"],
                    high=bar_dict["high"],
                    low=bar_dict["low"],
                    close=bar_dict["close"],
                    volume=bar_dict["volume"]
                )
                bars.append(bar)

            # Cache the result
            historical_cache.set(cache_key, bars)
            return bars

        return []

    def get_ticker_details(self, symbol: str) -> Dict[str, Any]:
        """Get ticker company details from Massive."""
        # This typically doesn't change often, could use longer cache
        cache_key = f"details:{symbol}"
        cached = news_cache.get(cache_key, 3600)  # 1 hour cache
        if cached:
            return cached

        data = massive_get_ticker_details(symbol)
        if "error" not in data:
            news_cache.set(cache_key, data)
        return data

    def get_daily_snapshot(self, symbol: str) -> Dict[str, Any]:
        """Get daily price snapshot from Massive."""
        cache_key = f"snapshot:{symbol}"

        cached = snapshot_cache.get(cache_key, self.cache_ttl["snapshot"])
        if cached:
            return cached

        data = massive_get_snapshot(symbol)
        if "error" not in data:
            snapshot_cache.set(cache_key, data)
        return data

    def get_news(self, symbol: str, limit: int = 15) -> List[Dict[str, Any]]:
        """Get news headlines for a ticker from Massive."""
        cache_key = f"news:{symbol}"

        cached = news_cache.get(cache_key, self.cache_ttl["news"])
        if cached:
            return cached

        data = massive_get_news(symbol, limit)
        if "headlines" in data:
            news_cache.set(cache_key, data["headlines"])
            return data["headlines"]
        return []

    def get_market_news(self, limit: int = 25) -> List[Dict[str, Any]]:
        """Get general market news from Massive."""
        cache_key = "news:market"

        cached = news_cache.get(cache_key, self.cache_ttl["news"])
        if cached:
            return cached

        data = massive_get_market_news(limit)
        if "headlines" in data:
            news_cache.set(cache_key, data["headlines"])
            return data["headlines"]
        return []

    def get_news_article(self, article_id: str) -> Dict[str, Any]:
        """Get full news article from Massive."""
        cache_key = f"article:{article_id}"

        # Articles don't change, cache for longer
        cached = news_cache.get(cache_key, 3600)  # 1 hour
        if cached:
            return cached

        data = massive_get_article(article_id)
        if "error" not in data:
            news_cache.set(cache_key, data)
        return data

    def get_options_chain(self, symbol: str, max_strikes: int = 30) -> Dict[str, Any]:
        """Get options chain data from Massive."""
        cache_key = f"options:{symbol}"

        # Dynamic TTL based on market hours
        cached = options_cache.get_with_metadata(cache_key)
        if cached:
            return cached

        data = massive_get_options(symbol, max_strikes)
        if "error" not in data:
            options_cache.set(cache_key, data)
        return data