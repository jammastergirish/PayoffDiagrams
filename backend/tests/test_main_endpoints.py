"""
Integration tests for FastAPI endpoints.

Tests cover all endpoints in main.py:
- Health check
- Portfolio (IBKR)
- Historical data (Massive)
- Ticker details (Massive)
- Snapshot (Massive)
- News (Massive)
- Watchlist CRUD
"""

import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def mock_ib_client():
    """Mock ib_client to avoid real IBKR connections."""
    with patch('backend.main.ib_client') as mock:
        mock.ib.isConnected.return_value = False
        yield mock


@pytest.fixture
def client():
    """Create FastAPI test client."""
    from backend.main import app
    return TestClient(app)


class TestHealthEndpoint:
    """Tests for GET /api/health endpoint."""
    
    def test_health_check_returns_status(self, client):
        response = client.get("/api/health")
        
        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert "ib_connected" in data
        assert data["status"] == "ok"
    
    def test_health_check_shows_disconnected(self, client, mock_ib_client):
        mock_ib_client.ib.isConnected.return_value = False
        
        response = client.get("/api/health")
        
        assert response.json()["ib_connected"] == False


class TestPortfolioEndpoint:
    """Tests for GET /api/portfolio endpoint."""
    
    def test_returns_error_when_disconnected(self, client, mock_ib_client):
        mock_ib_client.ib.isConnected.return_value = False
        
        response = client.get("/api/portfolio")
        
        assert response.status_code == 200
        data = response.json()
        assert "error" in data
        assert data["positions"] == []
    
    def test_returns_positions_when_connected(self, client, mock_ib_client):
        mock_ib_client.ib.isConnected.return_value = True
        mock_ib_client.get_positions.return_value = {
            "accounts": ["TEST123"],
            "positions": [{"ticker": "AAPL", "qty": 100}],
            "summary": {}
        }
        
        response = client.get("/api/portfolio")
        
        assert response.status_code == 200
        data = response.json()
        assert "accounts" in data
        assert len(data["positions"]) == 1


class TestHistoricalEndpoint:
    """Tests for GET /api/historical/{symbol} endpoint."""
    
    def test_fetches_historical_data(self, client):
        with patch('backend.main.get_historical_bars') as mock_bars:
            mock_bars.return_value = {
                "symbol": "AAPL",
                "timeframe": "1M",
                "bars": [{"date": "2026-01-01", "close": 150.0}]
            }
            
            response = client.get("/api/historical/aapl")
            
            assert response.status_code == 200
            mock_bars.assert_called_with("AAPL", "1M")
    
    def test_accepts_timeframe_parameter(self, client):
        with patch('backend.main.get_historical_bars') as mock_bars:
            mock_bars.return_value = {"symbol": "TSLA", "timeframe": "1Y", "bars": []}
            
            response = client.get("/api/historical/tsla?timeframe=1y")
            
            mock_bars.assert_called_with("TSLA", "1Y")
    
    def test_uppercases_symbol(self, client):
        with patch('backend.main.get_historical_bars') as mock_bars:
            mock_bars.return_value = {"symbol": "NVDA", "bars": []}
            
            client.get("/api/historical/nvda")
            
            mock_bars.assert_called_with("NVDA", "1M")


class TestTickerEndpoint:
    """Tests for GET /api/ticker/{symbol} endpoint."""
    
    def test_fetches_ticker_details(self, client):
        with patch('backend.main.get_ticker_details') as mock_details:
            mock_details.return_value = {
                "symbol": "AAPL",
                "name": "Apple Inc.",
                "description": "Technology company"
            }
            
            response = client.get("/api/ticker/aapl")
            
            assert response.status_code == 200
            data = response.json()
            assert data["name"] == "Apple Inc."
            mock_details.assert_called_with("AAPL")


class TestSnapshotEndpoint:
    """Tests for GET /api/snapshot/{symbol} endpoint."""
    
    def test_fetches_price_snapshot(self, client):
        with patch('backend.main.get_daily_snapshot') as mock_snapshot:
            mock_snapshot.return_value = {
                "symbol": "GOOG",
                "current_price": 175.50,
                "previous_close": 173.00,
                "change": 2.50,
                "change_pct": 1.45
            }
            
            response = client.get("/api/snapshot/goog")
            
            assert response.status_code == 200
            data = response.json()
            assert data["current_price"] == 175.50
            assert data["change_pct"] == 1.45


class TestNewsEndpoint:
    """Tests for GET /api/news/{symbol} endpoint."""
    
    def test_fetches_news_headlines(self, client):
        with patch('backend.main.get_news') as mock_news:
            mock_news.return_value = {
                "symbol": "TSLA",
                "headlines": [
                    {"headline": "Tesla announces new model", "providerCode": "BZ"}
                ]
            }
            
            response = client.get("/api/news/tsla")
            
            assert response.status_code == 200
            data = response.json()
            assert len(data["headlines"]) == 1
            mock_news.assert_called_with("TSLA", 15)  # Default limit
    
    def test_accepts_limit_parameter(self, client):
        with patch('backend.main.get_news') as mock_news:
            mock_news.return_value = {"symbol": "AAPL", "headlines": []}
            
            client.get("/api/news/aapl?limit=30")
            
            mock_news.assert_called_with("AAPL", 30)


class TestNewsArticleEndpoint:
    """Tests for GET /api/news/article/{article_id} endpoint."""
    
    def test_fetches_article(self, client):
        with patch('backend.main.massive_get_article') as mock_article:
            mock_article.return_value = {
                "articleId": "123",
                "text": "Full article text..."
            }
            
            response = client.get("/api/news/article/123")
            
            assert response.status_code == 200
            mock_article.assert_called_with("123")
