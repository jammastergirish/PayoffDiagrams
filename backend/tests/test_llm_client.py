"""
Tests for the LLM client module.
"""

import pytest
from unittest.mock import patch, MagicMock


class TestFormatHeadlines:
    """Tests for the _format_headlines helper function."""
    
    def test_formats_headlines_as_bullets(self):
        """Test that headlines are formatted as bullet points."""
        from backend.llm_client import _format_headlines
        
        headlines = ["Headline 1", "Headline 2", "Headline 3"]
        result = _format_headlines(headlines)
        
        assert result == "- Headline 1\n- Headline 2\n- Headline 3"
    
    def test_limits_to_max_headlines(self):
        """Test that only MAX_HEADLINES are included."""
        from backend.llm_client import _format_headlines, MAX_HEADLINES
        
        headlines = [f"Headline {i}" for i in range(20)]
        result = _format_headlines(headlines)
        
        assert result.count("- ") == MAX_HEADLINES
    
    def test_empty_list_returns_empty_string(self):
        """Test that empty list returns empty string."""
        from backend.llm_client import _format_headlines
        
        result = _format_headlines([])
        assert result == ""


class TestAnalyzeMarketNews:
    """Tests for analyze_market_news function."""
    
    def test_returns_error_when_no_headlines(self):
        """Test that empty headlines returns error."""
        from backend.llm_client import analyze_market_news
        
        result = analyze_market_news([], ["AAPL", "GOOGL"])
        assert "error" in result
        assert result["error"] == "No headlines provided"
    
    @patch('backend.llm_client._client', None)
    def test_returns_error_when_no_client(self):
        """Test that missing client returns error."""
        from backend.llm_client import analyze_market_news
        
        result = analyze_market_news(["Test headline"], ["AAPL"])
        assert "error" in result
        assert "API key" in result["error"]
    
    @patch('backend.llm_client._client')
    def test_calls_openai_with_correct_prompt(self, mock_client):
        """Test that OpenAI is called with market-specific prompt."""
        from backend.llm_client import analyze_market_news
        
        # Setup mock
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "Test summary"
        mock_client.chat.completions.create.return_value = mock_response
        
        result = analyze_market_news(["Tech stocks rally"], ["AAPL", "GOOGL"])
        
        # Verify call was made
        mock_client.chat.completions.create.assert_called_once()
        call_args = mock_client.chat.completions.create.call_args
        
        # Check prompt contains tickers and headlines
        user_message = call_args.kwargs["messages"][1]["content"]
        assert "AAPL, GOOGL" in user_message
        assert "Tech stocks rally" in user_message
        
        # Check result
        assert result == {"summary": "Test summary"}
    
    @patch('backend.llm_client._client')
    def test_handles_api_error(self, mock_client):
        """Test that API errors are caught and returned."""
        from backend.llm_client import analyze_market_news
        
        mock_client.chat.completions.create.side_effect = Exception("API Error")
        
        result = analyze_market_news(["Test headline"], ["AAPL"])
        
        assert "error" in result
        assert "API Error" in result["error"]


class TestAnalyzeTickerNews:
    """Tests for analyze_ticker_news function."""
    
    def test_returns_error_when_no_headlines(self):
        """Test that empty headlines returns error."""
        from backend.llm_client import analyze_ticker_news
        
        result = analyze_ticker_news([], "AAPL")
        assert "error" in result
        assert result["error"] == "No headlines provided"
    
    def test_returns_error_when_no_ticker(self):
        """Test that missing ticker returns error."""
        from backend.llm_client import analyze_ticker_news
        
        result = analyze_ticker_news(["Test headline"], "")
        assert "error" in result
        assert result["error"] == "No ticker provided"
    
    @patch('backend.llm_client._client', None)
    def test_returns_error_when_no_client(self):
        """Test that missing client returns error."""
        from backend.llm_client import analyze_ticker_news
        
        result = analyze_ticker_news(["Test headline"], "AAPL")
        assert "error" in result
        assert "API key" in result["error"]
    
    @patch('backend.llm_client._client')
    def test_calls_openai_with_correct_prompt(self, mock_client):
        """Test that OpenAI is called with ticker-specific prompt."""
        from backend.llm_client import analyze_ticker_news
        
        # Setup mock
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "AAPL analysis"
        mock_client.chat.completions.create.return_value = mock_response
        
        result = analyze_ticker_news(["Apple announces new product"], "aapl")
        
        # Verify call was made
        mock_client.chat.completions.create.assert_called_once()
        call_args = mock_client.chat.completions.create.call_args
        
        # Check prompt contains ticker (uppercased) and headline
        user_message = call_args.kwargs["messages"][1]["content"]
        assert "AAPL" in user_message  # Should be uppercased
        assert "Apple announces new product" in user_message
        
        # Check result
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
        from backend.llm_client import _call_openai, DEFAULT_MODEL, DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE
        
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "Response"
        mock_client.chat.completions.create.return_value = mock_response
        
        _call_openai("system prompt", "user prompt")
        
        call_args = mock_client.chat.completions.create.call_args
        assert call_args.kwargs["model"] == DEFAULT_MODEL
        assert call_args.kwargs["max_tokens"] == DEFAULT_MAX_TOKENS
        assert call_args.kwargs["temperature"] == DEFAULT_TEMPERATURE
