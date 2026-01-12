import pytest
from unittest.mock import MagicMock, patch
from backend.ib_client import IBClient

# Mock ib_insync classes
class MockContract:
    def __init__(self, symbol='AAPL', secType='STK', conId=1, right='?', strike=0, 
                 lastTradeDateOrContractMonth='', exchange='SMART', primaryExchange='NASDAQ',
                 currency='USD', localSymbol='AAPL', tradingClass='AAPL'):
        self.symbol = symbol
        self.secType = secType
        self.conId = conId
        self.right = right
        self.strike = strike
        self.lastTradeDateOrContractMonth = lastTradeDateOrContractMonth
        self.exchange = exchange
        self.primaryExchange = primaryExchange
        self.currency = currency
        self.localSymbol = localSymbol
        self.tradingClass = tradingClass

class MockPosition:
    def __init__(self, contract, position=100, avgCost=150.0, account='TEST123'):
        self.contract = contract
        self.position = position
        self.avgCost = avgCost
        self.account = account

class MockPortfolioItem:
    def __init__(self, contract, unrealizedPNL=500.0, marketPrice=100.0, marketValue=10000.0, position=100, account='TEST123'):
        self.contract = contract
        self.unrealizedPNL = unrealizedPNL
        self.marketPrice = marketPrice
        self.marketValue = marketValue
        self.position = position
        self.account = account

@pytest.fixture
def mock_ib():
    with patch('backend.ib_client.IB') as MockIB:
        ib_instance = MockIB.return_value
        ib_instance.isConnected.return_value = True
        yield ib_instance

def test_get_positions_stock(mock_ib):
    # Setup
    client = IBClient()
    client.connected = True
    client.ib = mock_ib

    # Mock Data
    contract = MockContract(symbol='NVDA', secType='STK')
    pos = MockPosition(contract, position=10, avgCost=400.0)
    
    mock_ib.positions.return_value = [pos]
    mock_ib.portfolio.return_value = []

    # Execute
    results = client.get_positions()

    # Assert
    positions = results['positions']
    assert len(positions) == 1
    assert positions[0]['ticker'] == 'NVDA'
    assert positions[0]['position_type'] == 'stock'
    assert positions[0]['qty'] == 10
    assert positions[0]['cost_basis'] == 400.0

def test_get_positions_option(mock_ib):
    # Setup
    client = IBClient()
    client.connected = True
    client.ib = mock_ib

    # Mock Data
    contract = MockContract(
        symbol='SPY', 
        secType='OPT', 
        conId=123, 
        right='C', 
        strike=450, 
        lastTradeDateOrContractMonth='20250117'
    )
    pos = MockPosition(contract, position=5, avgCost=2.5)
    port_item = MockPortfolioItem(contract, unrealizedPNL=1250.0)
    
    mock_ib.positions.return_value = [pos]
    mock_ib.portfolio.return_value = [port_item]

    # Execute
    results = client.get_positions()

    # Assert
    positions = results['positions']
    assert len(positions) == 1
    assert positions[0]['ticker'] == 'SPY'
    assert positions[0]['position_type'] == 'call'
    assert positions[0]['expiry'] == '2025-01-17'
    assert positions[0]['unrealized_pnl'] == 1250.0
