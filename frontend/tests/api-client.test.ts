/**
 * Tests for API client functions - daily snapshot.
 * 
 * Tests cover:
 * - fetchDailySnapshot: Get price and daily change
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after mocking
import { fetchDailySnapshot } from '../lib/api-client';

describe('Daily Snapshot API', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchDailySnapshot', () => {
    it('should return price and change data', async () => {
      const mockSnapshot = {
        symbol: 'AAPL',
        current_price: 175.50,
        previous_close: 173.00,
        change: 2.50,
        change_pct: 1.45,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSnapshot,
      });

      const result = await fetchDailySnapshot('AAPL');

      expect(result).toEqual(mockSnapshot);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/snapshot/AAPL')
      );
    });

    it('should return null on error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const result = await fetchDailySnapshot('INVALID');

      expect(result).toBeNull();
    });

    it('should handle negative change', async () => {
      const mockSnapshot = {
        symbol: 'TSLA',
        current_price: 195.00,
        previous_close: 200.00,
        change: -5.00,
        change_pct: -2.50,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSnapshot,
      });

      const result = await fetchDailySnapshot('TSLA');

      expect(result?.change).toBe(-5.00);
      expect(result?.change_pct).toBe(-2.50);
    });
  });
});
