-- F2 — Core persistence tables per BLOCKS/F2-persistence.md.
-- Fills the gap left by 0001/0002/0003/0004:
--   audits, preferences, watchers, interventions, welfare_deltas.
-- Apply with:
--   wrangler d1 execute LENS_D1 --remote --file=migrations/0005_core_tables.sql

-- ─── audits ───────────────────────────────────────────────────────────────
-- Every Job-1 or Job-2 run gets one row. Enables /history/audits + welfare
-- aggregation + cross-device profile sync.
CREATE TABLE IF NOT EXISTS audits (
  id TEXT PRIMARY KEY,                 -- ULID
  user_id TEXT,                        -- nullable (anonymous runs)
  anon_user_id TEXT,                   -- always present (device-level)
  kind TEXT NOT NULL,                  -- 'query' | 'text' | 'image' | 'url' | 'photo'
  host TEXT,                           -- 'chatgpt' | 'claude' | 'gemini' | 'rufus' | 'perplexity' | 'unknown'
  category TEXT,                       -- normalized category slug, may be null
  intent_json TEXT NOT NULL,           -- serialized UserIntent
  ai_recommendation_json TEXT,         -- serialized AI answer (Job 2 only)
  spec_optimal_json TEXT NOT NULL,     -- {name, brand, price, utilityScore, utilityBreakdown}
  candidates_json TEXT,                -- serialized candidate list
  claims_json TEXT,                    -- claims verification output
  cross_model_json TEXT,               -- fanout disagreement output
  warnings_json TEXT,                  -- serialized warnings array
  elapsed_ms_total INTEGER NOT NULL,
  pack_version_map_json TEXT,          -- { "dark-pattern/hidden-costs": "1.0.0", ... }
  created_at TEXT NOT NULL,            -- ISO
  client_version TEXT,                 -- extension/web version tag, nullable
  client_origin TEXT                   -- 'web' | 'extension' | 'mcp' | 'api'
);
CREATE INDEX IF NOT EXISTS idx_audits_user ON audits(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audits_anon ON audits(anon_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audits_category ON audits(category, created_at DESC);

-- ─── preferences ──────────────────────────────────────────────────────────
-- One row per (user_id | anon_user_id) × category. Stores the criterion
-- weights + values overlay + source weighting (W13) that rerank audits.
CREATE TABLE IF NOT EXISTS preferences (
  id TEXT PRIMARY KEY,                 -- ULID
  user_id TEXT,
  anon_user_id TEXT,
  category TEXT NOT NULL,              -- normalized pack slug or free text
  criteria_json TEXT NOT NULL,         -- Array<Criterion>
  values_overlay_json TEXT,            -- Array<{key, weight}> — country-of-origin, B-Corp, etc.
  source_weighting_json TEXT,          -- {vendor: number, independent: number} (W13)
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_preferences_user_category ON preferences(user_id, category);
CREATE UNIQUE INDEX IF NOT EXISTS idx_preferences_anon_category ON preferences(anon_user_id, category);
CREATE INDEX IF NOT EXISTS idx_preferences_category ON preferences(category);

-- ─── watchers ─────────────────────────────────────────────────────────────
-- Any scheduled/background job bound to a user. Recall watcher, price-drop
-- watcher, firmware watcher, subscription renewal, arbitrary criteria alerts.
CREATE TABLE IF NOT EXISTS watchers (
  id TEXT PRIMARY KEY,                 -- ULID
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,                  -- 'recall' | 'price_drop' | 'firmware' | 'subscription' | 'alert_criteria'
  config_json TEXT NOT NULL,           -- kind-specific payload
  active INTEGER NOT NULL DEFAULT 1,   -- 0 | 1
  created_at TEXT NOT NULL,
  last_fired_at TEXT,
  last_fired_result_json TEXT,
  fired_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_watchers_user ON watchers(user_id, kind, active);
CREATE INDEX IF NOT EXISTS idx_watchers_active_kind ON watchers(active, kind, last_fired_at);

-- ─── interventions ────────────────────────────────────────────────────────
-- Lens-drafted advocate actions: FTC complaints, Magnuson-Moss returns,
-- cancel-subscription drafts, price-match filings. Status transitions: drafted
-- → sent → acknowledged → resolved | failed.
CREATE TABLE IF NOT EXISTS interventions (
  id TEXT PRIMARY KEY,                 -- ULID
  user_id TEXT NOT NULL,
  pack_slug TEXT NOT NULL,             -- 'intervention/file-ftc-complaint' etc.
  status TEXT NOT NULL,                -- 'drafted' | 'sent' | 'acknowledged' | 'resolved' | 'failed'
  payload_json TEXT NOT NULL,          -- filled template from pack
  related_purchase_id TEXT,
  related_audit_id TEXT,
  related_watcher_id TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  response_received_at TEXT,
  response_payload_json TEXT,
  next_intervention_id TEXT            -- self-referential chain
);
CREATE INDEX IF NOT EXISTS idx_interventions_user ON interventions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interventions_status ON interventions(status, created_at);
CREATE INDEX IF NOT EXISTS idx_interventions_pack ON interventions(pack_slug, created_at DESC);

-- ─── welfare_deltas ───────────────────────────────────────────────────────
-- Per-audit Lens vs AI pick rollup. Enables "+$312 / +0.15 utility" dashboard card.
CREATE TABLE IF NOT EXISTS welfare_deltas (
  audit_id TEXT PRIMARY KEY,           -- FK to audits(id)
  user_id TEXT,
  anon_user_id TEXT,
  category TEXT NOT NULL,
  lens_pick_name TEXT NOT NULL,
  lens_pick_brand TEXT,
  lens_pick_price REAL,
  lens_utility REAL NOT NULL,
  ai_pick_name TEXT,
  ai_pick_brand TEXT,
  ai_pick_price REAL,
  ai_utility REAL,
  utility_delta REAL,                  -- lens_utility - ai_utility
  price_delta REAL,                    -- ai_price - lens_price (positive = AI pricier)
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_welfare_user ON welfare_deltas(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_welfare_anon ON welfare_deltas(anon_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_welfare_category ON welfare_deltas(category, created_at DESC);
