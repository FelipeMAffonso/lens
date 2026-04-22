-- S6-W37 — post-purchase performance ratings + Layer-4 revealed-preference loop.
-- Apply with: wrangler d1 execute LENS_D1 --remote --file=migrations/0007_performance.sql

CREATE TABLE IF NOT EXISTS performance_ratings (
  id TEXT PRIMARY KEY,                      -- ULID
  user_id TEXT NOT NULL,
  purchase_id TEXT NOT NULL,                -- FK → purchases.id (no hard FK in D1)
  overall_rating INTEGER NOT NULL,          -- 1..5
  would_buy_again INTEGER NOT NULL,         -- 0 | 1
  criterion_feedback_json TEXT,             -- JSON array of {criterion, signal}
  notes TEXT,                               -- user free-text, never used for ranking
  preference_snapshot_json TEXT,            -- { before, after, deltas, reason } at rating time
  category TEXT,                            -- purchase.category cached for analytics
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_perf_user_purchase ON performance_ratings(user_id, purchase_id);
CREATE INDEX IF NOT EXISTS idx_perf_user_created ON performance_ratings(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_perf_category ON performance_ratings(category);
