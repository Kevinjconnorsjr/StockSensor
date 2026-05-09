"""Training logic for the StockLSTM model."""
import os
import sqlite3
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from sklearn.preprocessing import StandardScaler
import pickle
import logging
from datetime import datetime
from model import StockLSTM, SEQUENCE_LENGTH, DIRECTION_LABELS

logger = logging.getLogger(__name__)
DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'stocksense.db')
MODELS_DIR = os.path.join(os.path.dirname(__file__), 'models')
os.makedirs(MODELS_DIR, exist_ok=True)

DIRECTION_THRESHOLD = 0.005  # 0.5% move = directional


def _load_data(ticker_id: int) -> pd.DataFrame:
    conn = sqlite3.connect(DB_PATH)
    prices = pd.read_sql(
        "SELECT date, close, adj_close, volume FROM price_history WHERE ticker_id=? ORDER BY date",
        conn, params=(ticker_id,)
    )
    events = pd.read_sql(
        """SELECT DATE(published_at) as date, AVG(sentiment_score) as sentiment_avg,
                  COUNT(*) as sentiment_count,
                  SUM(CASE WHEN source='newsapi' THEN 1 ELSE 0 END) as news_count,
                  SUM(CASE WHEN source='reddit' THEN 1 ELSE 0 END) as reddit_count
           FROM news_events WHERE ticker_id=? AND sentiment_score IS NOT NULL
           GROUP BY DATE(published_at)""",
        conn, params=(ticker_id,)
    )
    conn.close()

    df = prices.merge(events, on='date', how='left')
    df['sentiment_avg'] = df['sentiment_avg'].fillna(0.0)
    df['sentiment_count'] = df['sentiment_count'].fillna(0.0)
    df['news_count'] = df['news_count'].fillna(0.0)
    df['reddit_count'] = df['reddit_count'].fillna(0.0)
    return df


def _engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    price_col = df['adj_close'].fillna(df['close'])
    df['ma7'] = price_col.rolling(7, min_periods=1).mean()
    df['ma30'] = price_col.rolling(30, min_periods=1).mean()
    df['price'] = price_col
    df['next_close'] = price_col.shift(-1)
    df['pct_change'] = (df['next_close'] - df['price']) / df['price']
    df['direction'] = df['pct_change'].apply(
        lambda x: 2 if x > DIRECTION_THRESHOLD else (0 if x < -DIRECTION_THRESHOLD else 1)
    )
    return df.dropna(subset=['next_close'])


def build_sequences(df: pd.DataFrame, scaler: StandardScaler | None = None):
    feature_cols = ['price', 'volume', 'ma7', 'ma30', 'sentiment_avg', 'sentiment_count', 'news_count', 'reddit_count']
    X_raw = df[feature_cols].values.astype(float)
    y_dir = df['direction'].values.astype(int)
    y_price = df['next_close'].values.astype(float)

    if scaler is None:
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X_raw)
    else:
        X_scaled = scaler.transform(X_raw)

    sequences, dir_targets, price_targets = [], [], []
    for i in range(SEQUENCE_LENGTH, len(X_scaled)):
        sequences.append(X_scaled[i - SEQUENCE_LENGTH:i])
        dir_targets.append(y_dir[i])
        price_targets.append(y_price[i])

    return np.array(sequences), np.array(dir_targets), np.array(price_targets), scaler


def train(ticker_id: int, symbol: str, epochs: int = 50) -> dict:
    df = _load_data(ticker_id)
    if len(df) < 90:
        raise ValueError(f"Not enough data for {symbol}: {len(df)} days (need 90)")

    df = _engineer_features(df)
    X, y_dir, y_price, scaler = build_sequences(df)

    split = int(len(X) * 0.8)
    X_train = torch.FloatTensor(X[:split])
    y_dir_train = torch.LongTensor(y_dir[:split])
    y_price_train = torch.FloatTensor(y_price[:split])
    X_val = torch.FloatTensor(X[split:])
    y_dir_val = torch.LongTensor(y_dir[split:])

    ds = TensorDataset(X_train, y_dir_train, y_price_train)
    loader = DataLoader(ds, batch_size=32, shuffle=True)

    model = StockLSTM()
    opt = torch.optim.Adam(model.parameters(), lr=1e-3, weight_decay=1e-4)
    ce_loss = nn.CrossEntropyLoss()
    mse_loss = nn.MSELoss()

    model.train()
    for epoch in range(epochs):
        for xb, yb_dir, yb_price in loader:
            opt.zero_grad()
            logits, price_pred = model(xb)
            loss = ce_loss(logits, yb_dir) + 0.1 * mse_loss(price_pred, yb_price)
            loss.backward()
            opt.step()

    model.eval()
    with torch.no_grad():
        logits_val, _ = model(X_val)
        preds = logits_val.argmax(dim=1)
        accuracy = float((preds == y_dir_val).float().mean())

    version = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    model_path = os.path.join(MODELS_DIR, f"{symbol}_v{version}.pt")
    scaler_path = os.path.join(MODELS_DIR, f"{symbol}_v{version}_scaler.pkl")
    torch.save(model.state_dict(), model_path)
    with open(scaler_path, 'wb') as f:
        pickle.dump(scaler, f)

    # Save metadata to DB
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "INSERT INTO model_metadata (ticker_id, data_points, accuracy, model_path) VALUES (?, ?, ?, ?)",
        (ticker_id, len(X), accuracy, model_path)
    )
    conn.commit()
    conn.close()

    logger.info(f"Trained {symbol}: accuracy={accuracy:.3f}, data_points={len(X)}, path={model_path}")
    return {"accuracy": accuracy, "data_points": len(X), "model_path": model_path, "version": version}
