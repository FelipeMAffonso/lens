-- S4-W22 — Stage-2 dark-pattern verification log + k-anon aggregate counter.
-- Apply with: wrangler d1 execute LENS_D1 --remote --file=migrations/0004_passive_scans.sql

CREATE TABLE IF NOT EXISTS passive_scans (
  id TEXT PRIMARY KEY,              -- ULID runId
  created_at TEXT NOT NULL,         -- ISO timestamp
  host TEXT NOT NULL,               -- "marriott.com"
  page_type TEXT NOT NULL,          -- "checkout" | "cart" | ...
  url TEXT,                         -- canonical URL (query/fragment stripped client-side)
  hit_count INTEGER NOT NULL,       -- Stage-1 hits sent
  confirmed_count INTEGER NOT NULL, -- Stage-2 confirmed
  latency_ms INTEGER NOT NULL,      -- total round-trip time including Opus
  ran TEXT NOT NULL,                -- "opus" | "heuristic-only"
  user_id TEXT,                     -- null for anonymous
  anon_user_id TEXT                 -- optional
);
CREATE INDEX IF NOT EXISTS idx_passive_scans_host ON passive_scans(host, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_passive_scans_user ON passive_scans(user_id, created_at DESC);

-- K-anonymous aggregate for the public ticker: count per (host, brignullId).
-- Composite primary key enforces uniqueness so ON CONFLICT upsert works.
CREATE TABLE IF NOT EXISTS passive_scan_aggregates (
  host TEXT NOT NULL,
  brignull_id TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  PRIMARY KEY (host, brignull_id)
);
CREATE INDEX IF NOT EXISTS idx_pat_agg_host ON passive_scan_aggregates(host);
CREATE INDEX IF NOT EXISTS idx_pat_agg_brignull ON passive_scan_aggregates(brignull_id);
