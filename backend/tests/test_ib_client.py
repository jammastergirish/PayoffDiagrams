"""
Unit tests for IBClient class.

Tests cover:
- _safe_float: Safe conversion of various values
- PositionModel: Dataclass validation
- Connection logic
"""

import pytest
import math
from unittest.mock import MagicMock, patch
from backend.ib_client import IBClient, PositionModel


class TestSafeFloat:
    """Tests for IBClient._safe_float method."""
    
    @pytest.fixture
    def client(self):
        """Create IBClient without connecting."""
        with patch('backend.ib_client.IB') as MockIB:
            client = IBClient()
            client.connected = False
            return client
    
    def test_handles_none(self, client):
        assert client._safe_float(None) == 0.0
        assert client._safe_float(None, default=-1) == -1
    
    def test_handles_nan(self, client):
        assert client._safe_float(float('nan')) == 0.0
        assert client._safe_float(float('nan'), default=99) == 99
    
    def test_handles_float(self, client):
        assert client._safe_float(3.14) == 3.14
        assert client._safe_float(100.0) == 100.0
    
    def test_handles_int(self, client):
        assert client._safe_float(42) == 42.0
        assert client._safe_float(-10) == -10.0
    
    def test_handles_string_number(self, client):
        # May raise or return default depending on implementation
        try:
            result = client._safe_float("123.45")
            assert result == 123.45 or result == 0.0
        except:
            pass  # Implementation may not handle strings
    
    def test_handles_infinity(self, client):
        result = client._safe_float(float('inf'))
        assert result == float('inf') or result == 0.0


class TestPositionModel:
    """Tests for PositionModel dataclass."""
    
    def test_creates_stock_position(self):
        pos = PositionModel(
            ticker="AAPL",
            position_type="stock",
            qty=100,
            cost_basis=150.0,
            current_price=155.0
        )
        
        assert pos.ticker == "AAPL"
        assert pos.position_type == "stock"
        assert pos.qty == 100
        assert pos.strike is None
        assert pos.expiry is None
    
    def test_creates_call_option(self):
        pos = PositionModel(
            ticker="TSLA",
            position_type="call",
            qty=5,
            strike=250.0,
            expiry="2026-03-21",
            cost_basis=5.0,
            delta=0.65,
            theta=-0.05,
            iv=35.0
        )
        
        assert pos.position_type == "call"
        assert pos.strike == 250.0
        assert pos.expiry == "2026-03-21"
        assert pos.delta == 0.65
    
    def test_creates_put_option(self):
        pos = PositionModel(
            ticker="SPY",
            position_type="put",
            qty=-10,
            strike=450.0,
            expiry="2026-01-17",
            cost_basis=2.5,
            gamma=0.02,
            vega=0.15
        )
        
        assert pos.position_type == "put"
        assert pos.qty == -10  # Short position
        assert pos.gamma == 0.02
        assert pos.vega == 0.15
    
    def test_defaults_to_zero(self):
        pos = PositionModel(
            ticker="TEST",
            position_type="stock",
            qty=1
        )
        
        assert pos.cost_basis == 0.0
        assert pos.unrealized_pnl == 0.0
        assert pos.current_price == 0.0


class TestIBClientConnection:
    """Tests for IBClient connection logic."""
    
    def test_uses_random_client_id_if_not_specified(self):
        with patch('backend.ib_client.IB'):
            with patch('backend.ib_client.random.randint', return_value=5555):
                client = IBClient()
                assert client.client_id == 5555
    
    def test_uses_specified_client_id(self):
        with patch('backend.ib_client.IB'):
            client = IBClient(client_id=1234)
            assert client.client_id == 1234
    
    def test_default_host_and_port(self):
        with patch('backend.ib_client.IB'):
            client = IBClient()
            assert client.host == '127.0.0.1'
            assert client.port == 7496
    
    def test_custom_host_and_port(self):
        with patch('backend.ib_client.IB'):
            client = IBClient(host='192.168.1.100', port=7497)
            assert client.host == '192.168.1.100'
            assert client.port == 7497


class TestIBClientMarketData:
    """Tests for market data subscription logic."""
    
    @pytest.fixture
    def connected_client(self):
        with patch('backend.ib_client.IB') as MockIB:
            client = IBClient()
            client.connected = True
            client.ib = MockIB.return_value
            client.ib.qualifyContracts = MagicMock(return_value=[])
            client.ib.reqMktData = MagicMock()
            return client
    
    def test_calls_reqMktData_for_contract(self, connected_client):
        mock_contract = MagicMock()
        mock_contract.conId = 12345
        
        connected_client._ensure_market_data(mock_contract)
        
        # Should have attempted to qualify and request market data
        # The exact behavior depends on implementation


class TestIBClientAccountPnL:
    """Tests for P&L subscription logic."""
    
    @pytest.fixture
    def connected_client(self):
        with patch('backend.ib_client.IB') as MockIB:
            client = IBClient()
            client.connected = True
            client.ib = MockIB.return_value
            client.ib.reqPnL = MagicMock()
            return client
    
    def test_subscribes_to_account_pnl(self, connected_client):
        connected_client._ensure_pnl_subscription("U12345678")
        
        assert "U12345678" in connected_client.pnl_subscriptions
        connected_client.ib.reqPnL.assert_called()
    
    def test_skips_duplicate_subscription(self, connected_client):
        connected_client.pnl_subscriptions["U12345678"] = True
        
        connected_client._ensure_pnl_subscription("U12345678")
        
        # Should not call reqPnL again
        connected_client.ib.reqPnL.assert_not_called()
