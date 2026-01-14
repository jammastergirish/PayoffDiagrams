"""
Tests for the LLM client module.
"""

import pytest
from unittest.mock import patch, MagicMock


class TestFormatArticles:
    """Tests for the _format_articles helper function."""
    
    def test_formats_articles_with_body(self):
        """Test that articles with body are formatted correctly."""
        from backend.llm_client import _format_articles, NewsArticle
        
        articles = [
            NewsArticle(headline="Test Headline", body="This is the full article body."),
        ]
        result = _format_articles(articles)
        
        assert "1. Test Headline" in result
        assert "This is the full article body." in result
    
    def test_formats_headline_only_when_no_body(self):
        """Test that headlines work without body."""
        from backend.llm_client import _format_articles, NewsArticle
        
        articles = [
            NewsArticle(headline="Just a headline"),
        ]
        result = _format_articles(articles)
        
        assert "1. Just a headline" in result
    
    def test_includes_full_body_without_truncation(self):
        """Test that full body content is included without truncation."""
        from backend.llm_client import _format_articles, NewsArticle
        
        long_body = "x" * 1000  # Long body text
        articles = [
            NewsArticle(headline="Test", body=long_body),
        ]
        result = _format_articles(articles)
        
        # Should NOT truncate - full body included
        assert "..." not in result
        assert long_body in result
    
    def test_limits_to_max_articles(self):
        """Test that only MAX_ARTICLES are included."""
        from backend.llm_client import _format_articles, NewsArticle, MAX_ARTICLES
        
        articles = [NewsArticle(headline=f"Headline {i}") for i in range(20)]
        result = _format_articles(articles)
        
        assert f"{MAX_ARTICLES}." in result
        assert f"{MAX_ARTICLES + 1}." not in result


class TestAnalyzeMarketNews:
    """Tests for analyze_market_news function."""
    
    def test_returns_error_when_no_articles(self):
        """Test that empty articles returns error."""
        from backend.llm_client import analyze_market_news
        
        result = analyze_market_news([], ["AAPL", "GOOGL"])
        assert "error" in result
        assert result["error"] == "No articles provided"
    
    @patch('backend.llm_client._client', None)
    def test_returns_error_when_no_client(self):
        """Test that missing client returns error."""
        from backend.llm_client import analyze_market_news
        
        result = analyze_market_news([{"headline": "Test"}], ["AAPL"])
        assert "error" in result
        assert "API key" in result["error"]
    
    @patch('backend.llm_client._client')
    def test_calls_openai_with_full_article_content(self, mock_client):
        """Test that OpenAI is called with full article body."""
        from backend.llm_client import analyze_market_news
        
        # Setup mock
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "Test summary"
        mock_client.chat.completions.create.return_value = mock_response
        
        articles = [{"headline": "Tech stocks rally", "body": "Markets are up today with major gains across all sectors. Tech led the way."}]
        result = analyze_market_news(articles, ["AAPL", "GOOGL"])
        
        # Verify call was made
        mock_client.chat.completions.create.assert_called_once()
        call_args = mock_client.chat.completions.create.call_args
        
        # Check prompt contains tickers and FULL article content
        user_message = call_args.kwargs["messages"][1]["content"]
        assert "AAPL, GOOGL" in user_message
        assert "Tech stocks rally" in user_message
        assert "Markets are up today with major gains across all sectors. Tech led the way." in user_message
        
        assert result == {"summary": "Test summary"}


class TestAnalyzeTickerNews:
    """Tests for analyze_ticker_news function."""
    
    def test_returns_error_when_no_articles(self):
        """Test that empty articles returns error."""
        from backend.llm_client import analyze_ticker_news
        
        result = analyze_ticker_news([], "AAPL")
        assert "error" in result
        assert result["error"] == "No articles provided"
    
    def test_returns_error_when_no_ticker(self):
        """Test that missing ticker returns error."""
        from backend.llm_client import analyze_ticker_news
        
        result = analyze_ticker_news([{"headline": "Test"}], "")
        assert "error" in result
        assert result["error"] == "No ticker provided"
    
    @patch('backend.llm_client._client', None)
    def test_returns_error_when_no_client(self):
        """Test that missing client returns error."""
        from backend.llm_client import analyze_ticker_news
        
        result = analyze_ticker_news([{"headline": "Test"}], "AAPL")
        assert "error" in result
        assert "API key" in result["error"]
    
    @patch('backend.llm_client._client')
    def test_calls_openai_with_full_article_content(self, mock_client):
        """Test that OpenAI is called with full article body."""
        from backend.llm_client import analyze_ticker_news
        
        # Setup mock
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "AAPL analysis"
        mock_client.chat.completions.create.return_value = mock_response
        
        articles = [{"headline": "Apple announces new product", "body": "iPhone 16 revealed with new AI features and improved camera system."}]
        result = analyze_ticker_news(articles, "aapl")
        
        # Verify call was made
        mock_client.chat.completions.create.assert_called_once()
        call_args = mock_client.chat.completions.create.call_args
        
        # Check prompt contains ticker (uppercased) and FULL article content
        user_message = call_args.kwargs["messages"][1]["content"]
        assert "AAPL" in user_message
        assert "Apple announces new product" in user_message
        assert "iPhone 16 revealed with new AI features and improved camera system." in user_message
        
        assert result == {"summary": "AAPL analysis"}


class TestCallOpenAI:
    """Tests for _call_openai helper function."""
    
    @patch('backend.llm_client._client', None)
    def test_returns_error_when_no_client(self):
        """Test that missing client returns error."""
        from backend.llm_client import _call_openai
        
        result = _call_openai("system", "user")
        assert "error" in result
        assert "API key" in result["error"]
    
    @patch('backend.llm_client._client')
    def test_uses_correct_model_and_settings(self, mock_client):
        """Test that correct model and settings are used."""
        from backend.llm_client import _call_openai, DEFAULT_MODEL, DEFAULT_TEMPERATURE
        
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "Response"
        mock_client.chat.completions.create.return_value = mock_response
        
        _call_openai("system prompt", "user prompt", max_tokens=200)
        
        call_args = mock_client.chat.completions.create.call_args
        assert call_args.kwargs["model"] == DEFAULT_MODEL
        assert call_args.kwargs["max_tokens"] == 200
        assert call_args.kwargs["temperature"] == DEFAULT_TEMPERATURE
