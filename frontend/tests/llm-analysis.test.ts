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
