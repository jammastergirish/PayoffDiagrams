"""
Tests for watchlist API endpoints.

Tests cover:
- GET /api/watchlist: Retrieve watchlist
- POST /api/watchlist: Add ticker to watchlist
- DELETE /api/watchlist/{ticker}: Remove ticker from watchlist
"""

import pytest
from unittest.mock import patch, mock_open
import json
from fastapi.testclient import TestClient


# Mock the ib_client before importing main module
@pytest.fixture(autouse=True)
def mock_ib_client():
    with patch('backend.main.ib_client') as mock:
        mock.ib.isConnected.return_value = True
        yield mock


@pytest.fixture
def client():
    """Create FastAPI test client."""
    from backend.main import app
    return TestClient(app)


@pytest.fixture
def mock_watchlist_file(tmp_path):
    """Create a temporary watchlist file."""
    watchlist_file = tmp_path / "watchlist.json"
    watchlist_file.write_text(json.dumps({"tickers": ["AAPL", "MSFT"]}))
    return watchlist_file


class TestGetWatchlist:
    """Tests for GET /api/watchlist endpoint."""
    
    def test_returns_empty_list_when_no_file(self, client):
        with patch('backend.main.WATCHLIST_FILE') as mock_path:
            mock_path.exists.return_value = False
            
            response = client.get("/api/watchlist")
            
            assert response.status_code == 200
            assert response.json()["tickers"] == []
    
    def test_returns_tickers_from_file(self, client, mock_watchlist_file):
        with patch('backend.main.WATCHLIST_FILE', mock_watchlist_file):
            response = client.get("/api/watchlist")
            
            assert response.status_code == 200
            data = response.json()
            assert "AAPL" in data["tickers"]
            assert "MSFT" in data["tickers"]


class TestAddToWatchlist:
    """Tests for POST /api/watchlist endpoint."""
    
    def test_adds_new_ticker(self, client, mock_watchlist_file):
        with patch('backend.main.WATCHLIST_FILE', mock_watchlist_file):
            response = client.post(
                "/api/watchlist",
                json={"ticker": "GOOG"}
            )
            
            assert response.status_code == 200
            data = response.json()
            assert "GOOG" in data["tickers"]
            
            # Verify file was updated
            file_content = json.loads(mock_watchlist_file.read_text())
            assert "GOOG" in file_content["tickers"]
    
    def test_uppercases_ticker(self, client, mock_watchlist_file):
        with patch('backend.main.WATCHLIST_FILE', mock_watchlist_file):
            response = client.post(
                "/api/watchlist",
                json={"ticker": "nvda"}
            )
            
            assert response.status_code == 200
            assert "NVDA" in response.json()["tickers"]
    
    def test_prevents_duplicate_ticker(self, client, mock_watchlist_file):
        with patch('backend.main.WATCHLIST_FILE', mock_watchlist_file):
            response = client.post(
                "/api/watchlist",
                json={"ticker": "AAPL"}  # Already exists
            )
            
            assert response.status_code == 200
            # Should not have duplicate
            tickers = response.json()["tickers"]
            assert tickers.count("AAPL") == 1
    
    def test_sorts_tickers_alphabetically(self, client, mock_watchlist_file):
        with patch('backend.main.WATCHLIST_FILE', mock_watchlist_file):
            response = client.post(
                "/api/watchlist",
                json={"ticker": "AMD"}  # Should be first alphabetically
            )
            
            assert response.status_code == 200
            tickers = response.json()["tickers"]
            assert tickers == sorted(tickers)


class TestRemoveFromWatchlist:
    """Tests for DELETE /api/watchlist/{ticker} endpoint."""
    
    def test_removes_existing_ticker(self, client, mock_watchlist_file):
        with patch('backend.main.WATCHLIST_FILE', mock_watchlist_file):
            response = client.delete("/api/watchlist/AAPL")
            
            assert response.status_code == 200
            assert "AAPL" not in response.json()["tickers"]
            
            # Verify file was updated
            file_content = json.loads(mock_watchlist_file.read_text())
            assert "AAPL" not in file_content["tickers"]
    
    def test_handles_nonexistent_ticker(self, client, mock_watchlist_file):
        with patch('backend.main.WATCHLIST_FILE', mock_watchlist_file):
            response = client.delete("/api/watchlist/NOTEXIST")
            
            assert response.status_code == 200
            # Should still return successful with remaining tickers
            assert "AAPL" in response.json()["tickers"]
    
    def test_case_insensitive_removal(self, client, mock_watchlist_file):
        with patch('backend.main.WATCHLIST_FILE', mock_watchlist_file):
            response = client.delete("/api/watchlist/aapl")  # lowercase
            
            assert response.status_code == 200
            assert "AAPL" not in response.json()["tickers"]


class TestSnapshotEndpoint:
    """Tests for GET /api/snapshot/{symbol} endpoint."""
    
    def test_returns_price_data(self, client):
        with patch('backend.main.get_daily_snapshot') as mock_snapshot:
            mock_snapshot.return_value = {
                "symbol": "AAPL",
                "current_price": 175.50,
                "previous_close": 173.00,
                "change": 2.50,
                "change_pct": 1.45
            }
            
            response = client.get("/api/snapshot/AAPL")
            
            assert response.status_code == 200
            data = response.json()
            assert data["current_price"] == 175.50
            assert data["change_pct"] == 1.45
    
    def test_uppercases_symbol(self, client):
        with patch('backend.main.get_daily_snapshot') as mock_snapshot:
            mock_snapshot.return_value = {"symbol": "TSLA"}
            
            client.get("/api/snapshot/tsla")
            
            mock_snapshot.assert_called_with("TSLA")
