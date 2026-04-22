# F16 — Public disagreement ticker

**Status:** in progress. High-impact: regulatory-grade public data.

## Why this is Nobel-level-worthy
The spec-resistance paper already established that 18 frontier models misrecommend ~21% of shopping queries. That data sits in a preprint. The ticker operationalizes the finding into a **live public dataset** that:
- Regulators (FTC, CFPB, EU DSA enforcement teams) can cite.
- Journalists can query in real time.
- Competing AI labs can see, publicly, how they rank against peers.
- Lens users can decide which assistants to trust for which categories.

No competitor has this. ChatGPT Shopping can't publish it (their revenue model forbids surfacing when they're wrong). Rufus can't (Amazon catalog bias). The category is empty until Lens fills it.

## Scope (what ships in this block)
- `workers/api/migrations/0003_ticker.sql`: `ticker_events` table.
- `workers/api/src/ticker/aggregator.ts`: bucket audits into `(category, host, geo)` cells. Enforce **k-anonymity: k ≥ 5 participants** before a cell is published.
- `workers/api/src/ticker/repo.ts`: D1 read/write.
- `workers/api/src/workflow/specs/ticker-aggregate.ts`: registered workflow. Wired to cron pattern `41 * * * *` (hourly; already in the cron registry).
- `workers/api/src/ticker/api.ts`: GET /ticker → all cells; GET /ticker/:category → category cells; both respect k-anonymity.
- Tests: 8+ (aggregation math, k-anonymity enforcement, endpoint shapes).

## Data model
```sql
CREATE TABLE ticker_events (
  id TEXT PRIMARY KEY,              -- ulid
  bucket_key TEXT NOT NULL,         -- "category:laptops|host:chatgpt|geo:us"
  category TEXT NOT NULL,
  host TEXT NOT NULL,               -- which AI assistant was being audited
  geo TEXT NOT NULL,                -- "us"|"eu"|"other"|"unknown"
  k INTEGER NOT NULL,               -- participants in this bucket (unique anonUserIds)
  sample_size INTEGER NOT NULL,     -- total audits in this bucket
  agreement_rate REAL NOT NULL,     -- % audits where lens top == host pick
  avg_utility_gap REAL NOT NULL,    -- mean(lens_utility - ai_utility)
  avg_price_gap REAL,               -- mean(lens_price - ai_price) where both known
  computed_at TEXT NOT NULL
);
CREATE INDEX idx_ticker_bucket ON ticker_events(bucket_key, computed_at DESC);
CREATE INDEX idx_ticker_category ON ticker_events(category, computed_at DESC);
```

## K-anonymity contract
Never publish a bucket with `k < 5`. Aggregate returned as `{count_suppressed}` in the API envelope when buckets exist but don't meet the threshold. This matches the FTC's disclosure-by-cohort framework and makes the ticker citable without privacy risk.

## Acceptance
- [ ] Migration 0003 applied.
- [ ] Aggregator computes buckets with k-anonymity from `workflow_runs` (audit runs).
- [ ] `ticker.aggregate` workflow registered + fires on hourly cron.
- [ ] GET /ticker returns published buckets + suppressed count.
- [ ] GET /ticker/:category filters.
- [ ] Tests: 8+ pass.
- [ ] Live smoke.

## Per AMBIENT_MODEL §4: this is the definitive background workflow. The cron fires, updates stats, the public dataset grows. Users opt in by using Lens; aggregation is anonymized by default.
