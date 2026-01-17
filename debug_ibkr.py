import asyncio
import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from backend.brokers.ibkr import IBKRBroker

async def main():
    print("Initializing IBKR Broker...")
    broker = IBKRBroker()
    
    print("Connecting...")
    connected = await broker.connect()
    if not connected:
        print("Failed to connect!")
        return

    print("Connected! Waiting 3 seconds for data...")
    await asyncio.sleep(3)

    print("Fetching positions and summary...")
    data = broker.client.get_positions()
    
    print(f"\nPositions: {len(data['positions'])}")
    print(f"Accounts found: {len(data['summary'])}")
    
    for acc, summary in data['summary'].items():
        print(f"\nAccount: {acc}")
        print(f"Net Liq: {summary['net_liquidation']}")
        print(f"Unrealized: {summary['unrealized_pnl']}")
        print(f"Realized: {summary['realized_pnl']}")
        print(f"Daily: {summary['daily_pnl']}")

    print("\nRaw Wrapper Summary Keys:", len(broker.client.ib.wrapper.acctSummary))
    if len(broker.client.ib.wrapper.acctSummary) > 0:
        print("Sample values:")
        count = 0
        for k, v in broker.client.ib.wrapper.acctSummary.items():
            print(f"{k}: {v}")
            count += 1
            if count > 5: break

    # Broker disconnect handled by script exit usually, but good to be clean
    broker.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
