"""Fetches SEC EDGAR filings using the free EDGAR full-text search API."""
import requests
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)
SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik}.json"
EFTS_URL = "https://efts.sec.gov/LATEST/search-index?q=%22{symbol}%22&dateRange=custom&startdt={start}&enddt={end}&forms=8-K,10-Q,10-K"
HEADERS = {"User-Agent": "StockSenseAI contact@example.com"}


def _get_cik(symbol: str) -> str | None:
    try:
        resp = requests.get(
            "https://www.sec.gov/cgi-bin/browse-edgar",
            params={"company": symbol, "CIK": symbol, "action": "getcompany", "output": "atom"},
            headers=HEADERS,
            timeout=10,
        )
        # Simplified: use the EFTS search instead
        return None
    except Exception as e:
        logger.error(f"EDGAR CIK lookup error: {e}")
        return None


def fetch_filings(symbol: str, days_back: int = 1) -> list[dict]:
    try:
        end = datetime.utcnow().strftime("%Y-%m-%d")
        start = (datetime.utcnow() - timedelta(days=days_back)).strftime("%Y-%m-%d")
        url = f"https://efts.sec.gov/LATEST/search-index?q=%22{symbol}%22&dateRange=custom&startdt={start}&enddt={end}&forms=8-K,10-Q,10-K"
        resp = requests.get(url, headers=HEADERS, timeout=10)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error(f"EDGAR search error for {symbol}: {e}")
        return []

    hits = data.get("hits", {}).get("hits", [])
    results = []
    for hit in hits:
        src = hit.get("_source", {})
        results.append({
            "source": "edgar",
            "title": f"{src.get('form_type', 'Filing')}: {src.get('display_names', symbol)}",
            "body": src.get("file_date"),
            "url": f"https://www.sec.gov/Archives/edgar/data/{src.get('entity_id', '')}/{src.get('file_name', '')}",
            "published_at": src.get("period_of_report") or src.get("file_date"),
        })
    return results
