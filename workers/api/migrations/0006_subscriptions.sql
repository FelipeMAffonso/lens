-- S0-W5 — subscription discovery persistence.
-- Apply with: wrangler d1 execute LENS_D1 --remote --file=migrations/0006_subscriptions.sql

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,                 -- ULID
  user_id TEXT NOT NULL,
  service TEXT NOT NULL,               -- "Netflix" | "Spotify Premium" | ...
  amount REAL,                         -- renewal amount (USD, v2 multi-currency)
  currency TEXT DEFAULT 'USD',
  cadence TEXT,                        -- "monthly" | "yearly" | "weekly" | "quarterly" | null
  next_renewal_at TEXT,                -- ISO date, nullable
  source TEXT NOT NULL,                -- "gmail" | "manual" | "extension"
  source_ref TEXT,                     -- Gmail message ID (or null)
  active INTEGER NOT NULL DEFAULT 1,   -- 0 | 1
  detected_intent TEXT,                -- 'confirmation' | 'renewal' | 'cancellation' | 'trial-ending'
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  raw_payload_json TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subs_user_service ON subscriptions(user_id, service);
CREATE INDEX IF NOT EXISTS idx_subs_user_renewal ON subscriptions(user_id, next_renewal_at);
CREATE INDEX IF NOT EXISTS idx_subs_active ON subscriptions(user_id, active);
