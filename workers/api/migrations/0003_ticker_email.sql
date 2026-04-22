-- F16 + F12 migration: public disagreement ticker + Gmail OAuth tokens + purchases.
-- Apply with: wrangler d1 execute LENS_D1 --remote --file=migrations/0003_ticker_email.sql

-- F16 Ticker
CREATE TABLE IF NOT EXISTS ticker_events (
  id TEXT PRIMARY KEY,
  bucket_key TEXT NOT NULL,         -- "category:laptops|host:chatgpt|geo:us"
  category TEXT NOT NULL,
  host TEXT NOT NULL,
  geo TEXT NOT NULL,                -- "us"|"eu"|"other"|"unknown"
  k INTEGER NOT NULL,               -- unique anonUserId count
  sample_size INTEGER NOT NULL,     -- total audit runs in bucket
  agreement_rate REAL NOT NULL,     -- 0..1, fraction where lens pick == host pick
  avg_utility_gap REAL NOT NULL,    -- mean(lens_utility - ai_utility) where both present
  avg_price_gap REAL,               -- mean(ai_price - lens_price) where both present (positive = AI is pricier)
  computed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ticker_bucket ON ticker_events(bucket_key, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticker_category ON ticker_events(category, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticker_host ON ticker_events(host, computed_at DESC);

-- F12 Gmail OAuth + purchases
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,           -- 'gmail', 'plaid'
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  scopes TEXT,
  expires_at TEXT,
  last_refreshed_at TEXT,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_tokens_user_provider ON oauth_tokens(user_id, provider);

CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source TEXT NOT NULL,             -- 'gmail' | 'manual' | 'plaid' | 'extension'
  source_ref TEXT,                  -- message id / transaction id
  retailer TEXT,
  order_id TEXT,
  product_name TEXT NOT NULL,
  brand TEXT,
  category TEXT,
  price REAL,
  currency TEXT DEFAULT 'USD',
  purchased_at TEXT NOT NULL,
  delivered_at TEXT,
  warranty_until TEXT,
  raw_payload_json TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_source_ref ON purchases(user_id, source, source_ref);
CREATE INDEX IF NOT EXISTS idx_purchases_user ON purchases(user_id, purchased_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_retailer ON purchases(retailer, purchased_at DESC);
