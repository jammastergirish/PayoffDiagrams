
import { Position, calculateMaxRiskReward } from '../lib/payoff-utils';

function assert(condition: boolean, message: string) {
    if (!condition) {
        console.error(`❌ FAILS: ${message}`);
        process.exit(1);
    } else {
        console.log(`✅ PASS: ${message}`);
    }
}

function testLongStock() {
    console.log('\n--- Testing Long Stock ---');
    const positions: Position[] = [
        { ticker: 'AAPL', position_type: 'stock', qty: 100, cost_basis: 150 }
    ];
    const { maxProfit, maxLoss } = calculateMaxRiskReward(positions);
    
    assert(maxProfit === Infinity, `Long Stock Max Profit should be Infinity, got ${maxProfit}`);
    assert(Math.abs(maxLoss - (-150 * 100)) < 0.01, `Long Stock Max Loss should be -15000, got ${maxLoss}`);
}

function testShortStock() {
    console.log('\n--- Testing Short Stock ---');
    const positions: Position[] = [
        { ticker: 'AAPL', position_type: 'stock', qty: -100, cost_basis: 150 }
    ];
    const { maxProfit, maxLoss } = calculateMaxRiskReward(positions);
    
    assert(Math.abs(maxProfit - (150 * 100)) < 0.01, `Short Stock Max Profit should be 15000, got ${maxProfit}`);
    assert(maxLoss === -Infinity, `Short Stock Max Loss should be -Infinity, got ${maxLoss}`);
}

function testLongCall() {
    console.log('\n--- Testing Long Call ---');
    // Long 1 Call Strike 150, Cost 5.00
    const positions: Position[] = [
        { ticker: 'AAPL', position_type: 'call', qty: 1, strike: 150, cost_basis: 5.00 }
    ];
    const { maxProfit, maxLoss } = calculateMaxRiskReward(positions);

    assert(maxProfit === Infinity, `Long Call Max Profit should be Infinity, got ${maxProfit}`);
    // Max Loss = -Premium * 100 = -500
    assert(Math.abs(maxLoss - (-500)) < 0.01, `Long Call Max Loss should be -500, got ${maxLoss}`);
}

function testShortCall() {
    console.log('\n--- Testing Short Call ---');
    // Short 1 Call Strike 150, Cost 5.00 (Received 5.00)
    // Note: In our system, cost_basis is usually positive for entry. 
    // If we sold it, cost_basis might be recorded. P&L = (Entry - Exit) * Qty ?
    // Let's check calculatePnl logc: 
    //   pos.position_type === 'call'
    //   intrinsic = Math.max(0, prices[i] - strike);
    //   totalPnl[i] += (intrinsic - costBasis) * qty * 100;
    // If Short Call: qty = -1. Cost Basis = 5.00 (price we sold at?).
    // Wait, usually cost_basis is the price we opened the trade at.
    // If I sold at 5.00, qty is -1. 
    // If price = 0, intrinsic = 0. Pnl = (0 - 5) * -1 * 100 = 500. Correct.
    // If price = Infinity, intrinsic = Inf. Pnl = (Inf - 5) * -1 * 100 = -Inf. Correct.
    
    const positions: Position[] = [
        { ticker: 'AAPL', position_type: 'call', qty: -1, strike: 150, cost_basis: 5.00 }
    ];
    const { maxProfit, maxLoss } = calculateMaxRiskReward(positions);

    assert(Math.abs(maxProfit - 500) < 0.01, `Short Call Max Profit should be 500, got ${maxProfit}`);
    assert(maxLoss === -Infinity, `Short Call Max Loss should be -Infinity, got ${maxLoss}`);
}

function testSyntheticLong() {
    console.log('\n--- Testing Synthetic Long ---');
    // Long Call Strike 100, Cost 10
    // Short Put Strike 100, Cost 10
    // Net Cost = 0.
    // Equivalent to Long Stock at 100.
    const positions: Position[] = [
        { ticker: 'AAPL', position_type: 'call', qty: 1, strike: 100, cost_basis: 10 },
        { ticker: 'AAPL', position_type: 'put', qty: -1, strike: 100, cost_basis: 10 }
    ];
    const { maxProfit, maxLoss } = calculateMaxRiskReward(positions);
    
    assert(maxProfit === Infinity, `Synthetic Long Max Profit should be Infinity, got ${maxProfit}`);
    // Max Loss for Synthetic Long @ 100 is at price 0.
    // Call: (0 - 100 - 10) * 1 * 100 = -11000? No. Intrinsic of call at 0 is 0. Pnl = (0 - 10) * 100 = -1000.
    // Put: Intrinsic at 0 is 100. Pnl = (100 - 10) * -1 * 100 = -9000.
    // Total Loss = -10000. (Equivalent to stock going 100 -> 0).
    assert(Math.abs(maxLoss - (-10000)) < 0.01, `Synthetic Long Max Loss should be -10000, got ${maxLoss}`);
}

testLongStock();
testShortStock();
testLongCall();
testShortCall();
testSyntheticLong();
console.log('\n✅ All tests passed!');
