'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, TrendingUp, TrendingDown, Minus, RefreshCw, Filter } from 'lucide-react';
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid, Scatter,
} from 'recharts';
import { format } from 'date-fns';
import type { Ticker, PricePoint, NewsEvent, Prediction } from '@/lib/db';

type TickerData = {
  ticker: Ticker;
  prices: PricePoint[];
  events: NewsEvent[];
  predictions: Prediction[];
};

const SOURCE_COLORS: Record<string, string> = {
  newsapi: '#818cf8',
  reddit: '#f97316',
  edgar: '#facc15',
  twitter: '#38bdf8',
};

const SENTIMENT_COLORS: Record<string, string> = {
  positive: '#22c55e',
  negative: '#ef4444',
  neutral: '#94a3b8',
};

const ALL_SOURCES = ['newsapi', 'reddit', 'edgar', 'twitter'];

export default function TickerDetailPage() {
  const { symbol } = useParams<{ symbol: string }>();
  const [data, setData] = useState<TickerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<NewsEvent | null>(null);
  const [activeSources, setActiveSources] = useState<string[]>(ALL_SOURCES);
  const [running, setRunning] = useState(false);

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/tickers/${symbol}?sources=${activeSources.join(',')}`);
    if (!res.ok) return;
    const d = await res.json();
    setData(d);
    setLoading(false);
  }, [symbol, activeSources]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const chartData = data?.prices.map(p => ({
    date: p.date,
    close: p.adj_close ?? p.close,
    label: format(new Date(p.date), 'MMM d, yy'),
  })) ?? [];

  // Build event dots by date for reference lines
  const eventsByDate = (data?.events ?? [])
    .filter(e => activeSources.includes(e.source))
    .reduce<Record<string, NewsEvent[]>>((acc, e) => {
      const d = e.published_at?.split('T')[0] ?? '';
      if (!acc[d]) acc[d] = [];
      acc[d].push(e);
      return acc;
    }, {});

  const prediction = data?.predictions[0];

  async function handleRunNow() {
    setRunning(true);
    try {
      await fetch('/api/scrape', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol }) });
      await fetch('/api/predict', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol }) });
      await fetchData();
    } finally {
      setRunning(false);
    }
  }

  function toggleSource(src: string) {
    setActiveSources(prev => prev.includes(src) ? prev.filter(s => s !== src) : [...prev, src]);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-indigo-500" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-slate-400">Ticker not found: {symbol}</p>
        <Link href="/" className="btn-secondary">Back to Dashboard</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-900 px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
        <Link href="/" className="btn-secondary p-2">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="mr-auto">
          <h1 className="text-lg font-bold">{symbol}</h1>
          {data.ticker.name && <p className="text-xs text-slate-500">{data.ticker.name}</p>}
        </div>
        <button onClick={handleRunNow} disabled={running} className="btn-primary text-sm gap-2">
          <RefreshCw className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row gap-0">
        {/* Chart area */}
        <div className="flex-1 p-4 flex flex-col gap-4 min-w-0">
          {/* Source filters */}
          <div className="flex gap-2 flex-wrap items-center">
            <Filter className="w-4 h-4 text-slate-500" />
            {ALL_SOURCES.map(src => (
              <button
                key={src}
                onClick={() => toggleSource(src)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-opacity border ${activeSources.includes(src) ? 'opacity-100' : 'opacity-40'}`}
                style={{ borderColor: SOURCE_COLORS[src], color: SOURCE_COLORS[src] }}
              >
                {src}
              </button>
            ))}
          </div>

          {/* Chart */}
          <div className="card flex-1 min-h-[300px] sm:min-h-[400px] p-2">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500">
                <p>No price data yet. Historical pull may be in progress.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    tickFormatter={v => format(new Date(v), 'MMM yy')}
                    minTickGap={60}
                  />
                  <YAxis
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    tickFormatter={v => `$${v}`}
                    width={60}
                  />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }}
                    formatter={(v: number) => [`$${v.toFixed(2)}`, 'Close']}
                    labelFormatter={l => format(new Date(l), 'MMM d, yyyy')}
                  />
                  <Line
                    type="monotone"
                    dataKey="close"
                    stroke="#6366f1"
                    dot={false}
                    strokeWidth={2}
                  />
                  {/* Event reference lines */}
                  {Object.entries(eventsByDate).map(([date, events]) => {
                    const firstLabel = events[0]?.sentiment_label ?? 'neutral';
                    return (
                      <ReferenceLine
                        key={date}
                        x={date}
                        stroke={SENTIMENT_COLORS[firstLabel]}
                        strokeOpacity={0.5}
                        strokeWidth={1}
                        strokeDasharray="3 3"
                      />
                    );
                  })}
                  {/* Scatter dots for events */}
                  <Scatter
                    data={chartData.filter(p => eventsByDate[p.date])}
                    dataKey="close"
                    fill="#818cf8"
                    shape={(props: { cx?: number; cy?: number; payload?: { date: string } }) => {
                      const evts = props.payload?.date ? eventsByDate[props.payload.date] : [];
                      const label = evts?.[0]?.sentiment_label ?? 'neutral';
                      return (
                        <circle
                          cx={props.cx}
                          cy={props.cy}
                          r={5}
                          fill={SENTIMENT_COLORS[label]}
                          stroke="#0f172a"
                          strokeWidth={1}
                          style={{ cursor: 'pointer' }}
                          onClick={() => evts?.length && setSelectedEvent(evts[0])}
                        />
                      );
                    }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Right sidebar: prediction + events */}
        <div className="lg:w-80 xl:w-96 flex flex-col gap-4 p-4 border-t lg:border-t-0 lg:border-l border-slate-700">
          {/* Prediction panel */}
          <PredictionPanel prediction={prediction} />

          {/* Event list */}
          <div className="card flex-1 overflow-auto max-h-[400px] lg:max-h-none">
            <h2 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wide">Recent Events</h2>
            {data.events.length === 0 ? (
              <p className="text-slate-500 text-sm">No events scraped yet.</p>
            ) : (
              <div className="space-y-2">
                {data.events.slice(0, 50).map(ev => (
                  <button
                    key={ev.id}
                    onClick={() => setSelectedEvent(ev)}
                    className="w-full text-left p-2 rounded-lg hover:bg-slate-700 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: SOURCE_COLORS[ev.source] + '33', color: SOURCE_COLORS[ev.source] }}>
                        {ev.source}
                      </span>
                      {ev.sentiment_label && (
                        <span className="text-xs" style={{ color: SENTIMENT_COLORS[ev.sentiment_label] }}>
                          {ev.sentiment_score !== null ? (ev.sentiment_score > 0 ? '+' : '') + ev.sentiment_score?.toFixed(2) : ev.sentiment_label}
                        </span>
                      )}
                      <span className="text-xs text-slate-600 ml-auto">{ev.published_at ? format(new Date(ev.published_at), 'MMM d') : ''}</span>
                    </div>
                    <p className="text-xs text-slate-300 line-clamp-2">{ev.title}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Event detail bottom sheet / modal */}
      {selectedEvent && (
        <EventDetailSheet event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </div>
  );
}

function PredictionPanel({ prediction }: { prediction?: Prediction }) {
  if (!prediction) {
    return (
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wide">Prediction</h2>
        <p className="text-slate-500 text-sm">No prediction available. Run the pipeline to generate one.</p>
      </div>
    );
  }

  const dirIcon = prediction.direction === 'up'
    ? <TrendingUp className="w-6 h-6 text-green-400" />
    : prediction.direction === 'down'
    ? <TrendingDown className="w-6 h-6 text-red-400" />
    : <Minus className="w-6 h-6 text-slate-400" />;

  const dirColor = prediction.direction === 'up' ? 'text-green-400' : prediction.direction === 'down' ? 'text-red-400' : 'text-slate-400';
  const barColor = prediction.direction === 'up' ? 'bg-green-500' : prediction.direction === 'down' ? 'bg-red-500' : 'bg-slate-500';

  return (
    <div className="card">
      <h2 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wide">Today&apos;s Prediction</h2>
      <div className="flex items-center gap-3 mb-3">
        {dirIcon}
        <span className={`text-2xl font-bold ${dirColor}`}>{prediction.direction.toUpperCase()}</span>
        {prediction.price_target && (
          <span className="ml-auto text-slate-200 font-mono">${prediction.price_target.toFixed(2)}</span>
        )}
      </div>
      <div className="mb-1">
        <div className="flex justify-between text-xs text-slate-500 mb-1">
          <span>Confidence</span>
          <span>{(prediction.confidence * 100).toFixed(0)}%</span>
        </div>
        <div className="w-full bg-slate-700 rounded-full h-2">
          <div className={`h-2 rounded-full ${barColor}`} style={{ width: `${prediction.confidence * 100}%` }} />
        </div>
      </div>
      {prediction.reasoning && (
        <p className="text-xs text-slate-400 mt-3 leading-relaxed">{prediction.reasoning}</p>
      )}
      <p className="text-xs text-slate-600 mt-2">{format(new Date(prediction.predicted_at), 'MMM d, yyyy h:mm a')}</p>
    </div>
  );
}

function EventDetailSheet({ event, onClose }: { event: NewsEvent; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-slate-800 border border-slate-700 rounded-t-2xl sm:rounded-2xl p-5 w-full sm:max-w-lg max-h-[80vh] overflow-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: SOURCE_COLORS[event.source] + '33', color: SOURCE_COLORS[event.source] }}>
            {event.source}
          </span>
          {event.sentiment_label && (
            <span className="text-xs font-medium" style={{ color: SENTIMENT_COLORS[event.sentiment_label] }}>
              {event.sentiment_label} ({event.sentiment_score !== null ? (event.sentiment_score > 0 ? '+' : '') + event.sentiment_score.toFixed(3) : 'n/a'})
            </span>
          )}
          <button onClick={onClose} className="ml-auto text-slate-500 hover:text-slate-300 text-xl leading-none">&times;</button>
        </div>
        {event.title && <h3 className="font-semibold text-slate-100 mb-2">{event.title}</h3>}
        {event.published_at && <p className="text-xs text-slate-500 mb-3">{format(new Date(event.published_at), 'PPpp')}</p>}
        {event.body && <p className="text-sm text-slate-300 leading-relaxed mb-4">{event.body.slice(0, 800)}{event.body.length > 800 ? '…' : ''}</p>}
        {event.url && (
          <a href={event.url} target="_blank" rel="noopener noreferrer" className="text-indigo-400 text-sm hover:underline break-all">
            View source
          </a>
        )}
      </div>
    </div>
  );
}
