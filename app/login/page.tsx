'use client';

import { useState, FormEvent } from 'react';
import { BarChart2 } from 'lucide-react';

export default function LoginPage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (res.ok) {
      window.location.href = '/';
    } else {
      setError('Invalid access code.');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <BarChart2 className="w-12 h-12 text-indigo-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-100">StockSense AI</h1>
          <p className="text-slate-400 mt-2 text-sm">Enter your access code to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Access Code
            </label>
            <input
              type="password"
              value={code}
              onChange={e => setCode(e.target.value)}
              required
              autoFocus
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button type="submit" disabled={loading} className="btn btn-primary w-full justify-center">
            {loading ? 'Checking…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
