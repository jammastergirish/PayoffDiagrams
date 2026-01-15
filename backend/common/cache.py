"""Cache management utilities."""

from datetime import datetime, timedelta
from typing import Dict, Any, Optional, Tuple


class CacheManager:
    """Manages caching with TTL support."""

    def __init__(self):
        self._cache: Dict[str, Tuple[datetime, Any]] = {}

    def get_market_hours_ttl(self) -> int:
        """Returns cache TTL in seconds based on market hours."""
        now = datetime.now()
        weekday = now.weekday()
        hour = now.hour

        # Weekend (Saturday=5, Sunday=6): longer cache
        if weekday >= 5:
            return 300  # 5 minutes on weekends

        # Market hours (9:30 AM - 4:00 PM ET, roughly 6:30 AM - 1:00 PM PT)
        if 6 <= hour < 13:  # Pacific time market hours
            return 60  # 1 minute during market hours
        elif 13 <= hour < 16:  # After market close but still active
            return 120  # 2 minutes
        else:
            return 180  # 3 minutes outside market hours

    def get(self, key: str, ttl_seconds: Optional[int] = None) -> Optional[Any]:
        """Get cached value if not expired."""
        if key not in self._cache:
            return None

        cached_time, cached_data = self._cache[key]
        ttl = ttl_seconds if ttl_seconds is not None else self.get_market_hours_ttl()

        if datetime.now() - cached_time < timedelta(seconds=ttl):
            return cached_data

        # Expired - remove from cache
        del self._cache[key]
        return None

    def set(self, key: str, value: Any) -> None:
        """Set cache value with current timestamp."""
        self._cache[key] = (datetime.now(), value)

    def get_with_metadata(self, key: str, ttl_seconds: Optional[int] = None) -> Optional[Dict[str, Any]]:
        """Get cached value with cache metadata."""
        if key not in self._cache:
            return None

        cached_time, cached_data = self._cache[key]
        ttl = ttl_seconds if ttl_seconds is not None else self.get_market_hours_ttl()

        if datetime.now() - cached_time < timedelta(seconds=ttl):
            return {
                "data": cached_data,
                "cached": True,
                "cache_age_seconds": int((datetime.now() - cached_time).total_seconds())
            }

        # Expired
        del self._cache[key]
        return None

    def clear(self, pattern: Optional[str] = None) -> int:
        """Clear cache entries. If pattern provided, only clear matching keys."""
        if pattern is None:
            count = len(self._cache)
            self._cache.clear()
            return count

        keys_to_remove = [k for k in self._cache.keys() if pattern in k]
        for key in keys_to_remove:
            del self._cache[key]
        return len(keys_to_remove)

    def stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        now = datetime.now()
        entries = []

        for key, (cached_time, _) in self._cache.items():
            age = int((now - cached_time).total_seconds())
            entries.append({
                "key": key,
                "age_seconds": age,
                "cached_at": cached_time.isoformat()
            })

        return {
            "total_entries": len(self._cache),
            "entries": sorted(entries, key=lambda x: x["age_seconds"])
        }


# Global cache instances
options_cache = CacheManager()
historical_cache = CacheManager()
snapshot_cache = CacheManager()
news_cache = CacheManager()