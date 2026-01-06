
import { calculateTheoreticalPnl, Position } from '../lib/payoff-utils';

function assert(condition: boolean, message: string) {
    if (!condition) {
        console.error(`❌ FAILS: ${message}`);
        process.exit(1);
    } else {
        console.log(`✅ PASS: ${message}`);
    }
}

function testT0Convergence() {
    console.log('\n--- Testing T+0 Convergence ---');
    // Long Call Strike 100.
    const positions: Position[] = [
        { ticker: 'TEST', position_type: 'call', qty: 1, strike: 100, expiry: '2025-01-01', cost_basis: 5, iv: 20 }
    ];
    
    // Scenario 1: Target Date = Expiry Date
    // T+0 P&L should match Intrinsic P&L exactly (or very close)
    const targetDate = new Date('2025-01-01T00:00:00');
    const prices = [80, 90, 100, 110, 120];
    
    const pnl = calculateTheoreticalPnl(positions, prices, targetDate, 0);
    
    // Check price 110: Intrinsic = 10. Cost = 5. PnL = (10-5)*100 = 500.
    const idx110 = 3;
    assert(Math.abs(pnl[idx110] - 500) < 1, `At Expiry, P&L at 110 should be 500, got ${pnl[idx110]}`);
    
    // Check price 90: Intrinsic = 0. Cost = 5. PnL = (0-5)*100 = -500.
    const idx90 = 1;
    assert(Math.abs(pnl[idx90] - (-500)) < 1, `At Expiry, P&L at 90 should be -500, got ${pnl[idx90]}`);
}

function testVegaSensitivity() {
    console.log('\n--- Testing Vega Sensitivity ---');
    // Long Call. Increase IV -> Price should GO UP.
    const positions: Position[] = [
        { ticker: 'TEST', position_type: 'call', qty: 1, strike: 100, expiry: '2026-01-01', cost_basis: 5, iv: 20 }
    ];
    const prices = [100]; // ATM
    const targetDate = new Date('2025-01-01'); // 1 year out
    
    const pnlNormal = calculateTheoreticalPnl(positions, prices, targetDate, 0); // 0% adj
    const pnlHighVol = calculateTheoreticalPnl(positions, prices, targetDate, 0.1); // +10% adj
    
    // Higher Vol => Higher Option Price => Higher PnL (since we are Long)
    assert(pnlHighVol[0] > pnlNormal[0], `Increasing IV should increase Long Call P&L. Normal: ${pnlNormal[0]}, HighVol: ${pnlHighVol[0]}`);
}

function testThetaDecay() {
    console.log('\n--- Testing Theta Decay ---');
    // Long Call. Forward time -> Price should GO DOWN.
    const positions: Position[] = [
        { ticker: 'TEST', position_type: 'call', qty: 1, strike: 100, expiry: '2026-01-01', cost_basis: 5, iv: 20 }
    ];
    const prices = [100];
    
    const date1 = new Date('2025-01-01');
    const date2 = new Date('2025-06-01'); // 6 months closer to expiry
    
    const pnlDate1 = calculateTheoreticalPnl(positions, prices, date1, 0);
    const pnlDate2 = calculateTheoreticalPnl(positions, prices, date2, 0);
    
    assert(pnlDate2[0] < pnlDate1[0], `Time passing should decrease Long Call P&L (Theta burn). Date1: ${pnlDate1[0]}, Date2: ${pnlDate2[0]}`);
}

testT0Convergence();
testVegaSensitivity();
testThetaDecay();
console.log('\n✅ All simulation tests passed!');
