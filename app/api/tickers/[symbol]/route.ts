export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getTickerBySymbol, getPriceHistory, getNewsEvents, getAllPredictions } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: { symbol: string } }) {
  const ticker = await getTickerBySymbol(params.symbol);
  if (!ticker) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const from = req.nextUrl.searchParams.get('from') ?? undefined;
  const sources = req.nextUrl.searchParams.get('sources')?.split(',') ?? undefined;

  const [prices, events, predictions] = await Promise.all([
    getPriceHistory(ticker.id),
    getNewsEvents(ticker.id, from, sources),
    getAllPredictions(ticker.id),
  ]);

  return NextResponse.json({ ticker, prices, events, predictions });
}
