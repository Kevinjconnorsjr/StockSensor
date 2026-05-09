"""Generates predictions using a trained StockLSTM model."""
import os
import numpy as np
import pandas as pd
import torch
import pickle
import logging
from model import StockLSTM, SEQUENCE_LENGTH, DIRECTION_LABELS
from train import _load_data, _engineer_features
from db_helper import get_client

logger = logging.getLogger(__name__)
MODELS_DIR = os.path.join(os.path.dirname(__file__), 'models')


def _latest_model(symbol: str) -> tuple[str, str] | tuple[None, None]:
    db = get_client()
    result = db.table('tickers').select('id').eq('symbol', symbol).maybe_single().execute()
    if not result.data:
        return None, None
    ticker_id = result.data['id']
    result = db.table('model_metadata').select('model_path').eq('ticker_id', ticker_id).order('trained_at', desc=True).limit(1).execute()
    if not result.data:
        return None, None
    model_path = result.data[0]['model_path']
    scaler_path = model_path.replace('.pt', '_scaler.pkl')
    return model_path, scaler_path


def predict(ticker_id: int, symbol: str, anthropic_key: str = "") -> dict:
    model_path, scaler_path = _latest_model(symbol)
    if not model_path or not os.path.exists(model_path):
        raise ValueError(f"No trained model for {symbol}. Run /train first.")

    model = StockLSTM()
    model.load_state_dict(torch.load(model_path, map_location='cpu'))
    model.eval()

    with open(scaler_path, 'rb') as f:
        scaler = pickle.load(f)

    df = _load_data(ticker_id)
    df = _engineer_features(df)

    feature_cols = ['price', 'volume', 'ma7', 'ma30', 'sentiment_avg', 'sentiment_count', 'news_count', 'reddit_count']
    X_raw = df[feature_cols].tail(SEQUENCE_LENGTH).values.astype(float)
    if len(X_raw) < SEQUENCE_LENGTH:
        raise ValueError(f"Not enough recent data for prediction: {len(X_raw)} rows")

    X_scaled = scaler.transform(X_raw)
    X_tensor = torch.FloatTensor(X_scaled).unsqueeze(0)

    with torch.no_grad():
        logits, price_delta = model(X_tensor)
        probs = torch.softmax(logits, dim=1)[0]
        direction_idx = probs.argmax().item()
        confidence = float(probs[direction_idx])
        direction = DIRECTION_LABELS[direction_idx]

    last_close = float(df['price'].iloc[-1])
    price_target = round(last_close + float(price_delta[0]) * last_close, 2)

    recent_sentiment = float(df['sentiment_avg'].tail(3).mean())
    recent_news_count = int(df['news_count'].tail(3).sum())
    ma7 = float(df['ma7'].iloc[-1])
    ma30 = float(df['ma30'].iloc[-1])

    reasoning = _build_reasoning(
        symbol, direction, confidence, price_target, last_close,
        recent_sentiment, recent_news_count, ma7, ma30, anthropic_key
    )

    version = os.path.basename(model_path).replace('.pt', '').replace(f'{symbol}_v', '')

    db = get_client()
    db.table('predictions').insert({
        'ticker_id': ticker_id,
        'direction': direction,
        'price_target': price_target,
        'confidence': confidence,
        'reasoning': reasoning,
        'model_version': version,
    }).execute()

    return {
        "direction": direction,
        "price_target": price_target,
        "confidence": round(confidence, 4),
        "reasoning": reasoning,
        "model_version": version,
    }


def _build_reasoning(
    symbol: str, direction: str, confidence: float, price_target: float,
    last_close: float, sentiment: float, news_count: int,
    ma7: float, ma30: float, anthropic_key: str
) -> str:
    if anthropic_key:
        return _reasoning_via_claude(symbol, direction, confidence, price_target, last_close, sentiment, news_count, ma7, ma30, anthropic_key)
    return _reasoning_rule_based(symbol, direction, confidence, price_target, last_close, sentiment, news_count, ma7, ma30)


def _reasoning_rule_based(symbol, direction, confidence, price_target, last_close, sentiment, news_count, ma7, ma30) -> str:
    parts = []
    sent_desc = "positive" if sentiment > 0.1 else "negative" if sentiment < -0.1 else "neutral"
    parts.append(f"Sentiment over the past 3 days averaged {sentiment:+.2f} ({sent_desc}).")
    if news_count > 0:
        parts.append(f"{news_count} news/social items collected recently.")
    trend = "above" if ma7 > ma30 else "below"
    parts.append(f"7-day MA ({ma7:.2f}) is {trend} 30-day MA ({ma30:.2f}), suggesting {'bullish' if trend == 'above' else 'bearish'} short-term trend.")
    parts.append(f"Model confidence: {confidence*100:.0f}%. Predicted direction: {direction.upper()}. Price target: ${price_target:.2f} vs last close ${last_close:.2f}.")
    return " ".join(parts)


def _reasoning_via_claude(symbol, direction, confidence, price_target, last_close, sentiment, news_count, ma7, ma30, api_key) -> str:
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        prompt = f"""You are a stock analysis AI. Generate a concise 2-3 sentence reasoning summary for this prediction:

Ticker: {symbol}
Direction: {direction.upper()}
Price target: ${price_target:.2f} (last close: ${last_close:.2f})
Model confidence: {confidence*100:.0f}%
3-day avg sentiment: {sentiment:+.2f}
Recent news/social items: {news_count}
7-day MA: ${ma7:.2f}, 30-day MA: ${ma30:.2f}

Explain WHY the model is predicting this direction based on the data. Be specific and factual."""

        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text.strip()
    except Exception as e:
        logger.error(f"Claude API error for reasoning: {e}")
        return _reasoning_rule_based(symbol, direction, confidence, price_target, last_close, sentiment, news_count, ma7, ma30)
