
from main import load_positions
import sys

def debug_mu():
    print("Loading positions...")
    positions, stock_prices, is_estimated = load_positions('positions.csv')
    
    print("\nMU Positions:")
    found = False
    for p in positions:
        if p.ticker == 'MU':
            found = True
            print(f"Type: {p.position_type}")
            print(f"Qty: {p.qty}")
            print(f"Strike: {p.strike}")
            print(f"Cost Basis: {p.cost_basis}")
            print(f"Expiry: {p.expiry}")
            print("-" * 20)
            
    if not found:
        print("No MU positions found!")
    else:
        print(f"MU Stock Price: {stock_prices.get('MU', 'Unknown')}")

if __name__ == '__main__':
    debug_mu()
