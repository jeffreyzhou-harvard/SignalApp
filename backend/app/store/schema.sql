-- backend/app/store/schema.sql  (reference only; init_db() is source of truth)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS raw_users (
    user_id TEXT PRIMARY KEY,
    fetched_at TIMESTAMPTZ,
    data JSONB
);

CREATE TABLE IF NOT EXISTS raw_tweets (
    tweet_id TEXT PRIMARY KEY,
    author_id TEXT,
    fetched_at TIMESTAMPTZ,
    data JSONB
);

CREATE TABLE IF NOT EXISTS personas (
    user_id TEXT PRIMARY KEY,
    seed_account_id TEXT,
    relationship TEXT,
    enrichment_tier INT,
    doc JSONB,
    vector vector,
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS jobs (
    job_id TEXT PRIMARY KEY,
    doc JSONB,
    status TEXT,
    created_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS cost_ledger (
    id TEXT PRIMARY KEY,
    job_id TEXT,
    provider TEXT,
    resource TEXT,
    count INT,
    unit_cost_usd DOUBLE PRECISION,
    total_usd DOUBLE PRECISION,
    dedup_hit BOOLEAN,
    created_at TIMESTAMPTZ
);
