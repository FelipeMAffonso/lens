-- F1 — auth + identity
-- Applies to: LENS_D1 binding
-- Apply with: wrangler d1 execute LENS_D1 --remote --file=migrations/0001_auth.sql

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                 -- ulid
  email TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL,            -- ISO-8601
  last_seen_at TEXT NOT NULL,
  anon_ref TEXT,                       -- original anonUserId at sign-up time
  display_name TEXT,
  tier TEXT NOT NULL DEFAULT 'free'
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,                 -- ulid; maps to JWT jti
  user_id TEXT NOT NULL REFERENCES users(id),
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  user_agent TEXT,
  ip_hash TEXT                         -- sha256(IP); never store raw IP
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_revoked ON sessions(revoked_at);

CREATE TABLE IF NOT EXISTS magic_tokens (
  token_hash TEXT PRIMARY KEY,         -- sha256(rawToken)
  email TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,            -- iso, 15 min after issued_at
  used_at TEXT,
  requesting_anon_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_magic_tokens_email ON magic_tokens(email);
CREATE INDEX IF NOT EXISTS idx_magic_tokens_expires ON magic_tokens(expires_at);
