export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAllTickers, addTicker, deactivateTicker, getTickerBySymbol, getLatestPrediction, getLatestModelMetadata } from '@/lib/db';
import axios from 'axios';

const ML_URL = process.env.ML_SERVICE_URL ?? 'http://localhost:5001';

export async function GET() {
  try {
    const tickers = await getAllTickers();
    const enriched = await Promise.all(
      tickers.map(async t => ({
        ...t,
        prediction: (await getLatestPrediction(t.id)) ?? null,
        model: (await getLatestModelMetadata(t.id)) ?? null,
      }))
    );
    return NextResponse.json(enriched);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { symbols } = await req.json() as { symbols: string };
  if (!symbols?.trim()) {
    return NextResponse.json({ error: 'symbols required' }, { status: 400 });
  }

  const list = symbols.split(',').map((s: string) => s.trim().toUpperCase()).filter(Boolean);
  const results = [];

  for (const sym of list) {
    try {
      const existing = await getTickerBySymbol(sym);
      if (existing) {
        results.push({ symbol: sym, status: 'already_tracked', id: existing.id });
        continue;
      }

      const validateRes = await axios.get(`${ML_URL}/validate/${sym}`).catch(() => null);
      const name: string = validateRes?.data?.name ?? sym;

      const ticker = await addTicker(sym, name);

      // Kick off async historical pull
      void axios.post(`${ML_URL}/pull_history`, { symbol: sym, ticker_id: ticker.id }).catch(() => null);

      results.push({ symbol: sym, status: 'added', id: ticker.id });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e);
      results.push({ symbol: sym, status: 'error', error: msg });
    }
  }

  return NextResponse.json(results);
}

export async function DELETE(req: NextRequest) {
  const { symbol } = await req.json() as { symbol: string };
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });
  await deactivateTicker(symbol);
  return NextResponse.json({ ok: true });
}
