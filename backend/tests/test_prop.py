from hypothesis import given, strategies as st
from backend.ib_client import PositionModel

# Strategies for generating random position data
ticker_st = st.text(min_size=1, max_size=5, alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd')))
qty_st = st.integers(min_value=-1000, max_value=1000)
price_st = st.floats(min_value=0.01, max_value=10000.0)

@given(ticker=ticker_st, qty=qty_st, price=price_st)
def test_position_model_validity(ticker, qty, price):
    # Property: A PositionModel can always be instantiated with valid types
    # regardless of the specific values (within reason)
    pos = PositionModel(
        ticker=ticker,
        position_type='stock',
        qty=qty,
        cost_basis=price
    )
    
    assert pos.ticker == ticker
    assert pos.qty == qty
    assert pos.cost_basis == price
    assert pos.position_type == 'stock'

@given(qty=qty_st)
def test_position_qty_invariants(qty):
    # Property: Quantity logic remains consistent
    pos = PositionModel(ticker="TEST", position_type="stock", qty=qty)
    
    # Example invariant: If we have a position, qty is not None
    assert pos.qty is not None
