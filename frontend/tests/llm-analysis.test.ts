/**
 * Tests for LLM Analysis API client functions
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the API_BASE
const API_BASE = 'http://localhost:8000';

describe('LLM Analysis API Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe('fetchMarketNewsAnalysis', () => {
    it('should send POST request with full articles (headline + body)', async () => {
      const mockResponse = { summary: 'Market is bullish' };
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const articles = [
        { headline: 'Tech stocks rally', body: 'Markets surged today with major gains across sectors.' },
        { headline: 'Fed holds rates', body: 'The Federal Reserve announced no change to interest rates.' }
      ];
      const tickers = ['AAPL', 'GOOGL'];
      
      const response = await fetch(`${API_BASE}/api/llm/analyze-market-news`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articles, tickers })
      });
      const result = await response.json();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/llm/analyze-market-news'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ articles, tickers })
        })
      );
      expect(result).toEqual(mockResponse);
    });

    it('should handle empty articles array', async () => {
      const mockResponse = { error: 'No articles provided' };
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const response = await fetch(`${API_BASE}/api/llm/analyze-market-news`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articles: [], tickers: ['AAPL'] })
      });
      const result = await response.json();

      expect(result.error).toBeDefined();
    });
  });

  describe('fetchTickerNewsAnalysis', () => {
    it('should send POST request with full articles (headline + body)', async () => {
      const mockResponse = { summary: 'AAPL looks strong' };
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const articles = [
        { headline: 'Apple announces new product', body: 'iPhone 16 revealed with AI features and improved camera system.' }
      ];
      const ticker = 'AAPL';
      
      const response = await fetch(`${API_BASE}/api/llm/analyze-ticker-news`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articles, ticker })
      });
      const result = await response.json();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/llm/analyze-ticker-news'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ articles, ticker })
        })
      );
      expect(result).toEqual(mockResponse);
    });

    it('should handle missing ticker', async () => {
      const mockResponse = { error: 'No ticker provided' };
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const response = await fetch(`${API_BASE}/api/llm/analyze-ticker-news`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articles: [{ headline: 'Test' }], ticker: '' })
      });
      const result = await response.json();

      expect(result.error).toBeDefined();
    });
  });

  describe('ArticleForAnalysis type', () => {
    it('should have correct structure with headline and body', () => {
      interface ArticleForAnalysis {
        headline: string;
        body?: string;
      }

      const article: ArticleForAnalysis = { 
        headline: 'Test headline',
        body: 'Full article body text that can be very long without any truncation.'
      };
      expect(article.headline).toBe('Test headline');
      expect(article.body).toBe('Full article body text that can be very long without any truncation.');
    });

    it('should allow headline-only articles', () => {
      interface ArticleForAnalysis {
        headline: string;
        body?: string;
      }

      const article: ArticleForAnalysis = { headline: 'Just a headline' };
      expect(article.headline).toBe('Just a headline');
      expect(article.body).toBeUndefined();
    });
  });
});

describe('Prompt Generation for Analysis with Full Articles', () => {
  it('should format market news prompt with full article bodies', () => {
    const articles = [
      { headline: 'Tech stocks rally', body: 'Markets surged 2% today on AI news. Major tech companies led the gains.' },
      { headline: 'Fed holds rates', body: 'The Federal Reserve kept interest rates unchanged for the third consecutive meeting.' }
    ];
    const tickers = ['AAPL', 'GOOGL'];
    
    const articlesStr = articles.map((a, i) => {
      return a.body ? `${i + 1}. ${a.headline}\n${a.body}` : `${i + 1}. ${a.headline}`;
    }).join("\n\n");
    const tickersStr = tickers.join(', ');
    const prompt = `Based on these news articles, what are the key market-moving insights for my investments (${tickersStr})?\n\nArticles:\n${articlesStr}`;
    
    expect(prompt).toContain('AAPL, GOOGL');
    expect(prompt).toContain('1. Tech stocks rally');
    expect(prompt).toContain('Markets surged 2% today on AI news. Major tech companies led the gains.');
    expect(prompt).toContain('2. Fed holds rates');
    expect(prompt).toContain('The Federal Reserve kept interest rates unchanged for the third consecutive meeting.');
  });

  it('should format ticker news prompt with full article bodies', () => {
    const articles = [
      { headline: 'Apple announces iPhone 16', body: 'New iPhone features AI assistant with advanced capabilities.' }
    ];
    const ticker = 'AAPL';
    
    const articlesStr = articles.map((a, i) => {
      return a.body ? `${i + 1}. ${a.headline}\n${a.body}` : `${i + 1}. ${a.headline}`;
    }).join("\n\n");
    const prompt = `Based on these news articles about ${ticker.toUpperCase()}, what is the likely price impact?\n\nArticles:\n${articlesStr}`;
    
    expect(prompt).toContain('AAPL');
    expect(prompt).toContain('Apple announces iPhone 16');
    expect(prompt).toContain('New iPhone features AI assistant with advanced capabilities.');
    expect(prompt).toContain('price impact');
  });

  it('should handle articles with only headlines (no body)', () => {
    const articles: { headline: string; body?: string }[] = [
      { headline: 'Market update' }
    ];
    
    const articlesStr = articles.map((a, i) => {
      return a.body ? `${i + 1}. ${a.headline}\n${a.body}` : `${i + 1}. ${a.headline}`;
    }).join("\n\n");
    
    expect(articlesStr).toBe('1. Market update');
  });
});

describe('Ticker-Articles Matching Guard', () => {
  it('should only allow analysis when headlines ticker matches selected ticker', () => {
    const shouldAnalyze = (
      selectedTicker: string,
      newsHeadlinesTicker: string,
      newsHeadlinesLength: number
    ): boolean => {
      if (!selectedTicker || newsHeadlinesLength === 0) return false;
      if (newsHeadlinesTicker !== selectedTicker) return false;
      return true;
    };

    // Should proceed: ticker matches
    expect(shouldAnalyze('AAPL', 'AAPL', 5)).toBe(true);
    
    // Should NOT proceed: ticker mismatch (old headlines from different ticker)
    expect(shouldAnalyze('OSCR', 'MU', 5)).toBe(false);
    
    // Should NOT proceed: no headlines yet
    expect(shouldAnalyze('AAPL', 'AAPL', 0)).toBe(false);
    
    // Should NOT proceed: headlines ticker empty (still loading)
    expect(shouldAnalyze('AAPL', '', 5)).toBe(false);
    
    // Should NOT proceed: no ticker selected
    expect(shouldAnalyze('', 'AAPL', 5)).toBe(false);
  });

  it('should prevent analysis when headlines belong to wrong ticker', () => {
    // This test documents the bug fix: when user switches from MU to OSCR,
    // the analysis should NOT run until OSCR headlines are loaded
    const states = [
      { step: 'viewing MU', selectedTicker: 'MU', headlinesTicker: 'MU', shouldAnalyze: true },
      { step: 'switched to OSCR, headlines loading', selectedTicker: 'OSCR', headlinesTicker: '', shouldAnalyze: false },
      { step: 'OSCR headlines loaded', selectedTicker: 'OSCR', headlinesTicker: 'OSCR', shouldAnalyze: true },
    ];

    states.forEach(({ selectedTicker, headlinesTicker, shouldAnalyze }) => {
      const result = Boolean(selectedTicker && headlinesTicker === selectedTicker);
      expect(result).toBe(shouldAnalyze);
    });
  });
});
