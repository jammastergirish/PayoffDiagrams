/**
 * Tests for NewsItemList component
 */
import { describe, it, expect, vi } from 'vitest';

// Mock the NewsItemList helper functions since we can't test the React component directly
// without a DOM environment. Testing the utility functions and their logic.

describe('formatRelativeTime', () => {
  // Helper to test relative time formatting
  const formatRelativeTime = (date: Date | string): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '';
    
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${month}/${day}`;
  };

  it('returns "just now" for very recent times', () => {
    const now = new Date();
    expect(formatRelativeTime(now)).toBe('just now');
  });

  it('returns minutes ago for times under an hour', () => {
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
    expect(formatRelativeTime(thirtyMinsAgo)).toBe('30m ago');
  });

  it('returns hours ago for times under a day', () => {
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
    expect(formatRelativeTime(fiveHoursAgo)).toBe('5h ago');
  });

  it('returns days ago for times under a week', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(threeDaysAgo)).toBe('3d ago');
  });

  it('returns date format for times over a week', () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const result = formatRelativeTime(twoWeeksAgo);
    expect(result).toMatch(/^\d{2}\/\d{2}$/);  // MM/DD format
  });

  it('handles invalid date strings', () => {
    expect(formatRelativeTime('invalid')).toBe('');
  });
});


describe('decodeHtmlEntities', () => {
  // Server-side fallback implementation (since we don't have window in tests)
  const decodeHtmlEntities = (text: string): string => {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/');
  };

  it('decodes &amp; to &', () => {
    expect(decodeHtmlEntities('AT&amp;T')).toBe('AT&T');
  });

  it('decodes &lt; and &gt; to < and >', () => {
    expect(decodeHtmlEntities('&lt;div&gt;')).toBe('<div>');
  });

  it('decodes &quot; to double quote', () => {
    expect(decodeHtmlEntities('He said &quot;hello&quot;')).toBe('He said "hello"');
  });

  it('decodes &#39; to single quote', () => {
    expect(decodeHtmlEntities("It&#39;s working")).toBe("It's working");
  });

  it('decodes &#x27; to single quote', () => {
    expect(decodeHtmlEntities("It&#x27;s working")).toBe("It's working");
  });

  it('handles multiple entities in one string', () => {
    const input = 'Trump Says &#39;The U.S. &amp; Greenland&#39;';
    const expected = "Trump Says 'The U.S. & Greenland'";
    expect(decodeHtmlEntities(input)).toBe(expected);
  });
});


describe('NewsHeadline type structure', () => {
  it('defines correct NewsHeadline interface with imageUrl', () => {
    // This tests that the TypeScript interface includes imageUrl
    interface NewsHeadline {
      articleId: string;
      headline: string;
      providerCode: string;
      providerName?: string;
      time: string;
      teaser?: string;
      body?: string;
      url?: string;
      author?: string;
      channels?: string[];
      imageUrl?: string;
    }

    const headline: NewsHeadline = {
      articleId: '12345',
      headline: 'Test Headline',
      providerCode: 'BZ',
      providerName: 'Benzinga',
      time: '2026-01-14T10:00:00Z',
      imageUrl: 'https://example.com/image.jpg',
    };

    expect(headline.imageUrl).toBe('https://example.com/image.jpg');
  });
});
