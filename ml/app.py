"""Flask ML service — runs on port 5001, alongside the Next.js app."""
import os
import sys
import logging
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scrapers'))

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "")

from db_helper import get_connection, sync, init_schema
init_schema()


def get_db():
    conn = get_connection()
    conn.row_factory = __import__('sqlite3').Row
    return conn


# ---------------------------------------------------------------------------
# Health & status
# ---------------------------------------------------------------------------

@app.route('/status')
def status():
    return jsonify({"ok": True, "db": os.path.exists(DB_PATH)})


# ---------------------------------------------------------------------------
# Validate ticker symbol
# ---------------------------------------------------------------------------

@app.route('/validate/<symbol>')
def validate_ticker(symbol: str):
    from yfinance_scraper import get_ticker_info
    info = get_ticker_info(symbol.upper())
    if not info:
        return jsonify({"valid": False}), 404
    return jsonify({"valid": True, **info})


# ---------------------------------------------------------------------------
# Pull full price history (called once when ticker is first added)
# ---------------------------------------------------------------------------

@app.route('/pull_history', methods=['POST'])
def pull_history():
    data = request.json or {}
    symbol = data.get('symbol', '').upper()
    ticker_id = data.get('ticker_id')
    if not symbol or not ticker_id:
        return jsonify({"error": "symbol and ticker_id required"}), 400

    from yfinance_scraper import fetch_full_history
    records = fetch_full_history(symbol)
    if not records:
        return jsonify({"error": "no data", "count": 0}), 404

    conn = get_db()
    for r in records:
        conn.execute(
            "INSERT INTO price_history (ticker_id, date, open, high, low, close, adj_close, volume) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(ticker_id, date) DO NOTHING",
            (ticker_id, r['date'], r['open'], r['high'], r['low'], r['close'], r['adj_close'], r['volume'])
        )
    if records:
        ipo = records[0]['date']
        conn.execute("UPDATE tickers SET ipo_date=? WHERE id=?", (ipo, ticker_id))
    conn.commit()
    sync(conn)
    conn.close()

    logger.info(f"Pulled {len(records)} price records for {symbol}")
    return jsonify({"count": len(records), "ipo_date": records[0]['date'] if records else None})


# ---------------------------------------------------------------------------
# Scrape all sources for a ticker
# ---------------------------------------------------------------------------

@app.route('/scrape', methods=['POST'])
def scrape():
    data = request.json or {}
    symbol = data.get('symbol', '').upper()
    ticker_id = data.get('ticker_id')
    if not symbol or not ticker_id:
        return jsonify({"error": "symbol and ticker_id required"}), 400

    from yfinance_scraper import fetch_recent_history
    from newsapi_scraper import fetch_news
    from reddit_scraper import fetch_posts
    from edgar_scraper import fetch_filings
    from twitter_scraper import fetch_tweets
    from sentiment import get_sentiment

    counts: dict[str, int] = {}

    # Price update
    conn = get_db()
    last_row = conn.execute("SELECT MAX(date) as d FROM price_history WHERE ticker_id=?", (ticker_id,)).fetchone()
    last_date = last_row['d'] if last_row else None
    conn.close()

    if last_date:
        price_records = fetch_recent_history(symbol, last_date)
        conn = get_db()
        for r in price_records:
            conn.execute(
                "INSERT INTO price_history (ticker_id, date, open, high, low, close, adj_close, volume) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(ticker_id, date) DO UPDATE SET close=excluded.close, adj_close=excluded.adj_close, volume=excluded.volume",
                (ticker_id, r['date'], r['open'], r['high'], r['low'], r['close'], r['adj_close'], r['volume'])
            )
        conn.commit()
        sync(conn)
        conn.close()
        counts['prices'] = len(price_records)

    # Get company name for better news search
    conn = get_db()
    ticker_row = conn.execute("SELECT name FROM tickers WHERE id=?", (ticker_id,)).fetchone()
    company_name = ticker_row['name'] if ticker_row else ""
    conn.close()

    # Scrape all text sources
    all_items: list[dict] = []
    all_items += fetch_news(symbol, company_name)
    all_items += fetch_posts(symbol)
    all_items += fetch_filings(symbol)
    all_items += fetch_tweets(symbol)

    # Score sentiment and save
    conn = get_db()
    saved = 0
    for item in all_items:
        text = (item.get('title') or '') + ' ' + (item.get('body') or '')
        s = get_sentiment(text.strip())
        conn.execute(
            "INSERT INTO news_events (ticker_id, source, title, body, url, published_at, sentiment_score, sentiment_label) VALUES (?,?,?,?,?,?,?,?)",
            (ticker_id, item['source'], item.get('title'), item.get('body'), item.get('url'), item.get('published_at'), s['score'], s['label'])
        )
        saved += 1
    conn.commit()
    sync(conn)
    conn.close()
    counts['events'] = saved

    logger.info(f"Scraped {symbol}: {counts}")
    return jsonify(counts)


# ---------------------------------------------------------------------------
# Train / retrain model
# ---------------------------------------------------------------------------

@app.route('/train', methods=['POST'])
def train_model():
    data = request.json or {}
    symbol = data.get('symbol', '').upper()
    ticker_id = data.get('ticker_id')
    if not symbol or not ticker_id:
        return jsonify({"error": "symbol and ticker_id required"}), 400

    try:
        from train import train
        result = train(ticker_id, symbol)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 422
    except Exception as e:
        logger.error(f"Training error for {symbol}: {e}")
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Predict
# ---------------------------------------------------------------------------

@app.route('/predict', methods=['POST'])
def run_predict():
    data = request.json or {}
    symbol = data.get('symbol', '').upper()
    ticker_id = data.get('ticker_id')
    if not symbol or not ticker_id:
        return jsonify({"error": "symbol and ticker_id required"}), 400

    try:
        from predict import predict
        result = predict(ticker_id, symbol, anthropic_key=ANTHROPIC_KEY)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 422
    except Exception as e:
        logger.error(f"Prediction error for {symbol}: {e}")
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------

if __name__ == '__main__':
    port = int(os.getenv('ML_PORT', 5001))
    logger.info(f"Flask ML service starting on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
