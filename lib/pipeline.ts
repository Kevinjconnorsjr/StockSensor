import axios from 'axios';
import { getAllTickers, insertScrapeLog, getSetting } from './db';

const ML_URL = process.env.ML_SERVICE_URL ?? 'http://localhost:5001';

export type PipelineResult = {
  symbol: string;
  scrape: 'success' | 'error';
  predict: 'success' | 'error' | 'skipped';
  error?: string;
};

export async function runPipeline(symbols?: string[]): Promise<PipelineResult[]> {
  const tickers = (await getAllTickers()).filter(t => !symbols || symbols.includes(t.symbol));
  const results: PipelineResult[] = [];

  for (const ticker of tickers) {
    const result: PipelineResult = { symbol: ticker.symbol, scrape: 'success', predict: 'skipped' };
    try {
      await axios.post(`${ML_URL}/scrape`, { symbol: ticker.symbol, ticker_id: ticker.id });
      await insertScrapeLog({ ticker_id: ticker.id, source: 'pipeline', status: 'success', message: null });
    } catch (e: unknown) {
      result.scrape = 'error';
      result.error = e instanceof Error ? e.message : String(e);
      await insertScrapeLog({ ticker_id: ticker.id, source: 'pipeline', status: 'error', message: result.error });
    }

    try {
      const res = await axios.post(`${ML_URL}/predict`, { symbol: ticker.symbol, ticker_id: ticker.id });
      if (res.data?.direction) result.predict = 'success';
    } catch {
      result.predict = 'error';
    }

    results.push(result);
  }

  return results;
}

export async function getCronSchedule(): Promise<string> {
  return (await getSetting('cron_schedule')) ?? process.env.CRON_SCHEDULE ?? '0 7 * * *';
}
