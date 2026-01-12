"""
Tests for Massive.com API client.

Tests cover:
- get_historical_bars: Historical OHLC data fetching
- get_daily_snapshot: Daily price and change % 
- get_ticker_details: Company info and branding
- get_news: News headlines from multiple sources
"""

import pytest
from unittest.mock import MagicMock, patch, PropertyMock
from datetime import datetime, timedelta


class MockAgg:
    """Mock Massive API aggregate (bar) object."""
    def __init__(self, timestamp, o, h, l, c, v):
        self.timestamp = timestamp
        self.o = o
        self.h = h
        self.l = l
        self.c = c
        self.v = v
        self.open = o
        self.high = h
        self.low = l
        self.close = c
        self.volume = v
        self.vwap = (h + l + c) / 3
        self.transactions = 100


class MockTickerDetails:
    """Mock Massive API ticker details response."""
    def __init__(self, name, description=None):
        self.name = name
        self.description = description
        self.homepage_url = "https://example.com"
        self.market_cap = 1000000000
        self.total_employees = 5000
        self.list_date = "1990-01-01"
        self.branding = None


class MockBranding:
    def __init__(self):
        self.logo_url = "https://example.com/logo.png"
        self.icon_url = "https://example.com/icon.png"


class MockNewsArticle:
    """Mock Benzinga news article."""
    def __init__(self, benzinga_id, title, published, teaser="", body="", url=""):
        self.benzinga_id = benzinga_id
        self.title = title
        self.published = published
        self.teaser = teaser
        self.body = body
        self.url = url
        self.author = "Test Author"


class MockRefNewsArticle:
    """Mock reference news article."""
    def __init__(self, article_id, title, published_utc, description=""):
        self.id = article_id
        self.title = title
        self.published_utc = published_utc
        self.description = description
        self.article_url = "https://example.com/article"
        self.author = "Ref Author"
        self.publisher = MagicMock()
        self.publisher.name = "Test Publisher"


@pytest.fixture
def mock_massive_client():
    """Create a mock Massive REST client."""
    with patch('backend.massive_client._client') as mock_client:
        with patch('backend.massive_client._api_key', 'test_api_key'):
            mock_client.get_aggs = MagicMock()
            mock_client.get_ticker_details = MagicMock()
            mock_client.list_benzinga_news_v2 = MagicMock()
            mock_client.list_ticker_news = MagicMock()
            yield mock_client


class TestGetHistoricalBars:
    """Tests for get_historical_bars function."""
    
    def test_returns_bars_for_valid_symbol(self, mock_massive_client):
        from backend.massive_client import get_historical_bars
        
        # Setup mock data
        now = datetime.now()
        ts = int(now.timestamp() * 1000)
        mock_aggs = [
            MockAgg(ts - 86400000, 100, 105, 99, 103, 1000000),
            MockAgg(ts, 103, 110, 102, 108, 1200000),
        ]
        mock_massive_client.get_aggs.return_value = mock_aggs
        
        # Execute
        result = get_historical_bars("AAPL", "1M")
        
        # Assert
        assert result["symbol"] == "AAPL"
        assert result["timeframe"] == "1M"
        assert len(result["bars"]) == 2
        assert "error" not in result
        assert result["bars"][0]["close"] == 103
        assert result["bars"][1]["close"] == 108
    
    def test_handles_empty_response(self, mock_massive_client):
        from backend.massive_client import get_historical_bars
        
        mock_massive_client.get_aggs.return_value = []
        
        result = get_historical_bars("XYZ", "1D")
        
        assert result["symbol"] == "XYZ"
        assert result["bars"] == []
        assert "error" not in result
    
    def test_handles_api_error(self, mock_massive_client):
        from backend.massive_client import get_historical_bars
        
        mock_massive_client.get_aggs.side_effect = Exception("API Error")
        
        result = get_historical_bars("AAPL", "1Y")
        
        assert result["symbol"] == "AAPL"
        assert result["bars"] == []
        assert "error" in result
        assert "API Error" in result["error"]
    
    def test_uses_correct_timeframe_config(self, mock_massive_client):
        from backend.massive_client import get_historical_bars
        
        mock_massive_client.get_aggs.return_value = []
        
        # Test 1H timeframe (minute bars)
        get_historical_bars("AAPL", "1H")
        call_args = mock_massive_client.get_aggs.call_args
        assert call_args.kwargs["timespan"] == "minute"
        assert call_args.kwargs["multiplier"] == 1


class TestGetDailySnapshot:
    """Tests for get_daily_snapshot function."""
    
    def test_returns_price_and_change(self, mock_massive_client):
        from backend.massive_client import get_daily_snapshot
        
        now = datetime.now()
        ts_today = int(now.timestamp() * 1000)
        ts_yesterday = int((now - timedelta(days=1)).timestamp() * 1000)
        
        mock_aggs = [
            MockAgg(ts_today, 100, 105, 99, 105, 1000000),      # Today (most recent)
            MockAgg(ts_yesterday, 95, 102, 94, 100, 900000),    # Yesterday
        ]
        mock_massive_client.get_aggs.return_value = mock_aggs
        
        result = get_daily_snapshot("AAPL")
        
        assert result["symbol"] == "AAPL"
        assert result["current_price"] == 105
        assert result["previous_close"] == 100
        assert result["change"] == 5
        assert result["change_pct"] == 5.0
    
    def test_handles_negative_change(self, mock_massive_client):
        from backend.massive_client import get_daily_snapshot
        
        now = datetime.now()
        ts = int(now.timestamp() * 1000)
        
        mock_aggs = [
            MockAgg(ts, 100, 102, 95, 95, 1000000),     # Today down
            MockAgg(ts - 86400000, 98, 105, 97, 100, 900000),  # Yesterday
        ]
        mock_massive_client.get_aggs.return_value = mock_aggs
        
        result = get_daily_snapshot("TSLA")
        
        assert result["change"] == -5
        assert result["change_pct"] == -5.0
    
    def test_handles_no_data(self, mock_massive_client):
        from backend.massive_client import get_daily_snapshot
        
        mock_massive_client.get_aggs.return_value = []
        
        result = get_daily_snapshot("UNKNOWN")
        
        assert "error" in result


class TestGetTickerDetails:
    """Tests for get_ticker_details function."""
    
    def test_returns_company_info(self, mock_massive_client):
        from backend.massive_client import get_ticker_details
        
        mock_details = MockTickerDetails("Apple Inc.", "Technology company")
        mock_details.branding = MockBranding()
        mock_massive_client.get_ticker_details.return_value = mock_details
        
        result = get_ticker_details("AAPL")
        
        assert result["symbol"] == "AAPL"
        assert result["name"] == "Apple Inc."
        assert result["description"] == "Technology company"
        assert result["branding"]["logo_url"] is not None
        assert "apiKey" in result["branding"]["logo_url"]
    
    def test_handles_missing_branding(self, mock_massive_client):
        from backend.massive_client import get_ticker_details
        
        mock_details = MockTickerDetails("Test Corp")
        mock_details.branding = None
        mock_massive_client.get_ticker_details.return_value = mock_details
        
        result = get_ticker_details("TEST")
        
        assert result["name"] == "Test Corp"
        assert result["branding"] is None
    
    def test_handles_api_error(self, mock_massive_client):
        from backend.massive_client import get_ticker_details
        
        mock_massive_client.get_ticker_details.side_effect = Exception("Not found")
        
        result = get_ticker_details("INVALID")
        
        assert "error" in result


class TestGetNews:
    """Tests for get_news function."""
    
    def test_merges_benzinga_and_reference_news(self, mock_massive_client):
        from backend.massive_client import get_news
        
        # Setup Benzinga mock
        benzinga_articles = [
            MockNewsArticle("bz1", "Benzinga Headline 1", "2026-01-11T10:00:00Z"),
            MockNewsArticle("bz2", "Benzinga Headline 2", "2026-01-11T09:00:00Z"),
        ]
        mock_massive_client.list_benzinga_news_v2.return_value = iter(benzinga_articles)
        
        # Setup Reference News mock
        ref_articles = [
            MockRefNewsArticle("ref1", "Reference Headline", "2026-01-11T09:30:00Z"),
        ]
        mock_massive_client.list_ticker_news.return_value = iter(ref_articles)
        
        result = get_news("AAPL", limit=10)
        
        assert result["symbol"] == "AAPL"
        assert len(result["headlines"]) == 3
        # Verify Benzinga articles are included
        assert any(h["providerCode"] == "BZ" for h in result["headlines"])
    
    def test_respects_limit(self, mock_massive_client):
        from backend.massive_client import get_news
        
        # Setup many articles
        benzinga_articles = [
            MockNewsArticle(f"bz{i}", f"Headline {i}", f"2026-01-11T{10-i}:00:00Z")
            for i in range(10)
        ]
        mock_massive_client.list_benzinga_news_v2.return_value = iter(benzinga_articles)
        mock_massive_client.list_ticker_news.return_value = iter([])
        
        result = get_news("AAPL", limit=5)
        
        assert len(result["headlines"]) <= 5
