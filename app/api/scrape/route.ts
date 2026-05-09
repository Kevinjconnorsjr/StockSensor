export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getTickerBySymbol, getAllTickers, insertScrapeLog } from '@/lib/db';
import axios from 'axios';

const ML_URL = process.env.ML_SERVICE_URL ?? 'http://localhost:5001';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { symbol?: string };
  const tickers = body.symbol
    ? [await getTickerBySymbol(body.symbol)].filter(Boolean)
    : await getAllTickers();

  if (!tickers.length) {
    return NextResponse.json({ error: 'No tickers found' }, { status: 404 });
  }

  const results = [];
  for (const ticker of tickers) {
    if (!ticker) continue;
    try {
      const res = await axios.post(`${ML_URL}/scrape`, { symbol: ticker.symbol, ticker_id: ticker.id });
      await insertScrapeLog({ ticker_id: ticker.id, source: 'all', status: 'success', message: JSON.stringify(res.data) });
      results.push({ symbol: ticker.symbol, status: 'success', counts: res.data });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await insertScrapeLog({ ticker_id: ticker.id, source: 'all', status: 'error', message: msg });
      results.push({ symbol: ticker.symbol, status: 'error', error: msg });
    }
  }

  return NextResponse.json(results);
}
