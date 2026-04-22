-- CJ-W47 — family / household profiles.
-- Apply with: wrangler d1 execute lens-production --remote --file=migrations/0008_household_profiles.sql

CREATE TABLE IF NOT EXISTS household_members (
  id TEXT PRIMARY KEY,                 -- ULID
  user_id TEXT NOT NULL,               -- owning account
  name TEXT NOT NULL,
  role TEXT,                           -- 'owner' | 'adult' | 'teen' | 'child' | 'guest' | NULL
  relationship TEXT,                   -- free text: "partner", "kid", "roommate", ...
  birth_year INTEGER,
  created_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_household_user ON household_members(user_id, archived_at);

-- Preferences gain a nullable profile_id so per-profile overrides coexist
-- with the household default. SQLite UNIQUE allows NULL-distinct rows so
-- (user_id, category, NULL) is the default and (user_id, category, <id>)
-- are the per-profile overrides.
ALTER TABLE preferences ADD COLUMN profile_id TEXT;

DROP INDEX IF EXISTS idx_preferences_user_category;
DROP INDEX IF EXISTS idx_preferences_anon_category;

CREATE UNIQUE INDEX IF NOT EXISTS idx_preferences_user_category_profile
  ON preferences(user_id, category, profile_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_preferences_anon_category_profile
  ON preferences(anon_user_id, category, profile_id);
CREATE INDEX IF NOT EXISTS idx_preferences_profile ON preferences(profile_id);
