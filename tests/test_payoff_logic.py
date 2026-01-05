
import pytest
import numpy as np
from main import Position, calculate_pnl, get_breakevens, analyze_risk_reward

def test_single_long_call():
    # Long Call 100 Strike, Cost 5
    # Be = 105
    pos = Position(ticker="TEST", position_type="call", qty=1, strike=100, cost_basis=5.0)
    
    # Test Break Even
    prices = np.linspace(90, 120, 100)
    pnl = calculate_pnl([pos], prices)
    breakevens = get_breakevens(prices, pnl)
    
    assert len(breakevens) == 1
    assert np.isclose(breakevens[0], 105.0, atol=0.1)
    
    # Test P&L at specific points
    # At 100: (0 - 5) * 1 = -500
    pnl_at_100 = calculate_pnl([pos], np.array([100.0]))[0]
    assert pnl_at_100 == -500.0
    
    # At 110: (10 - 5) * 1 = +500
    pnl_at_110 = calculate_pnl([pos], np.array([110.0]))[0]
    assert pnl_at_110 == 500.0

def test_single_short_call():
    # Short Call 100 Strike, Cost 5
    # Be = 105
    pos = Position(ticker="TEST", position_type="call", qty=-1, strike=100, cost_basis=5.0)
    
    prices = np.linspace(90, 120, 100)
    pnl = calculate_pnl([pos], prices)
    breakevens = get_breakevens(prices, pnl)
    
    assert len(breakevens) == 1
    assert np.isclose(breakevens[0], 105.0, atol=0.1)
    
    # Max Profit = Premium Received = 500
    analysis = analyze_risk_reward(pnl)
    assert analysis['max_profit'] == 500.0
    assert analysis['max_loss'] < -1000.0 # Effectively unbounded downside in this range

def test_bull_call_spread():
    # Long Call 100 (Cost 5)
    # Short Call 110 (Cost 2)
    # Net Debit = 3. Max Loss = 300. Max Profit = (10 - 3) * 100 = 700.
    # BE = 100 + 3 = 103.
    pos1 = Position(ticker="TEST", position_type="call", qty=1, strike=100, cost_basis=5.0)
    pos2 = Position(ticker="TEST", position_type="call", qty=-1, strike=110, cost_basis=2.0)
    
    prices = np.linspace(90, 120, 301) # Ensure we hit points nicely
    pnl = calculate_pnl([pos1, pos2], prices)
    breakevens = get_breakevens(prices, pnl)
    
    assert len(breakevens) == 1
    assert np.isclose(breakevens[0], 103.0, atol=0.1)
    
    analysis = analyze_risk_reward(pnl)
    assert np.isclose(analysis['max_loss'], -300.0)
    assert np.isclose(analysis['max_profit'], 700.0)

def test_iron_condor():
    # Neutral strategy.
    # Long Put 90 (Cost 1), Short Put 95 (Cost 2) -> Net Credit 1
    # Short Call 105 (Cost 2), Long Call 110 (Cost 1) -> Net Credit 1
    # Total Credit = 2. Max Profit = 200.
    # Width = 5. Max Loss = (5 - 2) * 100 = 300.
    # BE Lower = 95 - 2 = 93.
    # BE Upper = 105 + 2 = 107.
    
    positions = [
        Position("TEST", "put", 1, strike=90, cost_basis=1.0),
        Position("TEST", "put", -1, strike=95, cost_basis=2.0),
        Position("TEST", "call", -1, strike=105, cost_basis=2.0),
        Position("TEST", "call", 1, strike=110, cost_basis=1.0)
    ]
    
    prices = np.linspace(80, 120, 401)
    pnl = calculate_pnl(positions, prices)
    breakevens = sorted(get_breakevens(prices, pnl))
    
    assert len(breakevens) == 2
    assert np.isclose(breakevens[0], 93.0, atol=0.2)
    assert np.isclose(breakevens[1], 107.0, atol=0.2)
    
    analysis = analyze_risk_reward(pnl)
    assert np.isclose(analysis['max_profit'], 200.0)
    assert np.isclose(analysis['max_loss'], -300.0)

def test_breakeven_interpolation_accuracy():
    # Test linear interpolation accuracy
    prices = np.array([100.0, 102.0])
    pnl = np.array([-100.0, 100.0]) # Zero crossing at 101.0
    
    be = get_breakevens(prices, pnl)
    assert len(be) == 1
    assert be[0] == 101.0

