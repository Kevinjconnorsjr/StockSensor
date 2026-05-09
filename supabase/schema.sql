-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query)

create table if not exists tickers (
  id bigint generated always as identity primary key,
  symbol text unique not null,
  name text,
  ipo_date date,
  active boolean not null default true,
  added_at timestamptz not null default now()
);

create table if not exists price_history (
  id bigint generated always as identity primary key,
  ticker_id bigint not null references tickers(id) on delete cascade,
  date date not null,
  open real,
  high real,
  low real,
  close real,
  adj_close real,
  volume bigint,
  unique(ticker_id, date)
);

create index if not exists idx_price_history_ticker_date on price_history(ticker_id, date);

create table if not exists news_events (
  id bigint generated always as identity primary key,
  ticker_id bigint not null references tickers(id) on delete cascade,
  source text not null,
  title text,
  body text,
  url text,
  published_at timestamptz,
  sentiment_score real,
  sentiment_label text,
  scraped_at timestamptz not null default now()
);

create index if not exists idx_news_events_ticker_published on news_events(ticker_id, published_at);

create table if not exists predictions (
  id bigint generated always as identity primary key,
  ticker_id bigint not null references tickers(id) on delete cascade,
  predicted_at timestamptz not null default now(),
  direction text not null,
  price_target real,
  confidence real not null,
  reasoning text,
  model_version text
);

create index if not exists idx_predictions_ticker_date on predictions(ticker_id, predicted_at);

create table if not exists model_metadata (
  id bigint generated always as identity primary key,
  ticker_id bigint not null references tickers(id) on delete cascade,
  trained_at timestamptz not null default now(),
  data_points int,
  accuracy real,
  model_path text
);

create table if not exists scrape_log (
  id bigint generated always as identity primary key,
  ticker_id bigint references tickers(id) on delete cascade,
  source text,
  status text not null,
  message text,
  ran_at timestamptz not null default now()
);

create table if not exists settings (
  key text primary key,
  value text
);

insert into settings(key, value) values ('cron_schedule', '0 7 * * *') on conflict (key) do nothing;
insert into settings(key, value) values ('min_data_days', '90') on conflict (key) do nothing;
insert into settings(key, value) values ('retrain_interval_days', '30') on conflict (key) do nothing;

-- Enable RLS on all tables. Since we use the service-role key, RLS is bypassed
-- for server-side calls. This blocks any accidental anon/public access.
alter table tickers enable row level security;
alter table price_history enable row level security;
alter table news_events enable row level security;
alter table predictions enable row level security;
alter table model_metadata enable row level security;
alter table scrape_log enable row level security;
alter table settings enable row level security;
