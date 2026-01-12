/**
 * Tests for API client functions - watchlist and snapshot.
 * 
 * Tests cover:
 * - fetchWatchlist: Retrieve watchlist tickers
 * - addToWatchlist: Add new ticker
 * - removeFromWatchlist: Remove ticker
 * - fetchDailySnapshot: Get price and daily change
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after mocking
import { 
  fetchWatchlist, 
  addToWatchlist, 
  removeFromWatchlist, 
  fetchDailySnapshot 
} from '../lib/api-client';

describe('Watchlist API Functions', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchWatchlist', () => {
    it('should return tickers from API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tickers: ['AAPL', 'MSFT', 'GOOG'] }),
      });

      const result = await fetchWatchlist();

      expect(result).toEqual(['AAPL', 'MSFT', 'GOOG']);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/watchlist')
      );
    });

    it('should return empty array on error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      });

      const result = await fetchWatchlist();

      expect(result).toEqual([]);
    });

    it('should handle network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchWatchlist();

      expect(result).toEqual([]);
    });
  });

  describe('addToWatchlist', () => {
    it('should POST ticker and return updated list', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tickers: ['AAPL', 'TSLA'] }),
      });

      const result = await addToWatchlist('TSLA');

      expect(result).toEqual(['AAPL', 'TSLA']);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/watchlist'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ ticker: 'TSLA' }),
        })
      );
    });

    it('should return empty array on failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const result = await addToWatchlist('INVALID');

      expect(result).toEqual([]);
    });
  });

  describe('removeFromWatchlist', () => {
    it('should DELETE ticker and return updated list', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tickers: ['MSFT'] }),
      });

      const result = await removeFromWatchlist('AAPL');

      expect(result).toEqual(['MSFT']);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/watchlist/AAPL'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('should URL encode special characters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tickers: [] }),
      });

      await removeFromWatchlist('BRK.B');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('BRK.B'),
        expect.anything()
      );
    });
  });
});

describe('Daily Snapshot API', () => {
  beforeEach(() => {
    mockFetch.mockClear();
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
