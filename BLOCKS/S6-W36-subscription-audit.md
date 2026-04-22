# S6-W36 — Subscription audit & cancel

**Depends on:** F12🟡 (Gmail OAuth — token CRUD live, user-provided creds land later), S0-W5 ✅ (subscription classifier + repo + scan).

**Goal:** Turn a user's persisted `subscriptions` rows into a **deliverable dashboard audit** with actionable cancel drafts. S0-W5 populates the table; S6-W36 surfaces findings and ships a real pre-filled cancellation letter rendered from the `intervention/draft-cancel-subscription` pack.

## Why the block exists

VISION_COMPLETE.md §3 (the Sarah narrative) names this beat verbatim:

> *"3 subscriptions auto-renew next week — draft cancellations?"*

The weekly digest email already has a slot for renewals (V-EMAIL-digest pending), but the dashboard subscriptions pane has no auditing surface today: `GET /subs` returns rows but the user cannot see (a) which ones will renew this week, (b) which ones look expensive for their category, (c) which ones are trial-ending-and-about-to-charge, and (d) the total monthly cost. `/subs/:id/cancel-draft` currently returns a placeholder string ("Open Netflix → Account → Billing → Cancel"). S6-W36 turns both into real surfaces.

## Contract

### POST /subs/audit — the aggregator

Requires auth. Body optional:

```json
{
  "userState": "CA",   // optional; powers state-law citation in cancel drafts
  "windowDays": 30     // optional; horizon for upcoming-renewal flagging (default 30)
}
```

Response shape:

```json
{
  "ok": true,
  "generatedAt": "2026-04-22T03:30:00.000Z",
  "summary": {
    "totalActive": 7,
    "totalMonthlyCost": 94.92,   // USD, normalized across cadences
    "totalAnnualCost": 1139.04,
    "upcomingRenewals": 3,        // in windowDays
    "flaggedCount": 4
  },
  "findings": [
    {
      "subscriptionId": "01J...",
      "service": "Netflix",
      "amount": 15.49,
      "cadence": "monthly",
      "nextRenewalAt": "2026-04-24",
      "active": true,
      "detectedIntent": "renewal",
      "flags": [
        { "kind": "auto-renew-within-7d", "severity": "warn", "evidence": "Renews 2026-04-24 (2 days)" },
        { "kind": "above-category-median", "severity": "info",  "evidence": "Streaming median ~$10.99/mo" }
      ],
      "monthlyEquivalent": 15.49,
      "annualEquivalent": 185.88,
      "cancelDraftable": true
    }
  ],
  "recommendation": {
    "band": "review",      // "all-good" | "review" | "urgent"
    "oneLiner": "3 subscriptions renew in the next week. Two look unused and one is a trial about to charge — consider cancelling."
  }
}
```

### POST /subs/:id/cancel-draft — upgraded from stub

Requires auth. Body optional:

```json
{
  "userState": "CA",          // optional
  "userName": "Jane Doe",     // optional; falls back to [TODO: user_name]
  "userIdentifier": "jane@example.com",  // optional; account email/username
  "planName": "Premium",      // optional; falls back to sub.service
  "signupDate": "2024-02-14", // optional ISO date; falls back to sub.first_seen slice
  "cancelDate": "2026-04-23"  // optional; falls back to today
}
```

Response:

```json
{
  "ok": true,
  "interventionId": "01J...",
  "draft": {
    "subject": "Cancellation request — Netflix",
    "body": "Dear Netflix,\n\nI am requesting cancellation...",
    "to": null,
    "format": "email"
  },
  "stateLaw": {
    "state": "CA",
    "citation": "Under California Business & Professions Code §17602 (SB-313), my online-signup subscription is entitled to online cancellation through the same channel I signed up."
  },
  "enforcementAgency": "California Department of Justice / Office of the Attorney General",
  "templateSource": "intervention/draft-cancel-subscription@1.0.0",
  "fallback": "intervention/file-ftc-complaint",
  "generatedAt": "2026-04-22T03:30:00.000Z"
}
```

### Wire order

The existing S0-W5 stub at `POST /subs/:id/cancel-draft` is replaced by the real handler. The `GET /subs/:id/cancel-draft` path doesn't exist. One new route: `POST /subs/audit`.

## Components

### 1. `workers/api/src/subs/audit.ts` — the pure auditor

Takes `(rows: SubscriptionRow[], options: AuditOptions) → SubscriptionAudit`. No D1, no network.

**Cadence normalization.** To compute aggregates across subs with different cadences, normalize every amount to `monthlyEquivalent`:

- `weekly` → amount × 4.345
- `monthly` → amount
- `quarterly` → amount ÷ 3
- `yearly` → amount ÷ 12
- null cadence → treat as monthly (weakest assumption; flag `unknown-cadence`).

**Flags computed per row:**

| flag kind | severity | when it fires |
|---|---|---|
| `auto-renew-within-7d` | warn | active=1 AND next_renewal_at within 7 days |
| `auto-renew-within-window` | info | active=1 AND next_renewal_at within `windowDays` but > 7 days |
| `trial-ending` | warn | detected_intent = "trial-ending" AND next_renewal_at within 14 days |
| `above-category-median` | info | amount > 1.5× the category-median table lookup for this service |
| `unknown-cadence` | info | cadence is null |
| `stale-no-renewal-info` | info | active=1 AND next_renewal_at is null AND last_seen > 60 days ago |
| `recent-cancellation-detected` | info | detected_intent = "cancellation" AND active=0 |

**Category-median table** (small, literal):
```ts
const CATEGORY_MEDIANS: Record<string, number> = {
  "streaming":       10.99,  // Netflix, Hulu, Prime Video, Max, Apple TV+, Disney+, Paramount+
  "music":           10.99,  // Spotify Premium, Apple Music, YouTube Music, Tidal
  "productivity":    15.00,  // iCloud+, Dropbox, 1Password
  "news":            17.00,  // NYT, WSJ, Bloomberg
  "creative":        54.99,  // Adobe Creative Cloud
  "fitness":         12.99,  // Peloton App, Apple Fitness+
  "food":            9.99,   // DashPass, Uber One
  "prime":           14.99,  // Amazon Prime, Walmart+
};
```
Service → category mapping is a second small map keyed by normalized service name (case-insensitive first-word match).

**Recommendation band:**
- `urgent` — at least one `trial-ending` or 2+ `auto-renew-within-7d`
- `review` — at least one `auto-renew-within-7d` or `above-category-median`
- `all-good` — no warn-severity flags

One-liner is generated deterministically from the counts.

**Apple-bar compliance:**
- §2 "intelligent": flags only fire when the underlying evidence is genuine; every flag carries the evidence string that shows *why* it fired
- §9 "honest loading": audit returns `generatedAt` so the UI can display "Audited just now"
- §10 "never a placeholder": empty-state (no subs) returns `totalActive: 0, oneLiner: "No subscriptions on file. Scan your inbox to discover them."`

### 2. `workers/api/src/subs/cancel-drafter.ts` — pack template substitution

Takes `(row: SubscriptionRow, input: CancelDraftInput) → CancelDraft`.

**State-law resolution** — reads the pack's `stateLawSnippets` map (embedded in the pack body), looks up the user's state, falls back to `DEFAULT`. If `userState` is omitted, use `DEFAULT`.

**Enforcement agency resolution** — a small hard-coded table:
```ts
const STATE_AG: Record<string, string> = {
  CA: "California Department of Justice / Office of the Attorney General",
  NY: "New York Department of State Division of Consumer Protection",
  IL: "Illinois Attorney General Consumer Fraud Bureau",
  VT: "Vermont Office of the Attorney General Consumer Assistance Program",
};
const DEFAULT_AGENCY = "the Federal Trade Commission (reportfraud.ftc.gov)";
```

**Token map built for renderDraft:**
```
service_name         ← row.service
cancel_date          ← input.cancelDate ?? today
user_identifier      ← input.userIdentifier
plan_name            ← input.planName ?? row.service
signup_date          ← input.signupDate ?? row.first_seen.slice(0,10)
state_law_citation   ← snippetFor(userState)
enforcement_agency   ← STATE_AG[userState] ?? DEFAULT_AGENCY
user_name            ← input.userName
```

Missing tokens surface as `[TODO: <key>]` (reusing `substitute()` from `../returns/render.js`).

### 3. `workers/api/src/subs/handler.ts` — upgraded

- **New export `handleAudit`** — reads rows for the user, runs the auditor, returns the audit response.
- **Upgrade existing `handleCancelDraft`** — pulls `intervention/draft-cancel-subscription` pack, calls `cancel-drafter`, persists via `createIntervention`, returns the new response shape above (replacing the prior stub).

### 4. `workers/api/src/index.ts` — wire new route

Add `app.post("/subs/audit", (c) => handleAudit(c as never));` near the other `/subs/*` routes.

## Apple-product bar hooks

| § | Rule | How S6-W36 meets it |
|---|---|---|
| 1 smooth | no jank | pure compute, no network in audit; cancel-draft is one D1 write |
| 2 intelligent | flags need evidence | every flag carries the trigger-string |
| 3 beautiful | not UI in this block, but the JSON response shape is what the dashboard will render — clean, typed, no ambiguity |
| 9 honest loading | returns `generatedAt` + deterministic one-liner |
| 10 never a placeholder | empty state + `[TODO: <key>]` sentinel on missing inputs (never a silent blank) |

## Implementation checklist

1. Write `workers/api/src/subs/audit.ts` with `auditSubscriptions(rows, options)` + `monthlyEquivalent()` helper.
2. Write `workers/api/src/subs/cancel-drafter.ts` with `renderCancelDraft(row, input)`.
3. Write `workers/api/src/subs/audit.test.ts` — cadence normalization, each flag kind, band resolution, empty state.
4. Write `workers/api/src/subs/cancel-drafter.test.ts` — state snippet lookup, enforcement agency, TODO sentinels for missing inputs.
5. Upgrade `workers/api/src/subs/handler.ts` — add `handleAudit`, rewrite `handleCancelDraft` to call `renderCancelDraft` + `createIntervention`.
6. Extend `workers/api/src/subs/handler.test.ts` with tests for the new /audit path + the upgraded cancel-draft path.
7. Wire `app.post("/subs/audit", ...)` in `workers/api/src/index.ts`.
8. `npm run typecheck --workspaces --if-present`.
9. `npx vitest run`.
10. `npx wrangler deploy`.
11. Smoke: hit `/subs/audit` without auth → 401; with a seeded test user, the audit returns structured JSON with the expected counts (or the unauth 401 confirms the deployed route).
12. Commit `lens(S6-W36): subscription audit + cancel-draft pack rendering`.
13. Push + CHECKLIST ✅ + progress log entry.

## Acceptance criteria

- `POST /subs/audit` returns the typed response with normalized monthly/annual totals, per-row flags, and recommendation band.
- Five seeded subscriptions spanning all cadences (weekly / monthly / quarterly / yearly + null-cadence) reconcile correctly through `monthlyEquivalent`.
- `POST /subs/:id/cancel-draft` renders the real pack template with the right state-law snippet (CA / NY / IL / VT / DEFAULT) and persists a drafted intervention row linked back to the subscription.
- Missing `userName`/`userIdentifier` surfaces as `[TODO: user_name]` / `[TODO: user_identifier]` in the body — never a silent blank.
- 503 (no D1) / 401 (no principal) / 404 (missing sub) / 403 (cross-user) paths all fire.
- Typecheck + all tests green.
- Deployed live, smoke confirms routes active.
- Commit present with block ID.
- CHECKLIST.md row flipped to ✅ with commit hash.

## Files touched

- `BLOCKS/S6-W36-subscription-audit.md` (new — this file)
- `workers/api/src/subs/audit.ts` (new)
- `workers/api/src/subs/audit.test.ts` (new)
- `workers/api/src/subs/cancel-drafter.ts` (new)
- `workers/api/src/subs/cancel-drafter.test.ts` (new)
- `workers/api/src/subs/handler.ts` (modified)
- `workers/api/src/subs/handler.test.ts` (modified — audit + upgraded cancel-draft)
- `workers/api/src/index.ts` (modified — route wire)
- `CHECKLIST.md` (modified — status + progress log)
