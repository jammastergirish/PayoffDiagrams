"""
OpenAI LLM Client for TradeCraft.

Centralized module for making LLM calls to analyze news and provide portfolio insights.
"""

import os
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

# Initialize OpenAI client
_api_key = os.getenv("OPENAI_API_KEY")
_client = None

if _api_key:
    try:
        from openai import OpenAI
        _client = OpenAI(api_key=_api_key)
        print("INFO [LLM]: OpenAI client initialized successfully")
    except Exception as e:
        print(f"WARN [LLM]: Failed to initialize OpenAI client: {e}")
else:
    print("WARN [LLM]: OPENAI_API_KEY not found in environment")


def analyze_market_news(headlines: list[str], tickers: list[str]) -> dict:
    """
    Analyze market news headlines for portfolio impact.
    
    Args:
        headlines: List of news headline strings (max 10)
        tickers: List of ticker symbols in the portfolio
        
    Returns:
        Dict with 'summary' string or 'error' if failed
    """
    if not _client:
        return {"error": "OpenAI API key not configured"}
    
    if not headlines:
        return {"error": "No headlines provided"}
    
    # Limit to 10 headlines for cost efficiency
    headlines = headlines[:10]
    tickers_str = ", ".join(tickers) if tickers else "general market"
    headlines_str = "\n".join(f"- {h}" for h in headlines)
    
    prompt = f"""What do these top headlines today mean for my investments ({tickers_str})? Give a summary in 100 words.

Headlines:
{headlines_str}"""

    try:
        response = _client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": "You are a financial analyst providing brief, actionable insights on how news affects stock portfolios. Be concise and direct."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            max_tokens=200,
            temperature=0.7,
        )
        
        summary = response.choices[0].message.content.strip()
        return {"summary": summary}
        
    except Exception as e:
        print(f"ERROR [LLM]: Failed to analyze market news: {e}")
        return {"error": str(e)}


def analyze_ticker_news(headlines: list[str], ticker: str) -> dict:
    """
    Analyze news headlines for a specific ticker.
    
    Args:
        headlines: List of news headline strings (max 10)
        ticker: Stock ticker symbol (e.g., "AAPL")
        
    Returns:
        Dict with 'summary' string or 'error' if failed
    """
    if not _client:
        return {"error": "OpenAI API key not configured"}
    
    if not headlines:
        return {"error": "No headlines provided"}
    
    if not ticker:
        return {"error": "No ticker provided"}
    
    # Limit to 10 headlines for cost efficiency
    headlines = headlines[:10]
    headlines_str = "\n".join(f"- {h}" for h in headlines)
    
    prompt = f"""What do these recent news headlines mean for {ticker.upper()} stock? Give a summary in 100 words focusing on potential price impact.

Headlines:
{headlines_str}"""

    try:
        response = _client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": "You are a financial analyst providing brief, actionable insights on how news affects individual stocks. Be concise and direct about potential price impact."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            max_tokens=200,
            temperature=0.7,
        )
        
        summary = response.choices[0].message.content.strip()
        return {"summary": summary}
        
    except Exception as e:
        print(f"ERROR [LLM]: Failed to analyze ticker news for {ticker}: {e}")
        return {"error": str(e)}
