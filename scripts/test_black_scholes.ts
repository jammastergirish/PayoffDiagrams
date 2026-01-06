
import { blackScholes, calculateGreeks } from '../lib/black-scholes';

function assert(condition: boolean, message: string) {
    if (!condition) {
        console.error(`❌ FAILS: ${message}`);
        process.exit(1);
    } else {
        console.log(`✅ PASS: ${message}`);
    }
}

function assertClose(actual: number, expected: number, tolerance: number = 0.01, message: string) {
    if (Math.abs(actual - expected) > tolerance) {
        console.error(`❌ FAILS: ${message} (Expected ${expected}, Got ${actual})`);
        process.exit(1);
    } else {
        console.log(`✅ PASS: ${message}`);
    }
}

function testCallPrice() {
    console.log('\n--- Testing Call Price ---');
    // Example from Investopedia or similar
    // S=100, K=100, T=1 (1 yr), r=0.05, sigma=0.20
    const price = blackScholes('call', 100, 100, 1, 0.05, 0.20);
    // Expected approx 10.45
    assertClose(price, 10.45, 0.01, 'Call Price (ATM)');
}

function testPutPrice() {
    console.log('\n--- Testing Put Price ---');
    // S=100, K=100, T=1, r=0.05, sigma=0.20
    const price = blackScholes('put', 100, 100, 1, 0.05, 0.20);
    // Put-Call Parity: C - P = S - K*e^(-rT)
    // 10.45 - P = 100 - 100*e^(-0.05) = 100 - 95.12 = 4.88
    // P should be approx 10.45 - 4.88 = 5.57
    assertClose(price, 5.57, 0.01, 'Put Price (ATM)');
}

function testGreeks() {
    console.log('\n--- Testing Greeks ---');
    const greeks = calculateGreeks('call', 100, 100, 1, 0.05, 0.20);
    // Delta ATM Call approx 0.6 (due to drift) or close to 0.5
    // d1 = (0 + (0.05 + 0.02) * 1) / 0.2 = 0.07 / 0.2 = 0.35
    // N(0.35) approx 0.6368
    assertClose(greeks.delta, 0.6368, 0.01, 'ATM Call Delta');
    
    // Vega: S * sqrt(T) * N'(d1) / 100
    // N'(0.35) = 0.3752
    // Vega = 100 * 1 * 0.3752 / 100 = 0.3752
    assertClose(greeks.vega, 0.3752, 0.01, 'ATM Call Vega'); // Change per 1% vol
}

testCallPrice();
testPutPrice();
testGreeks();
console.log('\n✅ All tests passed!');
