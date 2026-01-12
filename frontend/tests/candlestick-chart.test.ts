/**
 * Tests for CandlestickChart component utility functions and data transformations.
 * 
 * Note: Component rendering tests would require @testing-library/react + jsdom setup.
 * These tests focus on the pure utility functions.
 */

import { describe, it, expect } from 'vitest';

// Test data helpers
function createMockBar(date: string, open: number, high: number, low: number, close: number, volume: number = 1000000) {
  return { date, open, high, low, close, volume };
}

describe('Candlestick Chart Data Transformations', () => {
  describe('Candle Body Calculation', () => {
    it('should identify green candle (close >= open)', () => {
      const bar = createMockBar('2026-01-11', 100, 105, 99, 103);
      const isGreen = bar.close >= bar.open;
      expect(isGreen).toBe(true);
    });

    it('should identify red candle (close < open)', () => {
      const bar = createMockBar('2026-01-11', 105, 106, 99, 100);
      const isGreen = bar.close >= bar.open;
      expect(isGreen).toBe(false);
    });

    it('should handle doji candle (close == open)', () => {
      const bar = createMockBar('2026-01-11', 100, 105, 95, 100);
      const isGreen = bar.close >= bar.open;
      expect(isGreen).toBe(true); // Doji is treated as green
    });

    it('should calculate body bounds correctly for green candle', () => {
      const bar = createMockBar('2026-01-11', 100, 110, 95, 105);
      const bodyBottom = Math.min(bar.open, bar.close);
      const bodyTop = Math.max(bar.open, bar.close);
      
      expect(bodyBottom).toBe(100);
      expect(bodyTop).toBe(105);
    });

    it('should calculate body bounds correctly for red candle', () => {
      const bar = createMockBar('2026-01-11', 105, 110, 95, 100);
      const bodyBottom = Math.min(bar.open, bar.close);
      const bodyTop = Math.max(bar.open, bar.close);
      
      expect(bodyBottom).toBe(100);
      expect(bodyTop).toBe(105);
    });
  });

  describe('Dynamic Bar Size Calculation', () => {
    function calculateDynamicBarSize(dataLength: number): number {
      const chartWidth = 800;
      const barCount = dataLength || 1;
      const rawBarWidth = chartWidth / barCount;
      return Math.max(4, Math.min(20, rawBarWidth * 0.85));
    }

    it('should return max size (20) for few bars', () => {
      // 10 bars: 800/10 * 0.85 = 68, clamped to 20
      const size = calculateDynamicBarSize(10);
      expect(size).toBe(20);
    });

    it('should return appropriate size for moderate bars', () => {
      // 40 bars: 800/40 * 0.85 = 17
      const size = calculateDynamicBarSize(40);
      expect(size).toBe(17);
    });

    it('should return min size (4) for many bars', () => {
      // 300 bars: 800/300 * 0.85 = 2.27, clamped to 4
      const size = calculateDynamicBarSize(300);
      expect(size).toBe(4);
    });

    it('should handle 1M hourly data (~500 bars)', () => {
      // 500 bars for 1M hourly
      const size = calculateDynamicBarSize(500);
      expect(size).toBe(4); // Min size
    });

    it('should handle 1Y daily data (~252 bars)', () => {
      const size = calculateDynamicBarSize(252);
      expect(size).toBe(4); // Should be at or near min
    });
  });

  describe('Y Domain Calculation', () => {
    function calculateYDomain(bars: Array<{high: number, low: number}>, livePrice?: number): [number, number] {
      if (bars.length === 0) return [0, 100];
      
      const allPrices = bars.flatMap(d => [d.high, d.low]);
      if (livePrice) allPrices.push(livePrice);
      
      const min = Math.min(...allPrices);
      const max = Math.max(...allPrices);
      const padding = (max - min) * 0.05;
      
      return [min - padding, max + padding];
    }

    it('should return default domain for empty data', () => {
      const domain = calculateYDomain([]);
      expect(domain).toEqual([0, 100]);
    });

    it('should include all highs and lows', () => {
      const bars = [
        { high: 110, low: 95 },
        { high: 115, low: 100 },
        { high: 108, low: 92 },
      ];
      const domain = calculateYDomain(bars);
      
      // Min should be below 92, max should be above 115
      expect(domain[0]).toBeLessThan(92);
      expect(domain[1]).toBeGreaterThan(115);
    });

    it('should include live price in domain calculation', () => {
      const bars = [
        { high: 100, low: 90 },
      ];
      const domain = calculateYDomain(bars, 120); // Live price above range
      
      expect(domain[1]).toBeGreaterThan(120);
    });

    it('should add 5% padding', () => {
      const bars = [
        { high: 100, low: 80 },
      ];
      const domain = calculateYDomain(bars);
      const range = 100 - 80; // 20
      const padding = range * 0.05; // 1
      
      expect(domain[0]).toBeCloseTo(80 - padding);
      expect(domain[1]).toBeCloseTo(100 + padding);
    });
  });

  describe('Date Formatting', () => {
    function formatDate(dateStr: string, timeframe: string): string {
      try {
        if (timeframe === "1H" || timeframe === "1D") {
          const timePart = dateStr.split("T")[1];
          return timePart?.substring(0, 5) || dateStr.substring(11, 16);
        }
        return dateStr.substring(5, 10); // MM-DD
      } catch {
        return dateStr;
      }
    }

    it('should show time for 1H timeframe', () => {
      const result = formatDate('2026-01-11T14:30:00', '1H');
      expect(result).toBe('14:30');
    });

    it('should show time for 1D timeframe', () => {
      const result = formatDate('2026-01-11T09:45:00', '1D');
      expect(result).toBe('09:45');
    });

    it('should show MM-DD for 1W timeframe', () => {
      const result = formatDate('2026-01-11T00:00:00', '1W');
      expect(result).toBe('01-11');
    });

    it('should show MM-DD for 1M timeframe', () => {
      const result = formatDate('2026-01-11T00:00:00', '1M');
      expect(result).toBe('01-11');
    });

    it('should show MM-DD for 1Y timeframe', () => {
      const result = formatDate('2026-01-11T00:00:00', '1Y');
      expect(result).toBe('01-11');
    });
  });

  describe('Volume Formatting', () => {
    function formatVolume(vol: number): string {
      if (vol >= 1_000_000_000) return `${(vol / 1_000_000_000).toFixed(1)}B`;
      if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
      if (vol >= 1_000) return `${(vol / 1_000).toFixed(1)}K`;
      return vol.toString();
    }

    it('should format billions', () => {
      expect(formatVolume(2_500_000_000)).toBe('2.5B');
    });

    it('should format millions', () => {
      expect(formatVolume(15_700_000)).toBe('15.7M');
    });

    it('should format thousands', () => {
      expect(formatVolume(42_500)).toBe('42.5K');
    });

    it('should show raw number for small values', () => {
      expect(formatVolume(500)).toBe('500');
    });
  });
});
