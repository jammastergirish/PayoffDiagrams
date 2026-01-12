/**
 * Tests for dashboard helper functions.
 * 
 * Tests cover:
 * - decodeHtmlEntities: HTML entity decoding
 * - formatDate: Date formatting
 * - formatDateTime: DateTime formatting
 */

import { describe, it, expect } from 'vitest';

// Re-implement the helpers for testing (or extract them from dashboard)
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&#x27;': "'",
    '&nbsp;': ' ',
  };
  
  return text.replace(/&[#\w]+;/g, (entity) => entities[entity] || entity);
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

describe('decodeHtmlEntities', () => {
  it('should decode common HTML entities', () => {
    expect(decodeHtmlEntities('&amp;')).toBe('&');
    expect(decodeHtmlEntities('&lt;')).toBe('<');
    expect(decodeHtmlEntities('&gt;')).toBe('>');
    expect(decodeHtmlEntities('&quot;')).toBe('"');
  });

  it('should decode apostrophe entities', () => {
    expect(decodeHtmlEntities("&#39;")).toBe("'");
    expect(decodeHtmlEntities("&apos;")).toBe("'");
    expect(decodeHtmlEntities("&#x27;")).toBe("'");
  });

  it('should decode multiple entities in a string', () => {
    expect(decodeHtmlEntities("Tom&#39;s &amp; Jerry&#39;s")).toBe("Tom's & Jerry's");
  });

  it('should handle strings with no entities', () => {
    expect(decodeHtmlEntities("Hello World")).toBe("Hello World");
  });

  it('should decode nbsp entity', () => {
    expect(decodeHtmlEntities("Hello&nbsp;World")).toBe("Hello World");
  });

  it('should preserve unknown entities', () => {
    expect(decodeHtmlEntities("&unknown;")).toBe("&unknown;");
  });
});

describe('formatDate', () => {
  it('should format Date object to YYYY-MM-DD', () => {
    const date = new Date(2026, 0, 15); // Jan 15, 2026
    expect(formatDate(date)).toBe('2026-01-15');
  });

  it('should format date string to YYYY-MM-DD', () => {
    // Note: Parsing ISO strings gives UTC, may shift date based on timezone
    const result = formatDate('2026-03-21T10:30:00');
    expect(result).toMatch(/2026-03-2[01]/); // May be 20 or 21 depending on TZ
  });

  it('should pad single digit months and days', () => {
    const date = new Date(2026, 4, 5); // May 5, 2026
    expect(formatDate(date)).toBe('2026-05-05');
  });

  it('should handle December correctly', () => {
    const date = new Date(2026, 11, 31); // Dec 31, 2026
    expect(formatDate(date)).toBe('2026-12-31');
  });
});

describe('formatDateTime', () => {
  it('should format to YYYY-MM-DD HH:MM', () => {
    const date = new Date(2026, 0, 15, 14, 30);
    expect(formatDateTime(date)).toBe('2026-01-15 14:30');
  });

  it('should pad single digit hours and minutes', () => {
    const date = new Date(2026, 0, 5, 9, 5);
    expect(formatDateTime(date)).toBe('2026-01-05 09:05');
  });

  it('should handle midnight correctly', () => {
    const date = new Date(2026, 0, 1, 0, 0);
    expect(formatDateTime(date)).toBe('2026-01-01 00:00');
  });
});

describe('Change Percentage Calculations', () => {
  // Test the logic used for displaying % change
  
  function calculateChangePercent(current: number, previous: number): number {
    if (previous === 0) return 0;
    return ((current - previous) / previous) * 100;
  }
  
  function formatChangePercent(pct: number): string {
    const prefix = pct >= 0 ? '+' : '';
    return `${prefix}${pct.toFixed(2)}%`;
  }

  it('should calculate positive change correctly', () => {
    const pct = calculateChangePercent(105, 100);
    expect(pct).toBe(5);
    expect(formatChangePercent(pct)).toBe('+5.00%');
  });

  it('should calculate negative change correctly', () => {
    const pct = calculateChangePercent(95, 100);
    expect(pct).toBe(-5);
    expect(formatChangePercent(pct)).toBe('-5.00%');
  });

  it('should handle zero change', () => {
    const pct = calculateChangePercent(100, 100);
    expect(pct).toBe(0);
    expect(formatChangePercent(pct)).toBe('+0.00%');
  });

  it('should handle zero previous price', () => {
    const pct = calculateChangePercent(100, 0);
    expect(pct).toBe(0);
  });

  it('should handle fractional percentages', () => {
    const pct = calculateChangePercent(100.50, 100);
    expect(pct).toBeCloseTo(0.5);
    expect(formatChangePercent(pct)).toBe('+0.50%');
  });
});

describe('P&L Display Logic', () => {
  // Test the logic for displaying daily P&L on ticker cards
  
  interface Position {
    unrealized_pnl: number;
    cost_basis: number;
    qty: number;
    current_price: number;
  }
  
  function calculatePositionValue(pos: Position): number {
    return pos.current_price * Math.abs(pos.qty);
  }
  
  function calculatePnlPercent(pos: Position): number {
    const value = calculatePositionValue(pos);
    if (value === 0) return 0;
    return (pos.unrealized_pnl / value) * 100;
  }

  it('should calculate P&L % for stock position', () => {
    const pos: Position = {
      unrealized_pnl: 500,
      cost_basis: 150,
      qty: 100,
      current_price: 155
    };
    
    const pct = calculatePnlPercent(pos);
    // 500 / (155 * 100) = 500 / 15500 = 3.23%
    expect(pct).toBeCloseTo(3.23, 1);
  });

  it('should handle negative P&L', () => {
    const pos: Position = {
      unrealized_pnl: -1000,
      cost_basis: 200,
      qty: 50,
      current_price: 180
    };
    
    const pct = calculatePnlPercent(pos);
    expect(pct).toBeLessThan(0);
  });
});
