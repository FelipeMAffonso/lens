-- 0015_push_digest.sql — VISION #17 web-push VAPID + #22 weekly digest.

CREATE TABLE IF NOT EXISTS push_subscription (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           TEXT,                                   -- NULL for anon
  anon_user_id      TEXT,                                   -- when not signed in
  endpoint          TEXT NOT NULL UNIQUE,                   -- VAPID push endpoint
  p256dh_key        TEXT NOT NULL,
  auth_key          TEXT NOT NULL,
  user_agent        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  last_delivery_at  TEXT,
  delivery_failures INTEGER NOT NULL DEFAULT 0,
  active            INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscription(user_id);
CREATE INDEX IF NOT EXISTS idx_push_anon ON push_subscription(anon_user_id);
CREATE INDEX IF NOT EXISTS idx_push_active ON push_subscription(active);

CREATE TABLE IF NOT EXISTS digest_preference (
  user_id           TEXT PRIMARY KEY,
  email             TEXT,
  cadence           TEXT NOT NULL DEFAULT 'weekly',         -- 'weekly' | 'monthly' | 'disabled'
  send_day          INTEGER NOT NULL DEFAULT 5,             -- 0=Sun … 5=Fri
  send_hour_utc     INTEGER NOT NULL DEFAULT 14,            -- 14 UTC = 10am EDT / 7am PDT
  timezone          TEXT DEFAULT 'America/New_York',
  last_sent_at      TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS digest_delivery (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           TEXT NOT NULL,
  sent_at           TEXT NOT NULL DEFAULT (datetime('now')),
  body_html         TEXT,
  body_summary_json TEXT CHECK (body_summary_json IS NULL OR json_valid(body_summary_json)),
  delivery_provider TEXT NOT NULL DEFAULT 'resend',
  delivery_status   TEXT NOT NULL DEFAULT 'sent',           -- 'sent' | 'bounced' | 'failed'
  provider_message_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_digest_user_sent ON digest_delivery(user_id, sent_at DESC);