"""Fetches X/Twitter posts via Bearer Token API (optional, requires X Basic $100/mo)."""
import os
import requests
import logging
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)
BEARER_TOKEN = os.getenv("TWITTER_BEARER_TOKEN", "")
SEARCH_URL = "https://api.twitter.com/2/tweets/search/recent"


def fetch_tweets(symbol: str, limit: int = 50) -> list[dict]:
    if not BEARER_TOKEN:
        logger.info(f"TWITTER_BEARER_TOKEN not set — skipping Twitter scrape for {symbol}")
        return []

    query = f'${symbol} lang:en -is:retweet'
    start_time = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ")

    try:
        resp = requests.get(
            SEARCH_URL,
            headers={"Authorization": f"Bearer {BEARER_TOKEN}"},
            params={
                "query": query,
                "max_results": min(limit, 100),
                "start_time": start_time,
                "tweet.fields": "created_at,author_id,text",
            },
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error(f"Twitter API error for {symbol}: {e}")
        return []

    tweets = data.get("data", [])
    results = []
    for t in tweets:
        results.append({
            "source": "twitter",
            "title": t.get("text", "")[:280],
            "body": None,
            "url": f"https://twitter.com/i/web/status/{t['id']}",
            "published_at": t.get("created_at"),
        })
    return results
