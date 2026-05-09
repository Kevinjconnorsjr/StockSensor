'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { TrendingUp, TrendingDown, Minus, RefreshCw, Settings, Plus, X, BarChart2 } from 'lucide-react';
import type { Ticker, Prediction } from '@/lib/db';

type EnrichedTicker = Ticker & {
  prediction: Prediction | null;
  model: { trained_at: string; accuracy: number | null } | null;
};

type CronStatus = {
  schedule: string;
  running: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
};

function DirectionIcon({ direction }: { direction: 'up' | 'down' | 'neutral' | undefined }) {
  if (direction === 'up') return <TrendingUp className="w-5 h-5 text-green-400" />;
  if (direction === 'down') return <TrendingDown className="w-5 h-5 text-red-400" />;
  return <Minus className="w-5 h-5 text-slate-400" />;
}

function DirectionLabel({ direction }: { direction: 'up' | 'down' | 'neutral' | undefined }) {
  if (direction === 'up') return <span className="badge-up">UP</span>;
  if (direction === 'down') return <span className="badge-down">DOWN</span>;
  return <span className="badge-neutral">NEUTRAL</span>;
}

export default function Dashboard() {
  const [tickers, setTickers] = useState<EnrichedTicker[]>([]);
  const [cronStatus, setCronStatus] = useState<CronStatus | null>(null);
  const [addInput, setAddInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [running, setRunning] = useState(false);
  const [addError, setAddError] = useState('');

  const fetchTickers = useCallback(async () => {
    const res = await fetch('/api/tickers');
    const data = await res.json();
    setTickers(data);
  }, []);

  const fetchCron = useCallback(async () => {
    const res = await fetch('/api/cron');
    const data = await res.json();
    setCronStatus(data);
  }, []);

  useEffect(() => {
    fetchTickers();
    fetchCron();
    const id = setInterval(fetchCron, 30000);
    return () => clearInterval(id);
  }, [fetchTickers, fetchCron]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addInput.trim()) return;
    setAdding(true);
    setAddError('');
    try {
      const res = await fetch('/api/tickers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: addInput }),
      });
      const data = await res.json();
      const errors = data.filter((r: { status: string }) => r.status === 'error');
      if (errors.length) {
        setAddError(errors.map((r: { symbol: string; error: string }) => `${r.symbol}: ${r.error}`).join(', '));
      } else {
        setAddInput('');
        await fetchTickers();
      }
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(symbol: string) {
    await fetch('/api/tickers', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol }),
    });
    await fetchTickers();
  }

  async function handleRunNow() {
    setRunning(true);
    try {
      await fetch('/api/cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run_now' }),
      });
      await fetchCron();
    } finally {
      setTimeout(() => setRunning(false), 2000);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-900 px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
        <BarChart2 className="w-6 h-6 text-indigo-400 shrink-0" />
        <h1 className="text-lg font-bold text-slate-100 mr-auto">StockSense AI</h1>

        <div className="text-xs text-slate-500 hidden sm:block">
          {cronStatus?.last_run_at
            ? `Last run: ${new Date(cronStatus.last_run_at).toLocaleTimeString()}`
            : 'Never run'}
          {cronStatus?.last_run_status && (
            <span className={`ml-2 ${cronStatus.last_run_status === 'error' ? 'text-red-400' : cronStatus.last_run_status === 'running' ? 'text-yellow-400' : 'text-green-400'}`}>
              {cronStatus.last_run_status}
            </span>
          )}
        </div>

        <button onClick={handleRunNow} disabled={running} className="btn-primary text-sm gap-2">
          <RefreshCw className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Run Now</span>
        </button>

        <Link href="/settings" className="btn-secondary text-sm">
          <Settings className="w-4 h-4" />
        </Link>
      </header>

      <main className="flex-1 p-4 max-w-7xl mx-auto w-full">
        {/* Add ticker form */}
        <form onSubmit={handleAdd} className="mb-6 flex gap-2 flex-wrap">
          <input
            type="text"
            inputMode="text"
            value={addInput}
            onChange={e => setAddInput(e.target.value)}
            placeholder="Enter tickers, e.g. AAPL, TSLA, NVDA"
            className="flex-1 min-w-0 bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 min-h-[44px]"
          />
          <button type="submit" disabled={adding} className="btn-primary gap-2 shrink-0">
            <Plus className="w-4 h-4" />
            {adding ? 'Adding...' : 'Track'}
          </button>
        </form>
        {addError && <p className="text-red-400 text-sm mb-4">{addError}</p>}

        {tickers.length === 0 ? (
          <div className="text-center py-24 text-slate-500">
            <BarChart2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg">No tickers tracked yet.</p>
            <p className="text-sm mt-1">Add a symbol above to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {tickers.map(ticker => (
              <TickerCard key={ticker.id} ticker={ticker} onRemove={handleRemove} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function TickerCard({ ticker, onRemove }: { ticker: EnrichedTicker; onRemove: (s: string) => void }) {
  const pred = ticker.prediction;

  return (
    <Link href={`/ticker/${ticker.symbol}`} className="card hover:border-slate-500 transition-colors relative group block">
      <button
        onClick={e => { e.preventDefault(); onRemove(ticker.symbol); }}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-slate-500 hover:text-red-400 p-1 rounded"
        aria-label="Remove ticker"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl font-bold text-slate-100">{ticker.symbol}</span>
        {ticker.name && <span className="text-xs text-slate-500 truncate">{ticker.name}</span>}
      </div>

      {pred ? (
        <>
          <div className="flex items-center gap-2 mb-2">
            <DirectionIcon direction={pred.direction} />
            <DirectionLabel direction={pred.direction} />
            {pred.price_target && (
              <span className="text-slate-300 text-sm ml-auto">${pred.price_target.toFixed(2)}</span>
            )}
          </div>

          <div className="w-full bg-slate-700 rounded-full h-1.5 mb-2">
            <div
              className={`h-1.5 rounded-full ${pred.direction === 'up' ? 'bg-green-500' : pred.direction === 'down' ? 'bg-red-500' : 'bg-slate-500'}`}
              style={{ width: `${(pred.confidence * 100).toFixed(0)}%` }}
            />
          </div>
          <p className="text-xs text-slate-500">{(pred.confidence * 100).toFixed(0)}% confidence</p>
        </>
      ) : (
        <p className="text-slate-500 text-sm">No prediction yet</p>
      )}
    </Link>
  );
}
