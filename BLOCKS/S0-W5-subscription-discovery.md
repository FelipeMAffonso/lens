# S0-W5 — Subscription discovery

**Goal:** given a user's Gmail inbox (via F12 OAuth) or a batch of inbound receipts, identify every active subscription, its cadence, amount, and next renewal date — and write one row per service into a new `subscriptions` D1 table.

**Why the block exists:**

VISION_COMPLETE.md §3 Sarah narrative — "3 subscriptions auto-renew next week — draft cancellations?" — is one of the four canonical demo beats. It cannot exist without a subscription discovery pipeline. This block ships the full pipeline (classifier + persistence + endpoints) and leaves Gmail-mailbox ingestion as a thin wrapper the day `GMAIL_OAUTH_CLIENT_ID` lands.

Architecture:

1. **Classifier** (pure function) takes a Gmail-shaped message `{from, subject, snippet, bodyText, receivedAt}` and returns `{matched: boolean, service?, amount?, currency?, cadence?, nextRenewalAt?, intent?: "confirmation" | "renewal" | "cancellation" | "trial-ending"}`.
2. **Repo** persists into `subscriptions` table with UPSERT semantics on `(user_id, service)` so repeated emails about the same service update one row.
3. **Workflow `subs.discover`** (stub-registered) maps future Gmail polling → classifier → repo.
4. **Endpoints**: `POST /subs/scan` takes an array of Gmail-shaped messages, runs them through the classifier, persists, returns the resulting subscriptions. `GET /subs` lists the signed-in principal's subscriptions. `PATCH /subs/:id` toggles active state. `POST /subs/:id/cancel-draft` drafts a cancellation via the intervention pack `intervention/draft-cancel-subscription`.

## Contract

### subscriptions table

```sql
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  service TEXT NOT NULL,               -- "Netflix", "Spotify Premium", ...
  amount REAL,                         -- USD (TODO: multi-currency v2)
  currency TEXT DEFAULT 'USD',
  cadence TEXT,                        -- "monthly" | "yearly" | "weekly" | "quarterly" | null
  next_renewal_at TEXT,                -- ISO date, nullable
  source TEXT NOT NULL,                -- "gmail" | "manual" | "extension"
  source_ref TEXT,                     -- e.g. Gmail message ID
  active INTEGER NOT NULL DEFAULT 1,
  detected_intent TEXT,                -- "confirmation" | "renewal" | ...
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  raw_payload_json TEXT
);
CREATE UNIQUE INDEX idx_subs_user_service ON subscriptions(user_id, service);
CREATE INDEX idx_subs_user_renewal ON subscriptions(user_id, next_renewal_at);
```

### Classifier fixture coverage

Goal: classify correctly for ≥ 10 known subscription services. Fixtures stored inline in the test file (no disk files):

- Netflix ("Your Netflix subscription has been renewed.")
- Spotify Premium ("Your Premium plan renews...")
- NYT ("Your NYT subscription is due...")
- HBO Max / Max ("Max - your next billing date is...")
- Adobe Creative Cloud ("Your subscription payment...")
- DoorDash DashPass ("DashPass monthly renewal")
- Amazon Prime ("Thanks for renewing your Prime membership")
- Dropbox ("Your Dropbox Plus plan auto-renewal")
- Peloton App ("Your Peloton subscription renews")
- Apple One / iCloud+ ("Your iCloud+ storage plan")

Plus negative controls:
- A normal product receipt (Amazon order confirmation)
- A transactional email (bank statement)
- A marketing blast from Netflix that isn't a renewal

### Classifier algorithm

Three passes:

1. **From-address allowlist** — known subscription senders get a high-confidence service label. `no-reply@netflix.com` → "Netflix". Pattern-match on the `from` domain.
2. **Subject keyword detect** — regexes for "renew", "auto-renew", "subscription", "billing", "trial".
3. **Body extraction** — regex scan for amount (`$X.XX`), cadence ("monthly", "yearly", "per month"), and next-renewal date (`on Apr 24`, `2026-04-24`, `in 7 days`).

Intent resolution:
- "cancelled", "cancellation" → `cancellation`
- "trial ends", "your trial" → `trial-ending`
- "renewed", "has been renewed" → `renewal`
- default → `confirmation`

### Apple-product bar

- **Never a placeholder (§10):** when the classifier can't match, the response includes the message as `unmatched: [...]` with the exact reason — never a silent drop.
- **Honest loading (§9):** scan endpoint returns the count classified + count unmatched + elapsed ms so the UI can report "Scanned 142 emails, found 11 subscriptions."
- **Silent until signal (§2):** no endpoint fires unless the user explicitly POSTs to scan or the scheduled cron fires with a populated Gmail OAuth token.

## Implementation checklist

1. Migration `0006_subscriptions.sql`.
2. `workers/api/src/subs/types.ts` — Zod schemas + TS types.
3. `workers/api/src/subs/classifier.ts` — pure-function classifier.
4. `workers/api/src/subs/repo.ts` — D1 repo (upsertByService, listByUser, toggleActive, delete).
5. `workers/api/src/subs/handler.ts` — HTTP glue.
6. `workers/api/src/subs/workflow.ts` — skeleton workflow spec registered with the engine (future Gmail cron hookup).
7. Endpoints wired: `POST /subs/scan`, `GET /subs`, `PATCH /subs/:id`, `POST /subs/:id/cancel-draft`.
8. Tests: classifier (≥ 10 fixtures), repo (upsert semantics), handler (integration).
9. Apply migration remote.
10. Deploy. Smoke test via POST /subs/scan with a fixture payload.
11. Commit `lens(S0-W5): subscription-discovery pipeline`.
12. Push + CHECKLIST ✅.

## Acceptance criteria

- `0006_subscriptions.sql` applied remote.
- Classifier correctly tags ≥ 10 of the 10 canonical subscription fixtures.
- Negative controls correctly return `matched: false`.
- POST /subs/scan deduplicates: two emails for Netflix → one row.
- GET /subs returns only the signed-in principal's rows.
- 503 on D1 missing, 401 on unauth for write paths.
- Typecheck + all tests green.
- Deployed live, smoke returns structured output.

## Files touched

- `workers/api/migrations/0006_subscriptions.sql` (new)
- `workers/api/src/subs/types.ts` (new)
- `workers/api/src/subs/classifier.ts` (new)
- `workers/api/src/subs/repo.ts` (new)
- `workers/api/src/subs/handler.ts` (new)
- `workers/api/src/subs/workflow.ts` (new, skeleton)
- `workers/api/src/subs/*.test.ts` (new tests)
- `workers/api/src/index.ts` (modified — routes)
