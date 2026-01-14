/**
 * Tests for the getStrikeQuote helper function.
 * 
 * This function handles the JavaScript/Python string key mismatch issue:
 * - Python's str(50.0) = "50.0" (keeps the .0)
 * - JavaScript's String(50.0) = "50" (drops the .0)
 * 
 * The helper tries multiple key formats to find strike data.
 */

import { describe, it, expect } from 'vitest';

// Re-implement the helper for testing (matches implementation in payoff-dashboard.tsx)
function getStrikeQuote(
  chainData: Record<string, Record<string, unknown>> | undefined,
  expiry: string,
  strike: number
): unknown {
  if (!chainData?.[expiry]) return undefined;
  const data = chainData[expiry];
  
  // Try direct number key (won't work for integers due to JS string coercion)
  if (data[strike] !== undefined) return data[strike];
  
  // Try JavaScript's String(strike) - works for 50.5 -> "50.5", but 50.0 -> "50"
  const jsKey = String(strike);
  if (data[jsKey] !== undefined) return data[jsKey];
  
  // Try Python's str() format: 50.0 -> "50.0" (keeps one decimal place for integers)
  // This is the key format the backend now uses
  const pyKey = Number.isInteger(strike) ? `${strike}.0` : String(strike);
  if (data[pyKey] !== undefined) return data[pyKey];
  
  // Try toFixed(2) format: 50 -> "50.00"
  const fixedKey = strike.toFixed(2);
  if (data[fixedKey] !== undefined) return data[fixedKey];
  
  return undefined;
}

describe('getStrikeQuote', () => {
  const mockQuote = { bid: 1.50, ask: 1.55, last: 1.52 };
  
  describe('Python str() format keys (backend format)', () => {
    it('should find integer strike with "50.0" key format', () => {
      const chainData = {
        '2026-02-13': {
          '50.0': mockQuote,
          '50.5': { ...mockQuote, bid: 1.40 },
        }
      };
      
      const result = getStrikeQuote(chainData, '2026-02-13', 50);
      expect(result).toEqual(mockQuote);
    });

    it('should find non-integer strike with "50.5" key format', () => {
      const chainData = {
        '2026-02-13': {
          '50.0': mockQuote,
          '50.5': { ...mockQuote, bid: 1.40 },
        }
      };
      
      const result = getStrikeQuote(chainData, '2026-02-13', 50.5);
      expect(result).toEqual({ ...mockQuote, bid: 1.40 });
    });

    it('should handle multiple integer strikes', () => {
      const chainData = {
        '2026-02-13': {
          '49.0': { bid: 2.00 },
          '50.0': { bid: 1.50 },
          '51.0': { bid: 1.00 },
        }
      };
      
      expect(getStrikeQuote(chainData, '2026-02-13', 49)).toEqual({ bid: 2.00 });
      expect(getStrikeQuote(chainData, '2026-02-13', 50)).toEqual({ bid: 1.50 });
      expect(getStrikeQuote(chainData, '2026-02-13', 51)).toEqual({ bid: 1.00 });
    });
  });

  describe('JavaScript String() format keys (fallback)', () => {
    it('should find strike with JS string key as fallback', () => {
      // This simulates data keyed with JavaScript's String() behavior
      const chainData = {
        '2026-02-13': {
          '50': mockQuote, // JS String(50) format
        }
      };
      
      const result = getStrikeQuote(chainData, '2026-02-13', 50);
      expect(result).toEqual(mockQuote);
    });
  });

  describe('toFixed(2) format keys (fallback)', () => {
    it('should find strike with toFixed(2) key format', () => {
      const chainData = {
        '2026-02-13': {
          '50.00': mockQuote, // toFixed(2) format
        }
      };
      
      const result = getStrikeQuote(chainData, '2026-02-13', 50);
      expect(result).toEqual(mockQuote);
    });
  });

  describe('edge cases', () => {
    it('should return undefined for missing expiry', () => {
      const chainData = {
        '2026-02-13': { '50.0': mockQuote }
      };
      
      const result = getStrikeQuote(chainData, '2026-02-20', 50);
      expect(result).toBeUndefined();
    });

    it('should return undefined for missing strike', () => {
      const chainData = {
        '2026-02-13': { '50.0': mockQuote }
      };
      
      const result = getStrikeQuote(chainData, '2026-02-13', 55);
      expect(result).toBeUndefined();
    });

    it('should return undefined for undefined chainData', () => {
      const result = getStrikeQuote(undefined, '2026-02-13', 50);
      expect(result).toBeUndefined();
    });

    it('should handle zero strike price', () => {
      const chainData = {
        '2026-02-13': { '0.0': mockQuote }
      };
      
      const result = getStrikeQuote(chainData, '2026-02-13', 0);
      expect(result).toEqual(mockQuote);
    });

    it('should handle high precision decimal strikes', () => {
      const chainData = {
        '2026-02-13': { '50.25': mockQuote }
      };
      
      const result = getStrikeQuote(chainData, '2026-02-13', 50.25);
      expect(result).toEqual(mockQuote);
    });
  });
});
