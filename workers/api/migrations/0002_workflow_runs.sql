-- F3 — workflow engine run log
-- Apply with: wrangler d1 execute LENS_D1 --remote --file=migrations/0002_workflow_runs.sql

CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,                 -- ulid
  workflow_id TEXT NOT NULL,           -- e.g. "audit.text", "recall.watch"
  workflow_version TEXT NOT NULL,
  user_id TEXT,                        -- optional (not every workflow is user-scoped)
  anon_user_id TEXT,
  status TEXT NOT NULL,                -- queued | running | completed | failed | cancelled
  input_json TEXT NOT NULL,
  output_json TEXT,                    -- populated on completion
  error_json TEXT,                     -- { message, stack, nodeId }
  nodes_json TEXT NOT NULL,            -- per-node state map
  started_at TEXT NOT NULL,            -- ISO
  completed_at TEXT,
  total_tokens_in INTEGER DEFAULT 0,
  total_tokens_out INTEGER DEFAULT 0,
  total_cost_usd REAL DEFAULT 0,
  trace_id TEXT                        -- for F17 observability
);
CREATE INDEX IF NOT EXISTS idx_runs_workflow ON workflow_runs(workflow_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_user ON workflow_runs(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_status ON workflow_runs(status, started_at DESC);
