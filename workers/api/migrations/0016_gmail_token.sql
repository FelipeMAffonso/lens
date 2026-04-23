-- 0016_gmail_token.sql — VISION #20 Gmail OAuth token storage for the receipt poller.
-- F12 handles the OAuth dance; this table is the persistent token home.

CREATE TABLE IF NOT EXISTS gmail_token (
  user_id           TEXT PRIMARY KEY,
  access_token      TEXT NOT NULL,
  refresh_token     TEXT NOT NULL,
  scopes            TEXT,              -- space-separated scope list
  expires_at        TEXT NOT NULL,     -- ISO timestamp
  connected_email   TEXT,              -- human-readable, shown in settings
  revoked           INTEGER NOT NULL DEFAULT 0,
  last_polled_at    TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gmail_revoked ON gmail_token(revoked);
CREATE INDEX IF NOT EXISTS idx_gmail_polled ON gmail_token(last_polled_at);