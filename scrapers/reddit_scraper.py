"""Fetches stock-related Reddit posts via PRAW."""
import os
import praw
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

SUBREDDITS = ["wallstreetbets", "investing", "stocks", "StockMarket"]


def _get_reddit() -> praw.Reddit:
    return praw.Reddit(
        client_id=os.getenv("REDDIT_CLIENT_ID", ""),
        client_secret=os.getenv("REDDIT_CLIENT_SECRET", ""),
        user_agent=os.getenv("REDDIT_USER_AGENT", "StockSenseAI/0.1"),
    )


def fetch_posts(symbol: str, limit: int = 25) -> list[dict]:
    cid = os.getenv("REDDIT_CLIENT_ID", "")
    csecret = os.getenv("REDDIT_CLIENT_SECRET", "")
    if not cid or not csecret:
        logger.warning("Reddit credentials not set — skipping Reddit scrape")
        return []

    try:
        reddit = _get_reddit()
        results = []
        for sub_name in SUBREDDITS:
            sub = reddit.subreddit(sub_name)
            for post in sub.search(f"{symbol} OR ${symbol}", sort="new", time_filter="day", limit=limit):
                results.append({
                    "source": "reddit",
                    "title": post.title,
                    "body": post.selftext[:2000] if post.selftext else None,
                    "url": f"https://reddit.com{post.permalink}",
                    "published_at": datetime.fromtimestamp(post.created_utc, tz=timezone.utc).isoformat(),
                })
        return results
    except Exception as e:
        logger.error(f"Reddit error for {symbol}: {e}")
        return []
