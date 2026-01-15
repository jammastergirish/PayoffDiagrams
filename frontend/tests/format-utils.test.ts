import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatCurrencyOrInfinity,
  formatPercent,
  formatNumber,
  formatPrivateCurrency,
  formatRelativeTime
} from '@/lib/format-utils';

describe('Format Utils', () => {
  describe('formatCurrency', () => {
    it('formats positive numbers with dollar sign', () => {
      expect(formatCurrency(1000)).toBe('$1,000');
      expect(formatCurrency(1234.56, 2)).toBe('$1,234.56');
    });

    it('formats negative numbers', () => {
      expect(formatCurrency(-500)).toBe('$-500');
    });

    it('handles zero', () => {
      expect(formatCurrency(0)).toBe('$0');
    });
  });

  describe('formatCurrencyOrInfinity', () => {
    it('formats finite numbers as currency', () => {
      expect(formatCurrencyOrInfinity(1000)).toBe('$1,000');
    });

    it('returns infinity symbol for Infinity', () => {
      expect(formatCurrencyOrInfinity(Infinity)).toBe('∞');
      expect(formatCurrencyOrInfinity(-Infinity)).toBe('∞');
    });
  });

  describe('formatPercent', () => {
    it('formats positive percentages with plus sign', () => {
      expect(formatPercent(5.5)).toBe('+5.5%');
    });

    it('formats negative percentages', () => {
      expect(formatPercent(-3.2)).toBe('-3.2%');
    });

    it('respects decimal places', () => {
      expect(formatPercent(5.567, 2)).toBe('+5.57%');
    });
  });

  describe('formatPrivateCurrency', () => {
    it('shows value when privacy mode is off', () => {
      expect(formatPrivateCurrency(1000, false)).toBe('$1,000');
    });

    it('hides value when privacy mode is on', () => {
      expect(formatPrivateCurrency(1000, true)).toBe('***');
    });
  });

  describe('formatRelativeTime', () => {
    it('formats recent times as "just now"', () => {
      const now = new Date();
      expect(formatRelativeTime(now)).toBe('just now');
    });

    it('formats minutes ago', () => {
      const date = new Date(Date.now() - 5 * 60000);
      expect(formatRelativeTime(date)).toBe('5m ago');
    });

    it('formats hours ago', () => {
      const date = new Date(Date.now() - 3 * 3600000);
      expect(formatRelativeTime(date)).toBe('3h ago');
    });

    it('formats days ago', () => {
      const date = new Date(Date.now() - 2 * 86400000);
      expect(formatRelativeTime(date)).toBe('2d ago');
    });
  });
});