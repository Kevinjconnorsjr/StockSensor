"""Fetches OHLCV price history from Yahoo Finance via yfinance."""
import yfinance as yf
from typing import Optional
import logging

logger = logging.getLogger(__name__)


def fetch_full_history(symbol: str) -> list[dict]:
    """Pull all available price history since IPO."""
    ticker = yf.Ticker(symbol)
    hist = ticker.history(period="max", auto_adjust=True)
    if hist.empty:
        logger.warning(f"No price data for {symbol}")
        return []

    records = []
    for date, row in hist.iterrows():
        records.append({
            "date": date.strftime("%Y-%m-%d"),
            "open": round(float(row["Open"]), 4),
            "high": round(float(row["High"]), 4),
            "low": round(float(row["Low"]), 4),
            "close": round(float(row["Close"]), 4),
            "adj_close": round(float(row["Close"]), 4),
            "volume": int(row["Volume"]),
        })
    return records


def fetch_recent_history(symbol: str, since: str) -> list[dict]:
    """Pull price history since a given date (YYYY-MM-DD)."""
    ticker = yf.Ticker(symbol)
    hist = ticker.history(start=since, auto_adjust=True)
    if hist.empty:
        return []

    records = []
    for date, row in hist.iterrows():
        records.append({
            "date": date.strftime("%Y-%m-%d"),
            "open": round(float(row["Open"]), 4),
            "high": round(float(row["High"]), 4),
            "low": round(float(row["Low"]), 4),
            "close": round(float(row["Close"]), 4),
            "adj_close": round(float(row["Close"]), 4),
            "volume": int(row["Volume"]),
        })
    return records


def get_ticker_info(symbol: str) -> Optional[dict]:
    """Returns company name and IPO date."""
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info
        name = info.get("longName") or info.get("shortName") or symbol
        return {"name": name, "symbol": symbol.upper()}
    except Exception as e:
        logger.error(f"Failed to get info for {symbol}: {e}")
        return None
