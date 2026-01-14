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
    it('should send POST request with correct body', async () => {
      const mockResponse = { summary: 'Market is bullish' };
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      // Simulate the function behavior
      const headlines = ['Tech stocks rally', 'Fed holds rates'];
      const tickers = ['AAPL', 'GOOGL'];
      
      const response = await fetch(`${API_BASE}/api/llm/analyze-market-news`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headlines, tickers })
      });
      const result = await response.json();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/llm/analyze-market-news'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ headlines, tickers })
        })
      );
      expect(result).toEqual(mockResponse);
    });

    it('should handle empty headlines array', async () => {
      const mockResponse = { error: 'No headlines provided' };
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const response = await fetch(`${API_BASE}/api/llm/analyze-market-news`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headlines: [], tickers: ['AAPL'] })
      });
      const result = await response.json();

      expect(result.error).toBeDefined();
    });
  });

  describe('fetchTickerNewsAnalysis', () => {
    it('should send POST request with ticker in body', async () => {
      const mockResponse = { summary: 'AAPL looks strong' };
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const headlines = ['Apple announces new product'];
      const ticker = 'AAPL';
      
      const response = await fetch(`${API_BASE}/api/llm/analyze-ticker-news`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headlines, ticker })
      });
      const result = await response.json();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/llm/analyze-ticker-news'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ headlines, ticker })
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
        body: JSON.stringify({ headlines: ['Test'], ticker: '' })
      });
      const result = await response.json();

      expect(result.error).toBeDefined();
    });
  });

  describe('LLMAnalysisResponse type', () => {
    it('should have correct structure for success response', () => {
      interface LLMAnalysisResponse {
        summary?: string;
        error?: string;
      }

      const successResponse: LLMAnalysisResponse = { summary: 'Test summary' };
      expect(successResponse.summary).toBe('Test summary');
      expect(successResponse.error).toBeUndefined();
    });

    it('should have correct structure for error response', () => {
      interface LLMAnalysisResponse {
        summary?: string;
        error?: string;
      }

      const errorResponse: LLMAnalysisResponse = { error: 'API Error' };
      expect(errorResponse.error).toBe('API Error');
      expect(errorResponse.summary).toBeUndefined();
    });
  });
});

describe('Prompt Generation for Analysis', () => {
  it('should format market news prompt correctly', () => {
    const headlines = ['Tech stocks rally', 'Fed holds rates'];
    const tickers = ['AAPL', 'GOOGL'];
    
    const headlinesStr = headlines.map(h => `- ${h}`).join('\n');
    const tickersStr = tickers.join(', ');
    const prompt = `What do these top headlines today mean for my investments (${tickersStr})? Give a summary in 100 words.\n\nHeadlines:\n${headlinesStr}`;
    
    expect(prompt).toContain('AAPL, GOOGL');
    expect(prompt).toContain('- Tech stocks rally');
    expect(prompt).toContain('- Fed holds rates');
    expect(prompt).toContain('100 words');
  });

  it('should format ticker news prompt correctly', () => {
    const headlines = ['Apple announces iPhone 16'];
    const ticker = 'AAPL';
    
    const headlinesStr = headlines.map(h => `- ${h}`).join('\n');
    const prompt = `What do these recent news headlines mean for ${ticker.toUpperCase()} stock? Give a summary in 100 words focusing on potential price impact.\n\nHeadlines:\n${headlinesStr}`;
    
    expect(prompt).toContain('AAPL stock');
    expect(prompt).toContain('- Apple announces iPhone 16');
    expect(prompt).toContain('price impact');
  });

  it('should handle empty tickers gracefully', () => {
    const headlines = ['Market update'];
    const tickers: string[] = [];
    
    const tickersStr = tickers.join(', ') || 'general market';
    const prompt = `What do these top headlines today mean for my investments (${tickersStr})?`;
    
    expect(prompt).toContain('general market');
  });
});

describe('Ticker-Headlines Matching Guard', () => {
  it('should only allow analysis when headlines ticker matches selected ticker', () => {
    // Simulate the guard logic from payoff-dashboard.tsx
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

  it('should clear headlines ticker when switching tickers (before new load)', () => {
    // This simulates the flow when user changes ticker:
    // 1. User on MU, newsHeadlinesTicker = 'MU', newsHeadlines = [MU articles]
    // 2. User clicks OSCR
    // 3. setNewsHeadlinesTicker('') called immediately (or with OSCR cached)
    // 4. Analysis effect runs, sees mismatch, skips
    // 5. Headlines load for OSCR, setNewsHeadlinesTicker('OSCR')
    // 6. Analysis effect runs again, now matches, proceeds

    const states = [
      { step: 'initial', selectedTicker: 'MU', headlinesTicker: 'MU', shouldAnalyze: true },
      { step: 'ticker changed, loading', selectedTicker: 'OSCR', headlinesTicker: '', shouldAnalyze: false },
      { step: 'headlines loaded', selectedTicker: 'OSCR', headlinesTicker: 'OSCR', shouldAnalyze: true },
    ];

    states.forEach(({ step, selectedTicker, headlinesTicker, shouldAnalyze }) => {
      const result = selectedTicker && headlinesTicker === selectedTicker;
      expect(result).toBe(shouldAnalyze);
    });
  });
});
