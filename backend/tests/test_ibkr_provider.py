"""
Tests for IBKR data provider.

Tests cover:
- get_historical_bars: Historical OHLC data fetching
- get_daily_snapshot: Daily price and change %
- get_ticker_details: Company info (limited from IBKR)
- get_news: News headlines (requires subscription)
- get_options_chain: Options chain data
"""

import pytest
from unittest.mock import MagicMock, patch, PropertyMock
from datetime import datetime, timedelta
from decimal import Decimal


class MockBar:
    """Mock IBKR bar object."""
    def __init__(self, date, o, h, l, c, v):
        self.date = date
        self.open = o
        self.high = h
        self.low = l
        self.close = c
        self.volume = v


class MockTicker:
    """Mock IBKR ticker object."""
    def __init__(self, bid=0, ask=0, last=0, close=0, volume=0):
        self._bid = bid
        self._ask = ask
        self._last = last
        self._close = close
        self.volume = volume
        self.modelGreeks = None

    @property
    def bid(self):
        return self._bid

    @property
    def ask(self):
        return self._ask

    @property
    def last(self):
        return self._last

    @property
    def close(self):
        return self._close

    def marketPrice(self):
        if self._last > 0:
            return self._last
        if self._bid > 0 and self._ask > 0:
            return (self._bid + self._ask) / 2
        return self._close


class MockModelGreeks:
    """Mock IBKR Greeks object."""
    def __init__(self, delta=0.5, gamma=0.02, theta=-0.05, vega=0.15, iv=0.3, undPrice=100):
        self.delta = delta
        self.gamma = gamma
        self.theta = theta
        self.vega = vega
        self.impliedVol = iv
        self.undPrice = undPrice


class MockContractDetails:
    """Mock IBKR contract details."""
    def __init__(self, long_name="Apple Inc.", industry=None, category=None):
        self.longName = long_name
        self.industry = industry
        self.category = category
        self.subcategory = None
        self.contract = MagicMock()
        self.contract.exchange = 'SMART'
        self.contract.primaryExchange = 'NASDAQ'


class MockSecDefOptParams:
    """Mock option chain parameters."""
    def __init__(self, exchange='SMART', expirations=None, strikes=None):
        self.exchange = exchange
        self.expirations = expirations or {'20260116', '20260117', '20260120'}
        self.strikes = strikes or {95.0, 100.0, 105.0, 110.0}


class MockNewsArticle:
    """Mock IBKR news article."""
    def __init__(self, article_id, headline, provider_code, time):
        self.articleId = article_id
        self.headline = headline
        self.providerCode = provider_code
        self.time = time


@pytest.fixture
def mock_ib_client():
    """Create mock IBClient."""
    with patch('backend.providers.ibkr.ib_client') as mock_client:
        mock_client.connected = True
        mock_client.ib = MagicMock()
        mock_client.ib.isConnected.return_value = True
        mock_client._ensure_market_data = MagicMock()
        yield mock_client


class TestGetHistoricalBars:
    """Tests for get_historical_bars function."""

    def test_returns_bars_for_valid_symbol(self, mock_ib_client):
        from backend.providers.ibkr import get_historical_bars

        # Setup mock data
        now = datetime.now()
        yesterday = now - timedelta(days=1)
        mock_bars = [
            MockBar(yesterday, 100, 105, 99, 103, 1000000),
            MockBar(now, 103, 110, 102, 108, 1200000),
        ]
        mock_ib_client.ib.reqHistoricalData.return_value = mock_bars

        # Execute
        result = get_historical_bars("AAPL", "1M")

        # Assert
        assert result["symbol"] == "AAPL"
        assert result["timeframe"] == "1M"
        assert len(result["bars"]) == 2
        assert "error" not in result
        assert result["bars"][0]["close"] == 103
        assert result["bars"][1]["close"] == 108

    def test_handles_empty_response(self, mock_ib_client):
        from backend.providers.ibkr import get_historical_bars

        mock_ib_client.ib.reqHistoricalData.return_value = []

        result = get_historical_bars("XYZ", "1D")

        assert result["symbol"] == "XYZ"
        assert result["bars"] == []
        assert "error" not in result

    def test_handles_not_connected(self, mock_ib_client):
        from backend.providers.ibkr import get_historical_bars

        mock_ib_client.connected = False

        result = get_historical_bars("AAPL", "1Y")

        assert result["symbol"] == "AAPL"
        assert result["bars"] == []
        assert "error" in result
        assert "Not connected" in result["error"]

    def test_handles_api_error(self, mock_ib_client):
        from backend.providers.ibkr import get_historical_bars

        mock_ib_client.ib.reqHistoricalData.side_effect = Exception("API Error")

        result = get_historical_bars("AAPL", "1Y")

        assert result["symbol"] == "AAPL"
        assert result["bars"] == []
        assert "error" in result


class TestGetDailySnapshot:
    """Tests for get_daily_snapshot function."""

    def test_returns_price_and_change(self, mock_ib_client):
        from backend.providers.ibkr import get_daily_snapshot

        # Setup mock ticker
        mock_ticker = MockTicker(bid=104.5, ask=105.5, last=105, close=100, volume=1000000)
        mock_ib_client.ib.ticker.return_value = mock_ticker

        result = get_daily_snapshot("AAPL")

        assert result["symbol"] == "AAPL"
        assert result["current_price"] == 105
        assert result["previous_close"] == 100
        assert result["change"] == 5
        assert result["change_pct"] == 5.0

    def test_handles_negative_change(self, mock_ib_client):
        from backend.providers.ibkr import get_daily_snapshot

        mock_ticker = MockTicker(last=95, close=100)
        mock_ib_client.ib.ticker.return_value = mock_ticker

        result = get_daily_snapshot("TSLA")

        assert result["change"] == -5
        assert result["change_pct"] == -5.0

    def test_handles_no_ticker(self, mock_ib_client):
        from backend.providers.ibkr import get_daily_snapshot

        mock_ib_client.ib.ticker.return_value = None

        result = get_daily_snapshot("UNKNOWN")

        assert "error" in result

    def test_handles_not_connected(self, mock_ib_client):
        from backend.providers.ibkr import get_daily_snapshot

        mock_ib_client.connected = False

        result = get_daily_snapshot("AAPL")

        assert "error" in result
        assert "Not connected" in result["error"]


class TestGetTickerDetails:
    """Tests for get_ticker_details function."""

    def test_returns_company_info(self, mock_ib_client):
        from backend.providers.ibkr import get_ticker_details

        mock_details = MockContractDetails("Apple Inc.", "Technology", "Computer Manufacturing")
        mock_ib_client.ib.reqContractDetails.return_value = [mock_details]

        result = get_ticker_details("AAPL")

        assert result["symbol"] == "AAPL"
        assert result["name"] == "Apple Inc."
        assert result["industry"] == "Technology"
        assert result["branding"] is None  # Not available from IBKR

    def test_handles_no_details(self, mock_ib_client):
        from backend.providers.ibkr import get_ticker_details

        mock_ib_client.ib.reqContractDetails.return_value = []

        result = get_ticker_details("INVALID")

        assert "error" in result

    def test_handles_not_connected(self, mock_ib_client):
        from backend.providers.ibkr import get_ticker_details

        mock_ib_client.connected = False

        result = get_ticker_details("AAPL")

        assert "error" in result


class TestGetNews:
    """Tests for get_news function."""

    def test_returns_headlines(self, mock_ib_client):
        from backend.providers.ibkr import get_news

        # Setup mock contract qualification
        def qualify_side_effect(contract):
            contract.conId = 12345
        mock_ib_client.ib.qualifyContracts.side_effect = qualify_side_effect

        # Setup mock news
        mock_articles = [
            MockNewsArticle("art1", "Apple announces new product", "DJ", datetime(2026, 1, 15, 10, 0)),
            MockNewsArticle("art2", "AAPL stock rises", "Reuters", datetime(2026, 1, 15, 9, 0)),
        ]
        mock_ib_client.ib.reqHistoricalNews.return_value = mock_articles

        result = get_news("AAPL", limit=10)

        assert result["symbol"] == "AAPL"
        assert len(result["headlines"]) == 2
        assert result["headlines"][0]["articleId"] == "art1"

    def test_handles_no_subscription(self, mock_ib_client):
        from backend.providers.ibkr import get_news

        def qualify_side_effect(contract):
            contract.conId = 12345
        mock_ib_client.ib.qualifyContracts.side_effect = qualify_side_effect
        mock_ib_client.ib.reqHistoricalNews.side_effect = Exception("354 no data")

        result = get_news("AAPL")

        assert result["symbol"] == "AAPL"
        assert result["headlines"] == []
        # Should handle gracefully without exposing error


class TestGetOptionsChain:
    """Tests for get_options_chain function."""

    def test_returns_chain_structure(self, mock_ib_client):
        from backend.providers.ibkr import get_options_chain

        # Setup mock contract qualification
        def qualify_side_effect(contract):
            contract.conId = 12345
        mock_ib_client.ib.qualifyContracts.side_effect = qualify_side_effect

        # Setup mock ticker for underlying
        mock_ticker = MockTicker(last=100, close=100)
        mock_ib_client.ib.ticker.return_value = mock_ticker

        # Setup mock option chain params
        mock_params = MockSecDefOptParams()
        mock_ib_client.ib.reqSecDefOptParams.return_value = [mock_params]

        result = get_options_chain("AAPL", max_strikes=10)

        assert result["symbol"] == "AAPL"
        assert "expirations" in result
        assert "strikes" in result
        assert "calls" in result
        assert "puts" in result

    def test_handles_not_connected(self, mock_ib_client):
        from backend.providers.ibkr import get_options_chain

        mock_ib_client.connected = False

        result = get_options_chain("AAPL")

        assert "error" in result
        assert result["expirations"] == []
        assert result["strikes"] == []


class TestIBKRProvider:
    """Tests for IBKRProvider class methods."""

    def test_provider_implements_interface(self):
        from backend.providers.ibkr import IBKRProvider
        from backend.providers.base import DataProviderInterface

        provider = IBKRProvider()
        assert isinstance(provider, DataProviderInterface)

    def test_get_historical_data_returns_bars(self, mock_ib_client):
        from backend.providers.ibkr import IBKRProvider

        now = datetime.now()
        mock_bars = [
            MockBar(now, 100, 105, 99, 103, 1000000),
        ]
        mock_ib_client.ib.reqHistoricalData.return_value = mock_bars

        provider = IBKRProvider()
        result = provider.get_historical_data("AAPL", "1M")

        assert len(result) == 1
        assert result[0].close == 103

    def test_get_news_returns_list(self, mock_ib_client):
        from backend.providers.ibkr import IBKRProvider

        def qualify_side_effect(contract):
            contract.conId = 12345
        mock_ib_client.ib.qualifyContracts.side_effect = qualify_side_effect
        mock_ib_client.ib.reqHistoricalNews.return_value = []

        provider = IBKRProvider()
        result = provider.get_news("AAPL")

        assert isinstance(result, list)
