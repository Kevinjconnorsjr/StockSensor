PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tickers (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol    TEXT UNIQUE NOT NULL,
  name      TEXT,
  ipo_date  DATE,
  active    INTEGER NOT NULL DEFAULT 1,
  added_at  DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS price_history (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker_id INTEGER NOT NULL REFERENCES tickers(id) ON DELETE CASCADE,
  date      DATE NOT NULL,
  open      REAL,
  high      REAL,
  low       REAL,
  close     REAL,
  adj_close REAL,
  volume    INTEGER,
  UNIQUE(ticker_id, date)
);

CREATE INDEX IF NOT EXISTS idx_price_history_ticker_date ON price_history(ticker_id, date);

CREATE TABLE IF NOT EXISTS news_events (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker_id        INTEGER NOT NULL REFERENCES tickers(id) ON DELETE CASCADE,
  source           TEXT NOT NULL CHECK(source IN ('newsapi','reddit','edgar','twitter')),
  title            TEXT,
  body             TEXT,
  url              TEXT,
  published_at     DATETIME,
  sentiment_score  REAL,
  sentiment_label  TEXT CHECK(sentiment_label IN ('positive','negative','neutral')),
  scraped_at       DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_news_events_ticker_published ON news_events(ticker_id, published_at);

CREATE TABLE IF NOT EXISTS predictions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker_id     INTEGER NOT NULL REFERENCES tickers(id) ON DELETE CASCADE,
  predicted_at  DATETIME NOT NULL DEFAULT (datetime('now')),
  direction     TEXT NOT NULL CHECK(direction IN ('up','down','neutral')),
  price_target  REAL,
  confidence    REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  reasoning     TEXT,
  model_version TEXT
);

CREATE INDEX IF NOT EXISTS idx_predictions_ticker_date ON predictions(ticker_id, predicted_at);

CREATE TABLE IF NOT EXISTS model_metadata (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker_id    INTEGER NOT NULL REFERENCES tickers(id) ON DELETE CASCADE,
  trained_at   DATETIME NOT NULL DEFAULT (datetime('now')),
  data_points  INTEGER,
  accuracy     REAL,
  model_path   TEXT
);

CREATE TABLE IF NOT EXISTS scrape_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker_id   INTEGER REFERENCES tickers(id) ON DELETE CASCADE,
  source      TEXT,
  status      TEXT NOT NULL CHECK(status IN ('success','error','pending')),
  message     TEXT,
  ran_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

INSERT OR IGNORE INTO settings(key, value) VALUES
  ('cron_schedule', '0 7 * * *'),
  ('min_data_days', '90'),
  ('retrain_interval_days', '30'),
  ('confidence_threshold', '0'),
  ('max_news_retention_days', '0');
