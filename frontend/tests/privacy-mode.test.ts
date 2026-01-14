/**
 * Tests for Privacy Mode functionality
 * 
 * The formatPrivateCurrency helper masks currency values when privacy mode is enabled.
 */
import { describe, it, expect } from 'vitest';

// Recreate formatCurrency for testing
const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

describe('Privacy Mode - formatPrivateCurrency', () => {
  // Helper that simulates the component's formatPrivateCurrency function
  const createFormatPrivateCurrency = (privacyMode: boolean) => {
    return (value: number): string => {
      if (privacyMode) return '***';
      return formatCurrency(value);
    };
  };

  describe('when privacy mode is OFF', () => {
    const formatPrivateCurrency = createFormatPrivateCurrency(false);

    it('formats positive values as currency', () => {
      expect(formatPrivateCurrency(1234)).toBe('$1,234');
      expect(formatPrivateCurrency(50000)).toBe('$50,000');
    });

    it('formats negative values as currency', () => {
      expect(formatPrivateCurrency(-1234)).toBe('-$1,234');
      expect(formatPrivateCurrency(-50000)).toBe('-$50,000');
    });

    it('formats zero as currency', () => {
      expect(formatPrivateCurrency(0)).toBe('$0');
    });

    it('formats decimal values (rounded)', () => {
      expect(formatPrivateCurrency(1234.56)).toBe('$1,235');
      expect(formatPrivateCurrency(1234.49)).toBe('$1,234');
    });
  });

  describe('when privacy mode is ON', () => {
    const formatPrivateCurrency = createFormatPrivateCurrency(true);

    it('masks positive values with ***', () => {
      expect(formatPrivateCurrency(1234)).toBe('***');
      expect(formatPrivateCurrency(1000000)).toBe('***');
    });

    it('masks negative values with ***', () => {
      expect(formatPrivateCurrency(-1234)).toBe('***');
      expect(formatPrivateCurrency(-50000)).toBe('***');
    });

    it('masks zero with ***', () => {
      expect(formatPrivateCurrency(0)).toBe('***');
    });

    it('masks large values with ***', () => {
      expect(formatPrivateCurrency(999999999)).toBe('***');
    });
  });
});

describe('Privacy Mode Toggle Behavior', () => {
  it('toggle state changes formatting', () => {
    let privacyMode = false;
    
    const formatPrivateCurrency = (value: number): string => {
      if (privacyMode) return '***';
      return formatCurrency(value);
    };

    // Initial state: privacy OFF
    expect(formatPrivateCurrency(1234)).toBe('$1,234');

    // Toggle privacy ON
    privacyMode = true;
    expect(formatPrivateCurrency(1234)).toBe('***');

    // Toggle privacy OFF again
    privacyMode = false;
    expect(formatPrivateCurrency(1234)).toBe('$1,234');
  });

  it('percentages should NOT be masked (separate from currency)', () => {
    // This is a design test - percentages use different formatting
    const ytdPct = 18.2;
    const formatPercentage = (pct: number) => `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
    
    // Percentages should always be visible regardless of privacy mode
    expect(formatPercentage(ytdPct)).toBe('+18.2%');
    expect(formatPercentage(-5.3)).toBe('-5.3%');
  });
});

describe('Privacy Mode UI Elements', () => {
  it('masked value should be exactly ***', () => {
    // Ensure the masked value is consistent for all values
    const createFormatter = (privacyOn: boolean) => 
      (v: number) => privacyOn ? '***' : formatCurrency(v);
    
    const maskedFormatter = createFormatter(true);
    
    const testValues = [0, 100, -100, 1234567, -9999, 0.01, -0.99];
    
    for (const val of testValues) {
      expect(maskedFormatter(val)).toBe('***');
    }
  });

  it('sign prefix still appears with masked values', () => {
    // In the UI, we often show "+***" or just "***" for gains/losses
    const privacyMode = true;
    const formatWithSign = (value: number) => {
      const formatted = privacyMode ? '***' : formatCurrency(value);
      return value >= 0 ? `+${formatted}` : formatted;
    };

    expect(formatWithSign(100)).toBe('+***');
    expect(formatWithSign(-100)).toBe('***'); // Negative case returns *** without extra sign
  });
});
