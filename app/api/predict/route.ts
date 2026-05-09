import { NextRequest, NextResponse } from 'next/server';
import { getTickerBySymbol, getAllTickers, insertPrediction, getLatestPrediction } from '@/lib/db';
import axios from 'axios';

const ML_URL = process.env.ML_SERVICE_URL ?? 'http://localhost:5001';

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol');
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });
  const ticker = await getTickerBySymbol(symbol);
  if (!ticker) return NextResponse.json({ error: 'ticker not found' }, { status: 404 });
  return NextResponse.json((await getLatestPrediction(ticker.id)) ?? null);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { symbol?: string; retrain?: boolean };
  const tickers = body.symbol
    ? [await getTickerBySymbol(body.symbol)].filter(Boolean)
    : await getAllTickers();

  const results = [];
  for (const ticker of tickers) {
    if (!ticker) continue;
    try {
      if (body.retrain) {
        await axios.post(`${ML_URL}/train`, { symbol: ticker.symbol, ticker_id: ticker.id });
      }
      const res = await axios.post(`${ML_URL}/predict`, { symbol: ticker.symbol, ticker_id: ticker.id });
      const pred = res.data as { direction: 'up' | 'down' | 'neutral'; price_target: number; confidence: number; reasoning: string; model_version: string };
      await insertPrediction({
        ticker_id: ticker.id,
        direction: pred.direction,
        price_target: pred.price_target,
        confidence: pred.confidence,
        reasoning: pred.reasoning,
        model_version: pred.model_version ?? null,
      });
      results.push({ symbol: ticker.symbol, status: 'success', prediction: pred });
    } catch (e: unknown) {
      results.push({ symbol: ticker.symbol, status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json(results);
}
