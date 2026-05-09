'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save, RefreshCw, Database, Brain, Clock } from 'lucide-react';

type CronStatus = {
  schedule: string;
  running: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
};

export default function SettingsPage() {
  const [cronStatus, setCronStatus] = useState<CronStatus | null>(null);
  const [schedule, setSchedule] = useState('0 7 * * *');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/cron').then(r => r.json()).then((d: CronStatus) => {
      setCronStatus(d);
      setSchedule(d.schedule);
    });
  }, []);

  async function saveSchedule() {
    setSaving(true);
    await fetch('/api/cron', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_schedule', schedule }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-700 bg-slate-900 px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
        <Link href="/" className="btn-secondary p-2">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-lg font-bold">Settings</h1>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-6">
        {/* Scheduler */}
        <section className="card">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-indigo-400" />
            <h2 className="font-semibold">Scheduler</h2>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-slate-400 block mb-1">Cron Schedule</label>
              <input
                type="text"
                value={schedule}
                onChange={e => setSchedule(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 font-mono text-sm focus:outline-none focus:border-indigo-500 min-h-[44px]"
                placeholder="0 7 * * *"
              />
              <p className="text-xs text-slate-500 mt-1">Cron syntax. Default: 0 7 * * * (7:00 AM daily)</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={saveSchedule} disabled={saving} className="btn-primary text-sm gap-2">
                <Save className="w-4 h-4" />
                {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Schedule'}
              </button>
              {cronStatus && (
                <span className="text-xs text-slate-500">
                  Status: <span className={cronStatus.last_run_status === 'error' ? 'text-red-400' : 'text-green-400'}>{cronStatus.last_run_status ?? 'idle'}</span>
                </span>
              )}
            </div>
          </div>
        </section>

        {/* API Keys */}
        <section className="card">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="w-5 h-5 text-indigo-400" />
            <h2 className="font-semibold">API Keys</h2>
          </div>
          <p className="text-sm text-slate-400 mb-4">API keys are configured via environment variables in your <code className="bg-slate-700 px-1 rounded">.env</code> file. Copy <code className="bg-slate-700 px-1 rounded">.env.example</code> to <code className="bg-slate-700 px-1 rounded">.env</code> and fill in your values.</p>
          <div className="space-y-2 text-sm">
            {[
              { name: 'NEWS_API_KEY', label: 'NewsAPI', required: true },
              { name: 'REDDIT_CLIENT_ID', label: 'Reddit Client ID', required: true },
              { name: 'REDDIT_CLIENT_SECRET', label: 'Reddit Client Secret', required: true },
              { name: 'ANTHROPIC_API_KEY', label: 'Claude API', required: true },
              { name: 'TWITTER_BEARER_TOKEN', label: 'X/Twitter Bearer Token', required: false },
            ].map(key => (
              <div key={key.name} className="flex items-center gap-2 p-2 bg-slate-700 rounded-lg">
                <code className="text-indigo-300 text-xs flex-1">{key.name}</code>
                <span className={`text-xs px-1.5 py-0.5 rounded ${key.required ? 'bg-red-900 text-red-300' : 'bg-slate-600 text-slate-400'}`}>
                  {key.required ? 'required' : 'optional'}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ML Service */}
        <section className="card">
          <div className="flex items-center gap-2 mb-4">
            <RefreshCw className="w-5 h-5 text-indigo-400" />
            <h2 className="font-semibold">ML Service</h2>
          </div>
          <p className="text-sm text-slate-400 mb-3">
            The Flask ML service must be running separately. Start it with:
          </p>
          <pre className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-slate-300 overflow-auto">
{`cd ml
pip install -r requirements.txt
python app.py`}
          </pre>
          <p className="text-xs text-slate-500 mt-2">Default: <code>http://localhost:5001</code> — override with <code>ML_SERVICE_URL</code> env var.</p>
        </section>

        {/* DB Info */}
        <section className="card">
          <div className="flex items-center gap-2 mb-4">
            <Database className="w-5 h-5 text-indigo-400" />
            <h2 className="font-semibold">Database</h2>
          </div>
          <p className="text-sm text-slate-400">
            Local SQLite database at <code className="bg-slate-700 px-1 rounded">stocksense.db</code> in the project root. No cloud sync required.
          </p>
        </section>
      </main>
    </div>
  );
}
