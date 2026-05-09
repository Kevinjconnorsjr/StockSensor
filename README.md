---
title: StockSensor ML
emoji: 📈
colorFrom: indigo
colorTo: purple
sdk: docker
pinned: false
---

# StockSense AI

AI-powered stock tracker that correlates news, Reddit sentiment, and SEC filings to price history, then generates daily predictions using a locally-trained LSTM model.

## Stack

| Layer | Local Dev | Production |
|-------|-----------|------------|
| Frontend | Next.js 14 (localhost:3000) | Vercel |
| Database | SQLite (`file:stocksense.db`) | Turso (free tier) |
| ML Service | Flask (localhost:5001) | Railway |
| Scrapers | Python (yfinance, PRAW, EDGAR, NewsAPI) | same, via Railway |
| Scheduler | `node-cron` in Next.js | same, in Vercel serverless |

---

## Local Development

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/StockSensor
cd StockSensor
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
# Fill in API keys (see .env.example for instructions)
```

**Required keys:**
- `NEWS_API_KEY` — [newsapi.org](https://newsapi.org/register) (free: 100 req/day)
- `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` — [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps)
- `ANTHROPIC_API_KEY` — [console.anthropic.com](https://console.anthropic.com) (for AI reasoning, ~$0.003/prediction)

**Optional:**
- `TWITTER_BEARER_TOKEN` — X/Twitter Basic API ($100/mo) — app works without it

### 3. Start the Flask ML service

```bash
cd ml
python -m venv venv
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

pip install -r requirements.txt
python app.py
# Runs on http://localhost:5001
```

### 4. Start Next.js

```bash
# In a new terminal, from project root
npm run dev
# Open http://localhost:3000
```

---

## Production Deployment

### Architecture

```
Vercel (Next.js)  ──► Turso (SQLite cloud)
        │
        └──────────► Railway (Flask ML service)
                            ├── yfinance
                            ├── NewsAPI / Reddit / EDGAR
                            └── FinBERT + PyTorch LSTM
```

### Step 1 — Set up Turso database

```bash
# Install Turso CLI
npm install -g @turso/cli   # or: brew install tursodatabase/tap/turso

# Log in
turso auth login

# Create database
turso db create stocksense

# Get connection URL and token
turso db show stocksense --url      # → TURSO_DATABASE_URL
turso db tokens create stocksense   # → TURSO_AUTH_TOKEN
```

### Step 2 — Deploy ML service to Railway

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
2. Set the **Root Directory** to `ml/`
3. Railway auto-detects Python via `requirements.txt`
4. Add these environment variables in Railway:
   - `NEWS_API_KEY`
   - `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT`
   - `ANTHROPIC_API_KEY`
   - `TWITTER_BEARER_TOKEN` (optional)
5. Note the public URL Railway assigns (e.g. `https://stocksense-ml-production.up.railway.app`)

### Step 3 — Deploy Next.js to Vercel

1. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub (`StockSensor`)
2. Vercel auto-detects Next.js — no build config needed
3. Add these environment variables in the Vercel dashboard:

| Variable | Value |
|----------|-------|
| `TURSO_DATABASE_URL` | From Step 1 |
| `TURSO_AUTH_TOKEN` | From Step 1 |
| `ML_SERVICE_URL` | Railway URL from Step 2 |
| `NEWS_API_KEY` | Your NewsAPI key |
| `REDDIT_CLIENT_ID` | Your Reddit app ID |
| `REDDIT_CLIENT_SECRET` | Your Reddit secret |
| `ANTHROPIC_API_KEY` | Your Anthropic key |
| `TWITTER_BEARER_TOKEN` | Optional |

4. Click **Deploy**

---

## Usage

1. **Add tickers** — Enter symbols like `AAPL, TSLA, NVDA` on the dashboard
2. **Historical pull** — The ML service fetches all price history since IPO automatically
3. **Run pipeline** — Click "Run Now" to scrape today's data and generate predictions
4. **View predictions** — Click any ticker card to see the full chart with event overlays and today's AI prediction
5. **Auto-schedule** — Pipeline runs daily at 7 AM by default (configurable in Settings)
6. **Install as app** — On mobile, tap "Add to Home Screen" (PWA-enabled)

---

## Project Structure

```
StockSensor/
├── app/                        # Next.js App Router pages & layouts
│   ├── page.tsx                # Dashboard
│   ├── ticker/[symbol]/        # Ticker detail page
│   ├── settings/               # Settings page
│   └── api/                    # API routes
├── components/                 # Shared React components
├── lib/                        # DB helpers, pipeline, cron
├── ml/                         # Python Flask ML service (→ Railway)
│   ├── app.py                  # Flask entry point
│   ├── model.py                # PyTorch LSTM
│   ├── train.py                # Training logic
│   ├── predict.py              # Prediction + Claude reasoning
│   ├── sentiment.py            # FinBERT wrapper
│   ├── requirements.txt
│   ├── railway.toml            # Railway deployment config
│   └── Procfile
├── scrapers/                   # Data scraper modules
├── db/                         # SQLite schema
├── public/                     # Static assets + PWA manifest
├── vercel.json                 # Vercel deployment config
└── .env.example                # Environment variable template
```

---

## Open Questions (from PRD)

- **OQ-01**: Removed tickers are deactivated (hidden), not deleted — historical data preserved
- **OQ-02**: Minimum 90 days of data required before first LSTM prediction
- **OQ-03**: Uses Claude API for reasoning when `ANTHROPIC_API_KEY` is set; falls back to rule-based summary
- **OQ-05**: X/Twitter is optional — app works without `TWITTER_BEARER_TOKEN`
