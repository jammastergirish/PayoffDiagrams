"""
Massive.com REST API Client.

This module handles data from Massive.com REST API:
- Historical OHLC price data (bars)
- Benzinga news headlines and articles
- Ticker details and company info

It is completely independent of the IBKR client (which handles live positions, P&L, Greeks).
"""

import os
from datetime import datetime, timedelta
from typing import Optional
from dotenv import load_dotenv
from massive import RESTClient

# Load environment variables from .env file
load_dotenv()

# Initialize the Massive REST client with API key
_api_key = os.getenv("MASSIVE_API_KEY")
if not _api_key:
    print("WARNING: MASSIVE_API_KEY not found in environment. Historical data will not work.")
    _client: Optional[RESTClient] = None
else:
    _client = RESTClient(api_key=_api_key)


# Timeframe configuration mapping
# Maps app timeframes to Massive API parameters
TIMEFRAME_CONFIG = {
    "1Y": {"multiplier": 1, "timespan": "day", "days_back": 365},
    "1M": {"multiplier": 1, "timespan": "hour", "days_back": 30},
    "1W": {"multiplier": 1, "timespan": "hour", "days_back": 7},
    "1D": {"multiplier": 5, "timespan": "minute", "days_back": 1},
    "1H": {"multiplier": 1, "timespan": "minute", "days_back": 0, "hours_back": 1},
}


def get_historical_bars(symbol: str, timeframe: str = "1M") -> dict:
    """
    Fetch historical OHLC bars from Massive.com API.
    
    Args:
        symbol: Stock ticker (e.g., "AAPL")
        timeframe: One of "1Y", "1M", "1W", "1D", "1H"
        
    Returns:
        Dict with symbol, timeframe, and bars list
    """
    if not _client:
        return {
            "symbol": symbol,
            "timeframe": timeframe,
            "bars": [],
            "error": "Massive API key not configured"
        }
    
    config = TIMEFRAME_CONFIG.get(timeframe.upper(), TIMEFRAME_CONFIG["1M"])
    
    # Calculate date range
    now = datetime.now()
    if "hours_back" in config:
        from_date = now - timedelta(hours=config["hours_back"])
    else:
        from_date = now - timedelta(days=config["days_back"])
    
    # Format dates for Massive API (YYYY-MM-DD or millisecond timestamp)
    from_str = from_date.strftime("%Y-%m-%d")
    to_str = now.strftime("%Y-%m-%d")
    
    try:
        # Call Massive.com Aggregates (Bars) API
        # GET /v2/aggs/ticker/{stocksTicker}/range/{multiplier}/{timespan}/{from}/{to}
        aggs = _client.get_aggs(
            ticker=symbol.upper(),
            multiplier=config["multiplier"],
            timespan=config["timespan"],
            from_=from_str,
            to=to_str,
            adjusted=True,
            sort="asc",
            limit=50000
        )
        
        # Convert response to our bar format
        # The massive package returns a list of Agg objects directly
        bars = []
        if aggs:
            for agg in aggs:
                # Convert timestamp (milliseconds) to ISO date string
                ts_ms = agg.timestamp if hasattr(agg, 'timestamp') else (agg.t if hasattr(agg, 't') else 0)
                dt = datetime.fromtimestamp(ts_ms / 1000)
                
                bars.append({
                    "date": dt.isoformat(),
                    "open": float(agg.open) if hasattr(agg, 'open') else float(agg.o) if hasattr(agg, 'o') else 0,
                    "high": float(agg.high) if hasattr(agg, 'high') else float(agg.h) if hasattr(agg, 'h') else 0,
                    "low": float(agg.low) if hasattr(agg, 'low') else float(agg.l) if hasattr(agg, 'l') else 0,
                    "close": float(agg.close) if hasattr(agg, 'close') else float(agg.c) if hasattr(agg, 'c') else 0,
                    "volume": int(agg.volume) if hasattr(agg, 'volume') else int(agg.v) if hasattr(agg, 'v') else 0,
                    "vwap": float(agg.vwap) if hasattr(agg, 'vwap') else float(agg.vw) if hasattr(agg, 'vw') else None,
                    "transactions": int(agg.transactions) if hasattr(agg, 'transactions') else int(agg.n) if hasattr(agg, 'n') else None,
                })
        
        print(f"DEBUG [Massive]: Retrieved {len(bars)} bars for {symbol} ({timeframe})")
        
        return {
            "symbol": symbol.upper(),
            "timeframe": timeframe.upper(),
            "bars": bars
        }
        
    except Exception as e:
        print(f"ERROR [Massive]: Failed to fetch historical data for {symbol}: {e}")
        import traceback
        traceback.print_exc()
        return {
            "symbol": symbol.upper(),
            "timeframe": timeframe.upper(),
            "bars": [],
            "error": str(e)
        }


def get_daily_snapshot(symbol: str) -> dict:
    """
    Get today's snapshot including current price and daily change.
    
    Args:
        symbol: Stock ticker (e.g., "AAPL")
        
    Returns:
        Dict with current_price, previous_close, change, change_pct
    """
    if not _client:
        return {"error": "Massive API key not configured"}
    
    try:
        # Get previous close from daily aggregates endpoint
        # We need the previous day's close and today's current price
        from_date = (datetime.now() - timedelta(days=5)).strftime("%Y-%m-%d")
        to_date = datetime.now().strftime("%Y-%m-%d")
        
        aggs = _client.get_aggs(
            ticker=symbol.upper(),
            multiplier=1,
            timespan="day",
            from_=from_date,
            to=to_date,
            adjusted=True,
            sort="desc",
            limit=2
        )
        
        if aggs and len(aggs) >= 1:
            # Most recent bar has current price (close), previous bar has prev close
            current = aggs[0]
            current_price = float(current.close) if hasattr(current, 'close') else float(current.c) if hasattr(current, 'c') else 0
            
            if len(aggs) >= 2:
                prev = aggs[1]
                prev_close = float(prev.close) if hasattr(prev, 'close') else float(prev.c) if hasattr(prev, 'c') else 0
            else:
                prev_close = float(current.open) if hasattr(current, 'open') else float(current.o) if hasattr(current, 'o') else current_price
            
            change = current_price - prev_close
            change_pct = (change / prev_close * 100) if prev_close > 0 else 0
            
            return {
                "symbol": symbol.upper(),
                "current_price": current_price,
                "previous_close": prev_close,
                "change": change,
                "change_pct": change_pct
            }
        
        return {
            "symbol": symbol.upper(),
            "error": "No price data available"
        }
        
    except Exception as e:
        print(f"ERROR [Massive]: Failed to fetch daily snapshot for {symbol}: {e}")
        return {
            "symbol": symbol.upper(),
            "error": str(e)
        }


def get_ticker_details(symbol: str) -> dict:
    """
    Fetch ticker details (company info, branding) from Massive.com API.
    
    Args:
        symbol: Stock ticker (e.g., "AAPL")
        
    Returns:
        Dict with ticker details including name, description, branding URLs
    """
    if not _client:
        return {"error": "Massive API key not configured"}
    
    try:
        # GET /v3/reference/tickers/{ticker}
        # The massive SDK returns a TickerDetails object directly (not wrapped in .results)
        r = _client.get_ticker_details(ticker=symbol.upper())
        
        if r and hasattr(r, 'name'):
            # Get branding URLs and append API key for authentication
            logo_url = None
            icon_url = None
            if hasattr(r, 'branding') and r.branding:
                base_logo = getattr(r.branding, 'logo_url', None)
                base_icon = getattr(r.branding, 'icon_url', None)
                if base_logo:
                    logo_url = f"{base_logo}?apiKey={_api_key}"
                if base_icon:
                    icon_url = f"{base_icon}?apiKey={_api_key}"
            
            return {
                "symbol": symbol.upper(),
                "name": getattr(r, 'name', None),
                "description": getattr(r, 'description', None),
                "homepage_url": getattr(r, 'homepage_url', None),
                "market_cap": getattr(r, 'market_cap', None),
                "total_employees": getattr(r, 'total_employees', None),
                "list_date": getattr(r, 'list_date', None),
                "branding": {
                    "logo_url": logo_url,
                    "icon_url": icon_url,
                } if (logo_url or icon_url) else None
            }
        
        return {"symbol": symbol.upper(), "error": "No details found"}
        
    except Exception as e:
        print(f"ERROR [Massive]: Failed to fetch ticker details for {symbol}: {e}")
        return {"symbol": symbol.upper(), "error": str(e)}


def get_news(symbol: str, limit: int = 15) -> dict:
    """
    Fetch news headlines from multiple Massive.com sources:
    - Benzinga (list_benzinga_news_v2)
    - Reference news (list_ticker_news - /v2/reference/news)
    
    Results are merged and sorted by datetime DESC.
    
    Args:
        symbol: Stock ticker (e.g., "AAPL")
        limit: Maximum total headlines to return (default 15, max 30)
        
    Returns:
        Dict with symbol and headlines list
    """
    if not _client:
        return {
            "symbol": symbol,
            "headlines": [],
            "error": "Massive API key not configured"
        }
    
    # Clamp limit to reasonable range (max 50 total)
    limit = max(1, min(limit, 50))
    per_source_limit = 25  # Fetch 25 from each source, then merge and trim to limit
    
    all_headlines = []
    
    # --- Fetch from Benzinga ---
    try:
        news_iter = _client.list_benzinga_news_v2(
            tickers=symbol.upper(),
            limit=per_source_limit,
            sort="published.desc"
        )
        
        count = 0
        for article in news_iter:
            if count >= per_source_limit:
                break
            count += 1
            
            all_headlines.append({
                "articleId": str(getattr(article, 'benzinga_id', '')),
                "headline": getattr(article, 'title', ''),
                "providerCode": "BZ",
                "providerName": "Benzinga",
                "time": getattr(article, 'published', ''),
                "teaser": getattr(article, 'teaser', ''),
                "body": getattr(article, 'body', getattr(article, 'teaser', '')),
                "url": getattr(article, 'url', ''),
                "author": getattr(article, 'author', ''),
            })
        
        print(f"DEBUG [Massive]: Retrieved {count} Benzinga headlines for {symbol}")
        
    except Exception as e:
        print(f"WARN [Massive]: Failed to fetch Benzinga news for {symbol}: {e}")
    
    # --- Fetch from Reference News (/v2/reference/news) ---
    try:
        ref_news_iter = _client.list_ticker_news(
            ticker=symbol.upper(),
            limit=per_source_limit,
            order="desc",
            sort="published_utc"
        )
        
        count = 0
        for article in ref_news_iter:
            if count >= per_source_limit:
                break
            count += 1
            
            # Get publisher info
            publisher = getattr(article, 'publisher', None)
            publisher_name = getattr(publisher, 'name', 'News') if publisher else 'News'
            
            # Build a short provider code from publisher name (first 2-3 chars)
            provider_code = ''.join(c for c in publisher_name if c.isalpha())[:3].upper() or "NEWS"
            
            all_headlines.append({
                "articleId": str(getattr(article, 'id', '')),
                "headline": getattr(article, 'title', ''),
                "providerCode": provider_code,
                "providerName": publisher_name,
                "time": getattr(article, 'published_utc', ''),
                "teaser": getattr(article, 'description', ''),
                "body": getattr(article, 'description', ''),  # Reference news has description, not full body
                "url": getattr(article, 'article_url', ''),
                "author": getattr(article, 'author', ''),
            })
        
        print(f"DEBUG [Massive]: Retrieved {count} reference news headlines for {symbol}")
        
    except Exception as e:
        print(f"WARN [Massive]: Failed to fetch reference news for {symbol}: {e}")
    
    # --- Sort by datetime DESC and limit ---
    def parse_time(item):
        time_str = item.get("time", "")
        try:
            # Handle various datetime formats
            if isinstance(time_str, str) and time_str:
                return time_str
            return ""
        except:
            return ""
    
    # Sort by time descending (newest first)
    all_headlines.sort(key=lambda x: parse_time(x), reverse=True)
    
    # Limit total results
    all_headlines = all_headlines[:limit]
    
    print(f"DEBUG [Massive]: Returning {len(all_headlines)} total headlines for {symbol}")
    
    return {
        "symbol": symbol.upper(),
        "headlines": all_headlines
    }


def get_news_article(article_id: str) -> dict:
    """
    Get full article content from Benzinga.
    
    Note: The Benzinga API returns full article body in the news list,
    so we fetch with a filter on benzinga_id.
    
    Args:
        article_id: The benzinga_id of the article
        
    Returns:
        Dict with article content
    """
    if not _client:
        return {"error": "Massive API key not configured"}
    
    try:
        # Fetch the specific article by benzinga_id
        # The massive package list_benzinga_news_v2 might not support filtering by id
        # Try fetching recent news and filtering, or use the id directly if supported
        
        # Try fetching with limit=1 - this won't filter by ID but shows the pattern
        # For now, return a message directing user to the article URL
        # since Benzinga doesn't have a single-article fetch endpoint
        
        return {
            "articleId": article_id,
            "providerCode": "BZ",
            "text": "Full article content is available at the news source. Click the headline to view the full article.",
            "title": "",
            "url": "",
            "author": "",
            "error": "Direct article fetch not supported. Article body is included in headline response."
        }
        
    except Exception as e:
        print(f"ERROR [Massive]: Failed to fetch article {article_id}: {e}")
        return {"error": str(e), "articleId": article_id}
