
export const ACCURACY = 1.0e-12;

/**
 * Standard Normal Cumulative Distribution Function
 * Uses the approximation from "Handbook of Mathematical Functions" by Abramowitz and Stegun.
 */
export function cdf(x: number): number {
    if (x < 0) {
        return 1 - cdf(-x);
    }
    const b1 = 0.319381530;
    const b2 = -0.356563782;
    const b3 = 1.781477937;
    const b4 = -1.821255978;
    const b5 = 1.330274429;
    const p = 0.2316419;
    const c = 0.39894228;

    const t = 1 / (1 + p * x);
    return 1 - c * Math.exp(-x * x / 2) * ((((b5 * t + b4) * t + b3) * t + b2) * t + b1) * t;
}

/**
 * Standard Normal Probability Density Function
 */
export function pdf(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Black-Scholes Option Pricing Formula
 * @param type 'call' or 'put'
 * @param S Current Stock Price
 * @param K Strike Price
 * @param T Time to Expiration (in years)
 * @param r Risk-free Interest Rate (decimal, e.g., 0.05 for 5%)
 * @param sigma Implied Volatility (decimal, e.g., 0.20 for 20%)
 */
export function blackScholes(
    type: 'call' | 'put',
    S: number,
    K: number,
    T: number,
    r: number,
    sigma: number
): number {
    if (T <= 0) {
        if (type === 'call') return Math.max(0, S - K);
        return Math.max(0, K - S);
    }
    if (sigma === 0) {
        // Deterministic payoff discounted
        const discount = Math.exp(-r * T);
        if (type === 'call') return Math.max(0, S - K * discount);
        return Math.max(0, K * discount - S);
    }

    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);

    if (type === 'call') {
        return S * cdf(d1) - K * Math.exp(-r * T) * cdf(d2);
    } else {
        return K * Math.exp(-r * T) * cdf(-d2) - S * cdf(-d1);
    }
}

/**
 * Calculate basic Greeks
 */
export function calculateGreeks(
    type: 'call' | 'put',
    S: number,
    K: number,
    T: number,
    r: number,
    sigma: number
) {
     if (T <= 0) {
        // At expiry, approximate delta
        const intrinsic = type === 'call' ? (S > K) : (S < K);
        return { delta: intrinsic ? (type === 'call' ? 1 : -1) : 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
    }

    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    const sqrtT = Math.sqrt(T);
    const nd1 = pdf(d1); // N'(d1)

    let delta, theta, rho;
    const gamma = nd1 / (S * sigma * sqrtT);
    const vega = S * sqrtT * nd1 / 100; // Divided by 100 to standard definition (change per 1% vol)

    if (type === 'call') {
        delta = cdf(d1);
        theta = (- (S * sigma * nd1) / (2 * sqrtT) - r * K * Math.exp(-r * T) * cdf(d2)) / 365; // Per day
        rho = K * T * Math.exp(-r * T) * cdf(d2) / 100; // Per 1% rate
    } else {
        delta = cdf(d1) - 1;
        theta = (- (S * sigma * nd1) / (2 * sqrtT) + r * K * Math.exp(-r * T) * cdf(-d2)) / 365; // Per day
        rho = -K * T * Math.exp(-r * T) * cdf(-d2) / 100;
    }

    return { delta, gamma, theta, vega, rho };
}
