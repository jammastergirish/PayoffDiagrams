from fastapi.testclient import TestClient
from backend.main import app
from unittest.mock import patch
import pytest

client = TestClient(app)

def test_health_check():
    # Mock IB connection status
    with patch('backend.ib_client.ib_client.ib.isConnected', return_value=True):
        response = client.get("/api/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok", "ib_connected": True}

def test_get_portfolio_offline():
    # If not connected, should return error or empty
    with patch('backend.ib_client.ib_client.ib.isConnected', return_value=False):
        response = client.get("/api/portfolio")
        assert response.status_code == 200
        assert response.json() == {"error": "Not connected to IBKR", "positions": []}

def test_get_portfolio_connected():
    with patch('backend.ib_client.ib_client.ib.isConnected', return_value=True):
        with patch('backend.ib_client.ib_client.get_positions') as mock_get:
            mock_get.return_value = [{"ticker": "TEST", "qty": 10}]
            
            response = client.get("/api/portfolio")
            assert response.status_code == 200
            assert response.json() == {"positions": [{"ticker": "TEST", "qty": 10}]}
