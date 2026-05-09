"""Fetches financial news articles from NewsAPI."""
import os
import requests
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)
NEWS_API_KEY = os.getenv("NEWS_API_KEY", "")
BASE_URL = "https://newsapi.org/v2/everything"


def fetch_news(symbol: str, company_name: str = "", days_back: int = 1) -> list[dict]:
    if not NEWS_API_KEY:
        logger.warning("NEWS_API_KEY not set — skipping NewsAPI scrape")
        return []

    query = f'"{symbol}"' + (f' OR "{company_name}"' if company_name else "")
    from_dt = (datetime.utcnow() - timedelta(days=days_back)).strftime("%Y-%m-%dT%H:%M:%SZ")

    try:
        resp = requests.get(
            BASE_URL,
            params={
                "q": query,
                "from": from_dt,
                "language": "en",
                "sortBy": "publishedAt",
                "pageSize": 50,
                "apiKey": NEWS_API_KEY,
            },
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error(f"NewsAPI error for {symbol}: {e}")
        return []

    articles = data.get("articles", [])
    results = []
    for a in articles:
        results.append({
            "source": "newsapi",
            "title": a.get("title"),
            "body": a.get("description") or a.get("content"),
            "url": a.get("url"),
            "published_at": a.get("publishedAt"),
        })
    return results
