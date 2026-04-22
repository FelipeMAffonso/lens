# F2 — Persistence: D1 + KV + R2

**Status:** pending.
**Prerequisites:** F1 (auth surfaces) — can run in parallel as long as auth migration runs first.
**Estimated time:** 6-8 hours.
**Blocks:** every Watcher / Historian / Advocate / multi-device workflow.

## Why this block exists

Today `wrangler.toml` has KV + R2 bindings commented out and no D1 binding. Every "server-keyed" or "cross-user anonymized" tier from `docs/DELIVERY_ARCHITECTURE.md` Axis 5 is unshippable until this lands.

The gap catalog enumerates: recall watcher (needs purchase history), welfare-delta aggregation (needs audit rows), subscription audit (needs Gmail-parsed receipts), gift-buying mode (needs shared profiles), public disagreement ticker (needs audit aggregate). All blocked on persistence.

## Design principles

1. **D1 for structured data** — users, sessions, audits, preferences, watchers, purchases, interventions, welfare_deltas, ticker_events.
2. **KV for ephemeral + indexed state** — rate-limit counters, cache layers for web-search, pack-registry cache for non-worker consumers, short-lived webhook idempotency keys.
3. **R2 for blob storage** — user-uploaded screenshots/photos, pack source PDFs (the two already in `data/sources/`), audit snapshots exportable as JSON or PDF, demo recordings.
4. **One migration file per concern.** Never edit an applied migration.
5. **Zod schemas for every row.** D1 returns `any`; our repo layer validates on read + write.
6. **Repo pattern** — one file per table, exported functions `list/get/create/update/delete`. No ORM.
7. **Every write is idempotent where possible.** `INSERT OR IGNORE` / `UPSERT` for deduplicated rows.
8. **All queries parameterized.** Never string-concatenate SQL.

## File inventory

### Wrangler config
`workers/api/wrangler.toml`:
```toml
[[d1_databases]]
binding = "LENS_D1"
database_name = "lens-production"
database_id = "<set after wrangler d1 create>"
migrations_dir = "migrations"

[[kv_namespaces]]
binding = "LENS_KV"
id = "<set after wrangler kv:namespace create>"
preview_id = "<preview id>"

[[r2_buckets]]
binding = "LENS_R2"
bucket_name = "lens-blobs"
preview_bucket_name = "lens-blobs-preview"
```

### Migrations
| File | Contents |
|---|---|
| `workers/api/migrations/0001_auth.sql` | from F1: users, sessions, magic_tokens |
| `workers/api/migrations/0002_audits.sql` | audits (id, user_or_anon, intent_json, result_json, created_at, etc.) |
| `workers/api/migrations/0003_preferences.sql` | category preference profiles per user |
| `workers/api/migrations/0004_purchases.sql` | purchases (source, receipt_ref, product, brand, price, currency, purchased_at, retailer, order_id) |
| `workers/api/migrations/0005_watchers.sql` | watcher subscriptions (kind, config_json, user_id, active, last_fired) |
| `workers/api/migrations/0006_interventions.sql` | filed interventions (kind, status, payload_json, created_at, sent_at, response_at) |
| `workers/api/migrations/0007_welfare.sql` | welfare_delta rollups + audit linkage |
| `workers/api/migrations/0008_ticker.sql` | ticker_events (anonymized disagreement samples) |
| `workers/api/migrations/0009_runs.sql` | workflow_runs (run_id, workflow_id, status, input_json, output_json, timings) |

### Source files
| Path | Purpose |
|---|---|
| `workers/api/src/db/client.ts` | D1 wrapper: `prepared(sql, ...params)`, `first`, `all`, `run` |
| `workers/api/src/db/repos/users.ts` | user CRUD |
| `workers/api/src/db/repos/audits.ts` | audit CRUD + list-by-user + stats |
| `workers/api/src/db/repos/preferences.ts` | preference profile per user+category |
| `workers/api/src/db/repos/purchases.ts` | purchases CRUD |
| `workers/api/src/db/repos/watchers.ts` | watcher CRUD + list-active-cron |
| `workers/api/src/db/repos/interventions.ts` | intervention CRUD + list-pending |
| `workers/api/src/db/repos/welfare.ts` | welfare aggregates + query helpers |
| `workers/api/src/db/repos/ticker.ts` | ticker emit + aggregate (k-anonymity) |
| `workers/api/src/db/repos/runs.ts` | workflow run log |
| `workers/api/src/db/schemas.ts` | Zod schemas mirroring every row shape |
| `workers/api/src/kv/cache.ts` | generic KV cache wrapper with TTL |
| `workers/api/src/kv/rate-limit.ts` | token-bucket rate limiter |
| `workers/api/src/kv/idempotency.ts` | idempotency-key webhooks |
| `workers/api/src/r2/blobs.ts` | R2 wrapper: put, get, presignedGet |
| `workers/api/src/r2/audit-pdf.ts` | PDF generator for audit snapshots |
| `workers/api/src/r2/screenshots.ts` | upload + retrieve user screenshots |
| `packages/shared/src/persistence.ts` | shared types for audit snapshots, purchase, watcher, intervention |

### Tests
| Path | Purpose |
|---|---|
| `workers/api/src/db/client.test.ts` | client wrapper smoke tests using miniflare D1 |
| `workers/api/src/db/repos/*.test.ts` | one per repo; round-trip + edge cases |
| `workers/api/src/kv/cache.test.ts` | TTL + expiration |
| `workers/api/src/kv/rate-limit.test.ts` | token-bucket behavior |
| `workers/api/src/r2/blobs.test.ts` | put/get roundtrip |

## Migration 0002 — audits table

```sql
CREATE TABLE audits (
  id TEXT PRIMARY KEY,                -- ulid
  user_id TEXT REFERENCES users(id),  -- nullable (anon)
  anon_user_id TEXT,                  -- always present
  kind TEXT NOT NULL,                 -- query | text | image | url | photo
  host TEXT,                          -- chatgpt | claude | gemini | rufus | perplexity | unknown
  category TEXT,
  intent_json TEXT NOT NULL,          -- JSON
  ai_recommendation_json TEXT,        -- JSON, nullable for Job 1
  spec_optimal_json TEXT NOT NULL,    -- JSON
  candidates_json TEXT NOT NULL,      -- JSON array
  claims_json TEXT,                   -- JSON
  cross_model_json TEXT,              -- JSON
  warnings_json TEXT,                 -- JSON
  elapsed_ms_total INTEGER NOT NULL,
  pack_version_map TEXT,              -- JSON { slug: version }
  created_at TEXT NOT NULL,
  client_version TEXT,                -- extension/web version
  client_origin TEXT                  -- "web" | "extension" | "mcp" | "api"
);
CREATE INDEX audits_user ON audits(user_id, created_at DESC);
CREATE INDEX audits_anon ON audits(anon_user_id, created_at DESC);
CREATE INDEX audits_category ON audits(category, created_at DESC);
```

## Migration 0003 — preferences

```sql
CREATE TABLE preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  anon_user_id TEXT,
  category TEXT NOT NULL,             -- normalized category slug
  criteria_json TEXT NOT NULL,        -- JSON array of Criterion
  values_overlay_json TEXT,           -- user's ethical/values overlay
  source_weighting_json TEXT,         -- W13 vendor vs independent weights
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, category),
  UNIQUE(anon_user_id, category)
);
```

## Migration 0004 — purchases

```sql
CREATE TABLE purchases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  source TEXT NOT NULL,               -- email | bank | manual | extension
  source_ref TEXT,                    -- e.g. gmail message id or Plaid transaction id
  retailer TEXT,                      -- amazon | bestbuy | ...
  order_id TEXT,
  product_name TEXT NOT NULL,
  brand TEXT,
  category TEXT,
  price REAL,
  currency TEXT DEFAULT 'USD',
  purchased_at TEXT NOT NULL,
  delivered_at TEXT,
  warranty_until TEXT,
  raw_payload_json TEXT,              -- the parsed receipt / transaction
  replaced_by TEXT,                   -- nullable, self-reference
  created_at TEXT NOT NULL
);
CREATE INDEX purchases_user ON purchases(user_id, purchased_at DESC);
CREATE INDEX purchases_retailer ON purchases(retailer, purchased_at DESC);
```

## Migration 0005 — watchers

```sql
CREATE TABLE watchers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,                 -- recall | price_drop | firmware | subscription | alert_criteria | ...
  config_json TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  last_fired_at TEXT,
  last_fired_result_json TEXT,
  fired_count INTEGER DEFAULT 0
);
CREATE INDEX watchers_active ON watchers(kind, active, last_fired_at);
```

## Migration 0006 — interventions

```sql
CREATE TABLE interventions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  pack_slug TEXT NOT NULL,            -- e.g. intervention/draft-magnuson-moss-return
  status TEXT NOT NULL,               -- drafted | sent | acknowledged | resolved | failed
  payload_json TEXT NOT NULL,         -- filled template
  related_purchase_id TEXT REFERENCES purchases(id),
  related_audit_id TEXT REFERENCES audits(id),
  created_at TEXT NOT NULL,
  sent_at TEXT,
  response_received_at TEXT,
  response_payload_json TEXT,
  next_intervention_id TEXT REFERENCES interventions(id)
);
CREATE INDEX interventions_user ON interventions(user_id, created_at DESC);
CREATE INDEX interventions_pending ON interventions(status, created_at);
```

## Migration 0007 — welfare_deltas

```sql
CREATE TABLE welfare_deltas (
  audit_id TEXT PRIMARY KEY REFERENCES audits(id),
  user_id TEXT REFERENCES users(id),
  anon_user_id TEXT,
  category TEXT NOT NULL,
  lens_pick_name TEXT NOT NULL,
  lens_pick_price REAL,
  lens_utility REAL NOT NULL,
  ai_pick_name TEXT,
  ai_pick_price REAL,
  ai_utility REAL,
  utility_delta REAL,
  price_delta REAL,
  created_at TEXT NOT NULL
);
CREATE INDEX welfare_user ON welfare_deltas(user_id, created_at DESC);
CREATE INDEX welfare_anon ON welfare_deltas(anon_user_id, created_at DESC);
```

## Migration 0008 — ticker_events (k-anonymized aggregates)

```sql
CREATE TABLE ticker_events (
  id TEXT PRIMARY KEY,
  bucket_key TEXT NOT NULL,           -- "category:espresso|host:chatgpt|model:gpt-4o"
  k INTEGER NOT NULL,                 -- participants in this bucket
  agreement_rate REAL NOT NULL,       -- 0..1
  sample_size INTEGER NOT NULL,
  computed_at TEXT NOT NULL
);
CREATE INDEX ticker_bucket ON ticker_events(bucket_key, computed_at DESC);
```

## Migration 0009 — workflow_runs

```sql
CREATE TABLE workflow_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  user_id TEXT REFERENCES users(id),
  anon_user_id TEXT,
  status TEXT NOT NULL,               -- queued | running | completed | failed | cancelled
  input_json TEXT NOT NULL,
  output_json TEXT,
  error_json TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  nodes_json TEXT NOT NULL,           -- node-level timings + status
  total_tokens_in INTEGER DEFAULT 0,
  total_tokens_out INTEGER DEFAULT 0,
  total_cost_usd REAL DEFAULT 0
);
CREATE INDEX runs_workflow ON workflow_runs(workflow_id, started_at DESC);
CREATE INDEX runs_user ON workflow_runs(user_id, started_at DESC);
```

## KV layout

Keys use `/` namespacing even though KV is flat:
- `rl:magic:{email}` — magic-link rate-limit counter (F1).
- `rl:audit:{userOrAnon}` — audit rate-limit counter.
- `rl:passive:{userOrAnon}` — passive-scan rate-limit.
- `cache:search:{sha256(category+criteria)}` — web-search result cache (TTL 1h).
- `cache:pack-registry:v{version}` — pack index for non-worker consumers (24h).
- `idempotency:{webhook_id}:{key}` — idempotency keys (24h).
- `lock:cron:{job_id}` — distributed lock for cron jobs (5-min TTL).
- `sess:ban:{jti}` — session revocation shortcut (mirrors D1 `revoked_at`).

## R2 layout

- `screenshots/{userId}/{auditId}.png` — user-uploaded screenshots.
- `photos/{userId}/{purchaseId}.jpg` — unboxing / product photos.
- `reports/{auditId}.pdf` — PDF snapshot of an audit card.
- `sources/{packSlug}/{filename}.pdf` — pack source documents.
- `exports/{userId}/{timestamp}.json` — profile export bundles.

All R2 reads go through a presigned-URL helper in `workers/api/src/r2/blobs.ts`. No direct R2 public buckets.

## Repo pattern example (`workers/api/src/db/repos/audits.ts`)

```ts
import { z } from "zod";
import type { D1Database } from "@cloudflare/workers-types";
import { ulid } from "ulid";
import { AuditRowSchema } from "../schemas";

export async function createAudit(
  db: D1Database,
  row: Omit<AuditRow, "id" | "created_at">,
): Promise<AuditRow> {
  const id = ulid();
  const created_at = new Date().toISOString();
  const full: AuditRow = { id, created_at, ...row };
  AuditRowSchema.parse(full);
  await db.prepare(`
    INSERT INTO audits (
      id, user_id, anon_user_id, kind, host, category,
      intent_json, ai_recommendation_json, spec_optimal_json,
      candidates_json, claims_json, cross_model_json, warnings_json,
      elapsed_ms_total, pack_version_map, created_at, client_version, client_origin
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    full.id, full.user_id ?? null, full.anon_user_id, full.kind, full.host,
    full.category, full.intent_json, full.ai_recommendation_json ?? null,
    full.spec_optimal_json, full.candidates_json, full.claims_json ?? null,
    full.cross_model_json ?? null, full.warnings_json ?? null,
    full.elapsed_ms_total, full.pack_version_map ?? null, full.created_at,
    full.client_version ?? null, full.client_origin ?? null,
  ).run();
  return full;
}

export async function listAuditsByUser(
  db: D1Database,
  userOrAnon: { userId?: string; anonUserId?: string },
  limit = 50,
): Promise<AuditRow[]> {
  if (userOrAnon.userId) {
    const r = await db.prepare(
      `SELECT * FROM audits WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`
    ).bind(userOrAnon.userId, limit).all();
    return r.results.map((x) => AuditRowSchema.parse(x));
  }
  const r = await db.prepare(
    `SELECT * FROM audits WHERE anon_user_id = ? ORDER BY created_at DESC LIMIT ?`
  ).bind(userOrAnon.anonUserId!, limit).all();
  return r.results.map((x) => AuditRowSchema.parse(x));
}

// getAudit, updateAuditStatus, deleteAudit, statsByUser follow same pattern.
```

## Migration from localStorage

`workers/api/src/auth/migrate.ts` (invoked from F1's verify handler):
1. Read request body: `{ anonUserId, localHistory: [], localProfiles: {} }`.
2. For each history entry → `createAudit(db, { ...entry, user_id: newUserId, anon_user_id: anonUserId })`.
3. For each profile → `createPreference(db, { ..., user_id: newUserId })`.
4. Return summary `{ importedAudits: N, importedProfiles: M }`.

On the client side, `SessionProvider.tsx` after sign-in POSTs local data as part of `/auth/verify` body.

## API surface additions

New endpoints (all auth-required):
- `GET /history/audits?limit=&cursor=` → paginated list.
- `GET /history/audits/:id` → single audit with full JSON.
- `GET /history/audits/:id/pdf` → redirects to R2 presigned URL.
- `POST /history/audits/:id/delete` → marks as deleted; D1 row retained for 30d.
- `GET /history/welfare-delta` → aggregate.
- `GET /history/purchases` → for manual entry + Gmail import later.
- `POST /preferences` + `GET /preferences/:category` + `PATCH /preferences/:category`.
- `GET /watchers` / `POST /watchers` / `DELETE /watchers/:id`.
- `GET /interventions` / `POST /interventions` (draft from a purchase+template).

## Observability

Every DB call wrapped in a trace span (F17). Tag: `repo.{name}.{op}`. Emit count, duration, error. Log slow queries (>200 ms).

## Acceptance criteria

- [ ] `wrangler d1 create lens-production` succeeds; IDs in `wrangler.toml`.
- [ ] `wrangler d1 execute LENS_D1 --file=migrations/0002_audits.sql` (and 0003-0009) applies cleanly in prod.
- [ ] KV namespace created and bound.
- [ ] R2 bucket created and bound.
- [ ] `workers/api/src/db/client.ts` miniflare test passes.
- [ ] All 8 repo test suites pass (≥ 60 tests total across repos).
- [ ] Migration script from anonLocal → userRecord round-trips 5 seeded audits + 3 profiles without loss.
- [ ] Worker deploys without error.
- [ ] `/history/audits` returns the correct rows after seeding.
- [ ] `GAP_ANALYSIS.md` H3 "no server persistence" gap crossed off.

## Implementation checklist

1. [ ] `wrangler d1 create lens-production` → paste `database_id` into `wrangler.toml`.
2. [ ] `wrangler kv:namespace create LENS_KV` + preview → paste IDs.
3. [ ] `wrangler r2 bucket create lens-blobs` + preview.
4. [ ] Write all 9 migrations.
5. [ ] Apply migrations via `wrangler d1 execute`.
6. [ ] Implement `db/client.ts` + `db/schemas.ts`.
7. [ ] Implement each repo (`users`, `audits`, `preferences`, `purchases`, `watchers`, `interventions`, `welfare`, `ticker`, `runs`).
8. [ ] Implement `kv/cache.ts`, `kv/rate-limit.ts`, `kv/idempotency.ts`.
9. [ ] Implement `r2/blobs.ts`, `r2/audit-pdf.ts` (use `@pdf-lib/pdf-lib` or `jspdf` if Worker-compatible), `r2/screenshots.ts`.
10. [ ] Wire repos into existing `/audit` pipeline — after `runAuditPipeline` completes, persist via `createAudit`.
11. [ ] Wire `migrateAnonToUser` into F1's `/auth/verify` handler.
12. [ ] Add history endpoints.
13. [ ] Update `SessionProvider.tsx` to call `/history/audits` on mount and replace localStorage welfare card with server-sourced data.
14. [ ] Write repo + kv + r2 unit tests.
15. [ ] Deploy + smoke test: create audit on web, refresh, see it in history.
16. [ ] Commit `lens(F2): persistence layer D1+KV+R2`.

## Rollback

If D1 fails in production:
1. Add fallback to `/audit` that still returns result even if `createAudit` throws.
2. Queue failed writes to KV list `dlq:audits:{ts}` for later replay.
