"""Fetches stock-related Reddit posts.

Primary: PRAW (Reddit API) if credentials are configured.
Fallback: Reddit public RSS feeds — no API key required.
"""
import os
import logging
import requests
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

SUBREDDITS = ["wallstreetbets", "investing", "stocks", "StockMarket"]
HEADERS = {"User-Agent": "StockSenseAI/0.1 (RSS reader)"}


def fetch_posts(symbol: str, limit: int = 25) -> list[dict]:
    cid = os.getenv("REDDIT_CLIENT_ID", "")
    csecret = os.getenv("REDDIT_CLIENT_SECRET", "")

    if cid and csecret and cid != "placeholder":
        results = _fetch_via_praw(symbol, limit)
        if results is not None:
            return results

    # Fallback: public RSS (no credentials needed)
    return _fetch_via_rss(symbol, limit)


def _fetch_via_praw(symbol: str, limit: int) -> list[dict] | None:
    try:
        import praw
        reddit = praw.Reddit(
            client_id=os.getenv("REDDIT_CLIENT_ID"),
            client_secret=os.getenv("REDDIT_CLIENT_SECRET"),
            user_agent=os.getenv("REDDIT_USER_AGENT", "StockSenseAI/0.1"),
        )
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
        logger.warning(f"PRAW failed for {symbol}, falling back to RSS: {e}")
        return None


def _fetch_via_rss(symbol: str, limit: int) -> list[dict]:
    """Use Reddit's public search RSS — no API key required."""
    results = []
    for sub in SUBREDDITS:
        try:
            url = f"https://www.reddit.com/r/{sub}/search.rss"
            resp = requests.get(
                url,
                params={"q": f"{symbol} OR ${symbol}", "sort": "new", "restrict_sr": "1", "limit": limit},
                headers=HEADERS,
                timeout=10,
            )
            if resp.status_code != 200:
                continue

            root = ET.fromstring(resp.text)
            ns = {"atom": "http://www.w3.org/2005/Atom"}
            for entry in root.findall("atom:entry", ns):
                title = entry.findtext("atom:title", default="", namespaces=ns)
                content = entry.findtext("atom:content", default="", namespaces=ns)
                link_el = entry.find("atom:link", ns)
                link = link_el.get("href") if link_el is not None else None
                published = entry.findtext("atom:published", default=None, namespaces=ns)
                results.append({
                    "source": "reddit",
                    "title": title,
                    "body": content[:2000] if content else None,
                    "url": link,
                    "published_at": published,
                })
        except Exception as e:
            logger.error(f"Reddit RSS error for {symbol} r/{sub}: {e}")
            continue

    logger.info(f"Reddit RSS fetched {len(results)} posts for {symbol}")
    return results
