-- CJ-W48 — gift-buying shared-link flow.
-- Apply with: wrangler d1 execute lens-production --remote --file=migrations/0009_gift_requests.sql

CREATE TABLE IF NOT EXISTS gift_requests (
  id TEXT PRIMARY KEY,                    -- ULID
  giver_user_id TEXT NOT NULL,            -- account holder
  recipient_label TEXT,                   -- "My dad" / "Alex for graduation"
  occasion TEXT,                          -- "birthday" | "graduation" | ...
  category TEXT,                          -- optional category slug
  budget_min INTEGER,                     -- cents (nullable)
  budget_max INTEGER NOT NULL,            -- cents
  share_token_hash TEXT NOT NULL,         -- SHA-256 hex of the share token (never plaintext)
  status TEXT NOT NULL DEFAULT 'awaiting',-- 'awaiting' | 'completed' | 'revoked' | 'expired'
  expires_at TEXT NOT NULL,               -- ISO; default: created_at + 14 days
  created_at TEXT NOT NULL,
  completed_at TEXT,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_gift_giver ON gift_requests(giver_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_gift_token_hash ON gift_requests(share_token_hash);
CREATE INDEX IF NOT EXISTS idx_gift_status ON gift_requests(status, expires_at);

CREATE TABLE IF NOT EXISTS gift_responses (
  gift_id TEXT PRIMARY KEY,               -- FK → gift_requests.id
  criteria_json TEXT NOT NULL,            -- { criterion: weight }
  recipient_notes TEXT,
  submitted_at TEXT NOT NULL
);
