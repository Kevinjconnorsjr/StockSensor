import { supabase } from './supabase';

export type Ticker = {
  id: number;
  symbol: string;
  name: string | null;
  ipo_date: string | null;
  active: boolean;
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

// --- Ticker queries ---

export async function getAllTickers(): Promise<Ticker[]> {
  const { data, error } = await supabase
    .from('tickers')
    .select('*')
    .eq('active', true)
    .order('symbol');
  if (error) throw error;
  return (data ?? []) as Ticker[];
}

export async function getTickerBySymbol(symbol: string): Promise<Ticker | undefined> {
  const { data } = await supabase
    .from('tickers')
    .select('*')
    .eq('symbol', symbol.toUpperCase())
    .maybeSingle();
  return data as Ticker | undefined;
}

export async function addTicker(symbol: string, name?: string): Promise<Ticker> {
  const sym = symbol.toUpperCase();
  await supabase
    .from('tickers')
    .upsert({ symbol: sym, name: name ?? null }, { onConflict: 'symbol', ignoreDuplicates: true });
  const { data, error } = await supabase
    .from('tickers')
    .select('*')
    .eq('symbol', sym)
    .single();
  if (error) throw error;
  return data as Ticker;
}

export async function deactivateTicker(symbol: string): Promise<void> {
  const { error } = await supabase
    .from('tickers')
    .update({ active: false })
    .eq('symbol', symbol.toUpperCase());
  if (error) throw error;
}

export async function updateTickerIpoDate(tickerId: number, ipoDate: string): Promise<void> {
  const { error } = await supabase
    .from('tickers')
    .update({ ipo_date: ipoDate })
    .eq('id', tickerId);
  if (error) throw error;
}

// --- Price history ---

export async function getPriceHistory(tickerId: number): Promise<PricePoint[]> {
  const { data, error } = await supabase
    .from('price_history')
    .select('date,open,high,low,close,adj_close,volume')
    .eq('ticker_id', tickerId)
    .order('date', { ascending: true });
  if (error) throw error;
  return (data ?? []) as PricePoint[];
}

export async function upsertPricePoint(tickerId: number, point: PricePoint): Promise<void> {
  const { error } = await supabase
    .from('price_history')
    .upsert({ ticker_id: tickerId, ...point }, { onConflict: 'ticker_id,date' });
  if (error) throw error;
}

export async function getLatestPriceDate(tickerId: number): Promise<string | null> {
  const { data } = await supabase
    .from('price_history')
    .select('date')
    .eq('ticker_id', tickerId)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { date: string } | null)?.date ?? null;
}

// --- News events ---

export async function getNewsEvents(tickerId: number, fromDate?: string, sources?: string[]): Promise<NewsEvent[]> {
  let query = supabase
    .from('news_events')
    .select('*')
    .eq('ticker_id', tickerId)
    .order('published_at', { ascending: false });
  if (fromDate) query = query.gte('published_at', fromDate);
  if (sources?.length) query = query.in('source', sources);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as NewsEvent[];
}

export async function insertNewsEvent(event: Omit<NewsEvent, 'id' | 'scraped_at'>): Promise<void> {
  const { error } = await supabase.from('news_events').insert(event);
  if (error) throw error;
}

// --- Predictions ---

export async function getLatestPrediction(tickerId: number): Promise<Prediction | undefined> {
  const { data } = await supabase
    .from('predictions')
    .select('*')
    .eq('ticker_id', tickerId)
    .order('predicted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as Prediction | undefined;
}

export async function getAllPredictions(tickerId: number): Promise<Prediction[]> {
  const { data, error } = await supabase
    .from('predictions')
    .select('*')
    .eq('ticker_id', tickerId)
    .order('predicted_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Prediction[];
}

export async function insertPrediction(p: Omit<Prediction, 'id' | 'predicted_at'>): Promise<void> {
  const { error } = await supabase.from('predictions').insert(p);
  if (error) throw error;
}

// --- Model metadata ---

export async function getLatestModelMetadata(tickerId: number): Promise<ModelMetadata | undefined> {
  const { data } = await supabase
    .from('model_metadata')
    .select('*')
    .eq('ticker_id', tickerId)
    .order('trained_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as ModelMetadata | undefined;
}

export async function insertModelMetadata(m: Omit<ModelMetadata, 'id' | 'trained_at'>): Promise<void> {
  const { error } = await supabase.from('model_metadata').insert(m);
  if (error) throw error;
}

// --- Scrape log ---

export async function insertScrapeLog(entry: Omit<ScrapeLog, 'id' | 'ran_at'>): Promise<void> {
  const { error } = await supabase.from('scrape_log').insert(entry);
  if (error) throw error;
}

export async function getRecentScrapeLogs(limit = 50): Promise<ScrapeLog[]> {
  const { data, error } = await supabase
    .from('scrape_log')
    .select('*')
    .order('ran_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ScrapeLog[];
}

// --- Settings ---

export async function getSetting(key: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    return (data as { value: string } | null)?.value ?? null;
  } catch {
    return null;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  const { error } = await supabase
    .from('settings')
    .upsert({ key, value });
  if (error) throw error;
}
