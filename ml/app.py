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

from db_helper import get_client, init_schema
init_schema()


# ---------------------------------------------------------------------------
# Health & status
# ---------------------------------------------------------------------------

@app.route('/')
def index():
    return jsonify({"service": "StockSensor ML", "status": "running", "endpoints": ["/status", "/validate/<symbol>", "/pull_history", "/scrape", "/train", "/predict"]})

@app.route('/status')
def status():
    return jsonify({"ok": True})


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

    db = get_client()
    rows = [
        {'ticker_id': ticker_id, 'date': r['date'], 'open': r['open'], 'high': r['high'],
         'low': r['low'], 'close': r['close'], 'adj_close': r['adj_close'], 'volume': r['volume']}
        for r in records
    ]
    db.table('price_history').upsert(rows, on_conflict='ticker_id,date').execute()

    if records:
        ipo = records[0]['date']
        db.table('tickers').update({'ipo_date': ipo}).eq('id', ticker_id).execute()

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
    db = get_client()

    # Get latest price date
    result = db.table('price_history').select('date').eq('ticker_id', ticker_id).order('date', desc=True).limit(1).execute()
    last_date = result.data[0]['date'] if result.data else None

    if last_date:
        price_records = fetch_recent_history(symbol, last_date)
        rows = [
            {'ticker_id': ticker_id, 'date': r['date'], 'open': r['open'], 'high': r['high'],
             'low': r['low'], 'close': r['close'], 'adj_close': r['adj_close'], 'volume': r['volume']}
            for r in price_records
        ]
        if rows:
            db.table('price_history').upsert(rows, on_conflict='ticker_id,date').execute()
        counts['prices'] = len(price_records)

    # Get company name for better news search
    result = db.table('tickers').select('name').eq('id', ticker_id).single().execute()
    company_name = (result.data or {}).get('name') or ''

    # Scrape all text sources
    all_items: list[dict] = []
    all_items += fetch_news(symbol, company_name)
    all_items += fetch_posts(symbol)
    all_items += fetch_filings(symbol)
    all_items += fetch_tweets(symbol)

    # Score sentiment and save
    events_to_insert = []
    for item in all_items:
        text = (item.get('title') or '') + ' ' + (item.get('body') or '')
        s = get_sentiment(text.strip())
        events_to_insert.append({
            'ticker_id': ticker_id,
            'source': item['source'],
            'title': item.get('title'),
            'body': item.get('body'),
            'url': item.get('url'),
            'published_at': item.get('published_at'),
            'sentiment_score': s['score'],
            'sentiment_label': s['label'],
        })

    if events_to_insert:
        db.table('news_events').insert(events_to_insert).execute()
    counts['events'] = len(events_to_insert)

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
    port = int(os.getenv('PORT', os.getenv('ML_PORT', 5001)))
    logger.info(f"Flask ML service starting on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
