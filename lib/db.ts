import { createClient, type Client } from '@libsql/client';

let _client: Client | null = null;
let _initPromise: Promise<void> | null = null;

function getClient(): Client {
  if (_client) return _client;
  _client = createClient({
    url: process.env.TURSO_DATABASE_URL ?? 'file:stocksense.db',
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  return _client;
}

async function ensureInit(): Promise<void> {
  if (!_initPromise) _initPromise = initDb();
  return _initPromise;
}

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS tickers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT UNIQUE NOT NULL,
    name TEXT,
    ipo_date DATE,
    active INTEGER NOT NULL DEFAULT 1,
    added_at DATETIME NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker_id INTEGER NOT NULL REFERENCES tickers(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    open REAL, high REAL, low REAL, close REAL,
    adj_close REAL, volume INTEGER,
    UNIQUE(ticker_id, date)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_price_history_ticker_date ON price_history(ticker_id, date)`,
  `CREATE TABLE IF NOT EXISTS news_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker_id INTEGER NOT NULL REFERENCES tickers(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    title TEXT, body TEXT, url TEXT,
    published_at DATETIME,
    sentiment_score REAL,
    sentiment_label TEXT,
    scraped_at DATETIME NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_news_events_ticker_published ON news_events(ticker_id, published_at)`,
  `CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker_id INTEGER NOT NULL REFERENCES tickers(id) ON DELETE CASCADE,
    predicted_at DATETIME NOT NULL DEFAULT (datetime('now')),
    direction TEXT NOT NULL,
    price_target REAL,
    confidence REAL NOT NULL,
    reasoning TEXT,
    model_version TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_predictions_ticker_date ON predictions(ticker_id, predicted_at)`,
  `CREATE TABLE IF NOT EXISTS model_metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker_id INTEGER NOT NULL REFERENCES tickers(id) ON DELETE CASCADE,
    trained_at DATETIME NOT NULL DEFAULT (datetime('now')),
    data_points INTEGER, accuracy REAL, model_path TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS scrape_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker_id INTEGER REFERENCES tickers(id) ON DELETE CASCADE,
    source TEXT,
    status TEXT NOT NULL,
    message TEXT,
    ran_at DATETIME NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`,
  `INSERT OR IGNORE INTO settings(key,value) VALUES ('cron_schedule','0 7 * * *')`,
  `INSERT OR IGNORE INTO settings(key,value) VALUES ('min_data_days','90')`,
  `INSERT OR IGNORE INTO settings(key,value) VALUES ('retrain_interval_days','30')`,
];

export async function initDb(): Promise<void> {
  const db = getClient();
  for (const sql of SCHEMA_STATEMENTS) {
    await db.execute(sql);
  }
}

export type Ticker = {
  id: number;
  symbol: string;
  name: string | null;
  ipo_date: string | null;
  active: number;
  added_at: string;
};

export type PricePoint = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adj_close: number;
  volume: number;
};

export type NewsEvent = {
  id: number;
  ticker_id: number;
  source: 'newsapi' | 'reddit' | 'edgar' | 'twitter';
  title: string | null;
  body: string | null;
  url: string | null;
  published_at: string | null;
  sentiment_score: number | null;
  sentiment_label: 'positive' | 'negative' | 'neutral' | null;
  scraped_at: string;
};

export type Prediction = {
  id: number;
  ticker_id: number;
  predicted_at: string;
  direction: 'up' | 'down' | 'neutral';
  price_target: number | null;
  confidence: number;
  reasoning: string | null;
  model_version: string | null;
};

export type ModelMetadata = {
  id: number;
  ticker_id: number;
  trained_at: string;
  data_points: number | null;
  accuracy: number | null;
  model_path: string | null;
};

export type ScrapeLog = {
  id: number;
  ticker_id: number | null;
  source: string | null;
  status: 'success' | 'error' | 'pending';
  message: string | null;
  ran_at: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function row<T>(r: any): T { return r as T; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rows<T>(rs: any[]): T[] { return rs as T[]; }

// --- Ticker queries ---

export async function getAllTickers(): Promise<Ticker[]> {
  await ensureInit();
  const res = await getClient().execute('SELECT * FROM tickers WHERE active = 1 ORDER BY symbol');
  return rows<Ticker>(res.rows);
}

export async function getTickerBySymbol(symbol: string): Promise<Ticker | undefined> {
  await ensureInit();
  const res = await getClient().execute({ sql: 'SELECT * FROM tickers WHERE symbol = ?', args: [symbol.toUpperCase()] });
  return res.rows[0] ? row<Ticker>(res.rows[0]) : undefined;
}

export async function addTicker(symbol: string, name?: string): Promise<Ticker> {
  await ensureInit();
  const sym = symbol.toUpperCase();
  await getClient().execute({ sql: 'INSERT OR IGNORE INTO tickers (symbol, name) VALUES (?, ?)', args: [sym, name ?? null] });
  return (await getTickerBySymbol(sym))!;
}

export async function deactivateTicker(symbol: string): Promise<void> {
  await ensureInit();
  await getClient().execute({ sql: 'UPDATE tickers SET active = 0 WHERE symbol = ?', args: [symbol.toUpperCase()] });
}

export async function updateTickerIpoDate(tickerId: number, ipoDate: string): Promise<void> {
  await ensureInit();
  await getClient().execute({ sql: 'UPDATE tickers SET ipo_date = ? WHERE id = ?', args: [ipoDate, tickerId] });
}

// --- Price history ---

export async function getPriceHistory(tickerId: number): Promise<PricePoint[]> {
  await ensureInit();
  const res = await getClient().execute({
    sql: 'SELECT date,open,high,low,close,adj_close,volume FROM price_history WHERE ticker_id=? ORDER BY date ASC',
    args: [tickerId],
  });
  return rows<PricePoint>(res.rows);
}

export async function upsertPricePoint(tickerId: number, point: PricePoint): Promise<void> {
  await ensureInit();
  await getClient().execute({
    sql: `INSERT INTO price_history (ticker_id, date, open, high, low, close, adj_close, volume)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(ticker_id, date) DO UPDATE SET
            open=excluded.open, high=excluded.high, low=excluded.low,
            close=excluded.close, adj_close=excluded.adj_close, volume=excluded.volume`,
    args: [tickerId, point.date, point.open, point.high, point.low, point.close, point.adj_close, point.volume],
  });
}

export async function getLatestPriceDate(tickerId: number): Promise<string | null> {
  await ensureInit();
  const res = await getClient().execute({ sql: 'SELECT MAX(date) as d FROM price_history WHERE ticker_id=?', args: [tickerId] });
  const r = res.rows[0] as unknown as { d: string | null } | undefined;
  return r?.d ?? null;
}

// --- News events ---

export async function getNewsEvents(tickerId: number, fromDate?: string, sources?: string[]): Promise<NewsEvent[]> {
  await ensureInit();
  let sql = 'SELECT * FROM news_events WHERE ticker_id=?';
  const args: (string | number)[] = [tickerId];
  if (fromDate) { sql += ' AND published_at >= ?'; args.push(fromDate); }
  if (sources?.length) { sql += ` AND source IN (${sources.map(() => '?').join(',')})`; args.push(...sources); }
  sql += ' ORDER BY published_at DESC';
  const res = await getClient().execute({ sql, args });
  return rows<NewsEvent>(res.rows);
}

export async function insertNewsEvent(event: Omit<NewsEvent, 'id' | 'scraped_at'>): Promise<void> {
  await ensureInit();
  await getClient().execute({
    sql: `INSERT INTO news_events (ticker_id, source, title, body, url, published_at, sentiment_score, sentiment_label)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [event.ticker_id, event.source, event.title, event.body, event.url, event.published_at, event.sentiment_score, event.sentiment_label],
  });
}

// --- Predictions ---

export async function getLatestPrediction(tickerId: number): Promise<Prediction | undefined> {
  await ensureInit();
  const res = await getClient().execute({
    sql: 'SELECT * FROM predictions WHERE ticker_id=? ORDER BY predicted_at DESC LIMIT 1',
    args: [tickerId],
  });
  return res.rows[0] ? row<Prediction>(res.rows[0]) : undefined;
}

export async function getAllPredictions(tickerId: number): Promise<Prediction[]> {
  await ensureInit();
  const res = await getClient().execute({
    sql: 'SELECT * FROM predictions WHERE ticker_id=? ORDER BY predicted_at DESC',
    args: [tickerId],
  });
  return rows<Prediction>(res.rows);
}

export async function insertPrediction(p: Omit<Prediction, 'id' | 'predicted_at'>): Promise<void> {
  await ensureInit();
  await getClient().execute({
    sql: `INSERT INTO predictions (ticker_id, direction, price_target, confidence, reasoning, model_version)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [p.ticker_id, p.direction, p.price_target, p.confidence, p.reasoning, p.model_version],
  });
}

// --- Model metadata ---

export async function getLatestModelMetadata(tickerId: number): Promise<ModelMetadata | undefined> {
  await ensureInit();
  const res = await getClient().execute({
    sql: 'SELECT * FROM model_metadata WHERE ticker_id=? ORDER BY trained_at DESC LIMIT 1',
    args: [tickerId],
  });
  return res.rows[0] ? row<ModelMetadata>(res.rows[0]) : undefined;
}

export async function insertModelMetadata(m: Omit<ModelMetadata, 'id' | 'trained_at'>): Promise<void> {
  await ensureInit();
  await getClient().execute({
    sql: 'INSERT INTO model_metadata (ticker_id, data_points, accuracy, model_path) VALUES (?, ?, ?, ?)',
    args: [m.ticker_id, m.data_points, m.accuracy, m.model_path],
  });
}

// --- Scrape log ---

export async function insertScrapeLog(entry: Omit<ScrapeLog, 'id' | 'ran_at'>): Promise<void> {
  await ensureInit();
  await getClient().execute({
    sql: 'INSERT INTO scrape_log (ticker_id, source, status, message) VALUES (?, ?, ?, ?)',
    args: [entry.ticker_id, entry.source, entry.status, entry.message],
  });
}

export async function getRecentScrapeLogs(limit = 50): Promise<ScrapeLog[]> {
  await ensureInit();
  const res = await getClient().execute({ sql: 'SELECT * FROM scrape_log ORDER BY ran_at DESC LIMIT ?', args: [limit] });
  return rows<ScrapeLog>(res.rows);
}

// --- Settings ---

export async function getSetting(key: string): Promise<string | null> {
  try {
    await ensureInit();
    const res = await getClient().execute({ sql: 'SELECT value FROM settings WHERE key=?', args: [key] });
    const r = res.rows[0] as unknown as { value: string } | undefined;
    return r?.value ?? null;
  } catch {
    return null;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  await ensureInit();
  await getClient().execute({
    sql: 'INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    args: [key, value],
  });
}
