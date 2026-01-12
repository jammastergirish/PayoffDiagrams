/**
 * Tests for Black-Scholes option pricing functions.
 * 
 * Tests cover:
 * - cdf: Cumulative distribution function
 * - pdf: Probability density function
 * - blackScholes: Option pricing formula
 * - calculateGreeks: Delta, Gamma, Theta, Vega, Rho
 */

import { describe, it, expect } from 'vitest';
import { cdf, pdf, blackScholes, calculateGreeks } from '@/lib/black-scholes';

describe('Standard Normal CDF', () => {
  it('should return 0.5 for x=0', () => {
    expect(cdf(0)).toBeCloseTo(0.5, 4);
  });

  it('should return ~0.8413 for x=1 (one std dev)', () => {
    expect(cdf(1)).toBeCloseTo(0.8413, 3);
  });

  it('should return ~0.1587 for x=-1 (one std dev negative)', () => {
    expect(cdf(-1)).toBeCloseTo(0.1587, 3);
  });

  it('should approach 1 for large positive x', () => {
    expect(cdf(4)).toBeGreaterThan(0.99);
    expect(cdf(6)).toBeCloseTo(1, 6);
  });

  it('should approach 0 for large negative x', () => {
    expect(cdf(-4)).toBeLessThan(0.01);
    expect(cdf(-6)).toBeCloseTo(0, 6);
  });
});

describe('Standard Normal PDF', () => {
  it('should peak at x=0', () => {
    expect(pdf(0)).toBeCloseTo(0.3989, 3);
  });

  it('should be symmetric around 0', () => {
    expect(pdf(1)).toBeCloseTo(pdf(-1), 6);
    expect(pdf(2)).toBeCloseTo(pdf(-2), 6);
  });

  it('should approach 0 for large |x|', () => {
    expect(pdf(5)).toBeLessThan(0.001);
    expect(pdf(-5)).toBeLessThan(0.001);
  });
});

describe('Black-Scholes Option Pricing', () => {
  // Standard test case: S=100, K=100, T=1yr, r=5%, sigma=20%
  const S = 100;
  const K = 100;
  const T = 1;
  const r = 0.05;
  const sigma = 0.20;

  it('should price ATM call option correctly', () => {
    const callPrice = blackScholes('call', S, K, T, r, sigma);
    // Expected ~10.45 for these parameters
    expect(callPrice).toBeGreaterThan(9);
    expect(callPrice).toBeLessThan(12);
  });

  it('should price ATM put option correctly', () => {
    const putPrice = blackScholes('put', S, K, T, r, sigma);
    // Expected ~5.57 for these parameters (put-call parity)
    expect(putPrice).toBeGreaterThan(4);
    expect(putPrice).toBeLessThan(7);
  });

  it('should satisfy put-call parity', () => {
    const callPrice = blackScholes('call', S, K, T, r, sigma);
    const putPrice = blackScholes('put', S, K, T, r, sigma);
    
    // Put-Call Parity: C - P = S - K * e^(-rT)
    const lhs = callPrice - putPrice;
    const rhs = S - K * Math.exp(-r * T);
    
    expect(lhs).toBeCloseTo(rhs, 4);
  });

  it('should return intrinsic value at expiration (T=0)', () => {
    // ITM call
    expect(blackScholes('call', 110, 100, 0, r, sigma)).toBeCloseTo(10, 4);
    // OTM call
    expect(blackScholes('call', 90, 100, 0, r, sigma)).toBeCloseTo(0, 4);
    // ITM put
    expect(blackScholes('put', 90, 100, 0, r, sigma)).toBeCloseTo(10, 4);
    // OTM put
    expect(blackScholes('put', 110, 100, 0, r, sigma)).toBeCloseTo(0, 4);
  });

  it('should handle zero volatility', () => {
    // With zero vol, option price should be discounted intrinsic value
    const callPrice = blackScholes('call', 110, 100, 1, 0.05, 0);
    // S=110, K*e^(-rT) = 100*e^(-0.05) ≈ 95.12
    // Intrinsic = 110 - 95.12 = 14.88
    expect(callPrice).toBeCloseTo(110 - 100 * Math.exp(-0.05), 2);
  });

  it('should increase with volatility', () => {
    const lowVol = blackScholes('call', 100, 100, 1, 0.05, 0.10);
    const highVol = blackScholes('call', 100, 100, 1, 0.05, 0.40);
    
    expect(highVol).toBeGreaterThan(lowVol);
  });

  it('should increase with time to expiry', () => {
    const shortTime = blackScholes('call', 100, 100, 0.25, 0.05, 0.20);
    const longTime = blackScholes('call', 100, 100, 1, 0.05, 0.20);
    
    expect(longTime).toBeGreaterThan(shortTime);
  });
});

describe('Greek Calculations', () => {
  const S = 100;
  const K = 100;
  const T = 0.25; // 3 months
  const r = 0.05;
  const sigma = 0.20;

  describe('Call Option Greeks', () => {
    const greeks = calculateGreeks('call', S, K, T, r, sigma);

    it('should have delta between 0 and 1', () => {
      expect(greeks.delta).toBeGreaterThan(0);
      expect(greeks.delta).toBeLessThan(1);
      // ATM call should have delta ~0.5
      expect(greeks.delta).toBeCloseTo(0.54, 1);
    });

    it('should have positive gamma', () => {
      expect(greeks.gamma).toBeGreaterThan(0);
    });

    it('should have negative theta (time decay)', () => {
      expect(greeks.theta).toBeLessThan(0);
    });

    it('should have positive vega', () => {
      expect(greeks.vega).toBeGreaterThan(0);
    });

    it('should have positive rho for calls', () => {
      expect(greeks.rho).toBeGreaterThan(0);
    });
  });

  describe('Put Option Greeks', () => {
    const greeks = calculateGreeks('put', S, K, T, r, sigma);

    it('should have delta between -1 and 0', () => {
      expect(greeks.delta).toBeGreaterThan(-1);
      expect(greeks.delta).toBeLessThan(0);
      // ATM put should have delta ~-0.5
      expect(greeks.delta).toBeCloseTo(-0.46, 1);
    });

    it('should have same gamma as call', () => {
      const callGreeks = calculateGreeks('call', S, K, T, r, sigma);
      expect(greeks.gamma).toBeCloseTo(callGreeks.gamma, 6);
    });

    it('should have same vega as call', () => {
      const callGreeks = calculateGreeks('call', S, K, T, r, sigma);
      expect(greeks.vega).toBeCloseTo(callGreeks.vega, 6);
    });

    it('should have negative rho for puts', () => {
      expect(greeks.rho).toBeLessThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle at-expiry options (T=0)', () => {
      const greeks = calculateGreeks('call', 110, 100, 0, 0.05, 0.20);
      expect(greeks.delta).toBe(1); // ITM call
      expect(greeks.gamma).toBe(0);
      expect(greeks.theta).toBe(0);
      expect(greeks.vega).toBe(0);
    });

    it('should handle deep ITM call', () => {
      const greeks = calculateGreeks('call', 150, 100, 0.25, 0.05, 0.20);
      expect(greeks.delta).toBeGreaterThan(0.95);
    });

    it('should handle deep OTM call', () => {
      const greeks = calculateGreeks('call', 50, 100, 0.25, 0.05, 0.20);
      expect(greeks.delta).toBeLessThan(0.05);
    });
  });
});
