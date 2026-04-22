# CJ-W48 — Gift-buying mode (shared-link recipient-constraint flow)

**Depends on:** F1 ✅ (auth), F2 ✅ (persistence). Composes S2-W10 ranking math (via existing fixture catalog).

**Goal:** Let a signed-in user create a *gift request* with a budget and optional category, share a one-time link with the recipient, have the recipient fill in their actual preferences *without seeing the budget as a dollar figure*, and then return a properly-ranked audit to the giver. The canonical social friction around gift-buying (wanting to honor the recipient's taste, not wanting the recipient to aim at the dollar amount) is solved by shape rather than ad-hoc UI: **the recipient sees a coarse budget band, never the exact number**.

Per `BLOCK_PLAN.md`:

> `gift.mode`. User + recipient link. Recipient fills constraints; giver gets audit-shaped output.
> Acceptance: shared-link flow works end-to-end.

## Why the block exists

`VISION_COMPLETE.md` §12 enumerates gifts as one of the non-trivial cross-journey beats. Without CJ-W48, Lens only serves the person whose preferences it knows. Gifts are the stress-test of the "representation without catalog ownership" design: the algorithm must support *someone else's* preferences discovered in real time, scoped to a specific dollar window, without ever leaking that window back to the recipient. It's the cleanest demonstration that Lens's math is about the user-stated criteria, not revenue-bias.

## Architecture

Two tables + 6 endpoints + one deterministic ranker call.

### `gift_requests` table (migration 0009)

```sql
CREATE TABLE IF NOT EXISTS gift_requests (
  id TEXT PRIMARY KEY,                    -- ULID
  giver_user_id TEXT NOT NULL,            -- account holder
  recipient_label TEXT,                   -- "My dad" / "Alex for graduation"
  occasion TEXT,                          -- "birthday" | "graduation" | ...
  category TEXT,                          -- optional category slug
  budget_min INTEGER,                     -- cents
  budget_max INTEGER NOT NULL,            -- cents
  share_token_hash TEXT NOT NULL,         -- SHA-256 of the token (constant-time lookup)
  status TEXT NOT NULL DEFAULT 'awaiting',-- 'awaiting' | 'completed' | 'revoked' | 'expired'
  expires_at TEXT NOT NULL,               -- ISO; default = created_at + 14d
  created_at TEXT NOT NULL,
  completed_at TEXT,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_gift_giver ON gift_requests(giver_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_gift_token_hash ON gift_requests(share_token_hash);
```

### `gift_responses` table

```sql
CREATE TABLE IF NOT EXISTS gift_responses (
  gift_id TEXT PRIMARY KEY,               -- FK → gift_requests.id, one response per request
  criteria_json TEXT NOT NULL,            -- { criterion: weight }
  recipient_notes TEXT,                   -- free text
  submitted_at TEXT NOT NULL
);
```

### Signed-token + stored-hash

The share link's token is an HMAC-SHA-256 of `"gift:" + giftId + ":" + expiresAtEpoch` signed with `env.JWT_SECRET`. The server stores **SHA-256(token)** so that even a read of the table can't reproduce the token. Token validation:

1. Parse token → (giftId, expiresAt, sig).
2. Re-derive sig from (giftId, expiresAt) + JWT_SECRET; compare constant-time.
3. Fetch row by `share_token_hash = SHA-256(token)`.
4. Reject if `status !== "awaiting"` or `expires_at < now()` (auto-flip to `"expired"` on lookup).

The token is never stored in plaintext. The recipient link is single-use for writes but multi-read.

### Budget band mapping

Exposed to the recipient in place of the raw dollar budget. The recipient sees the *label only*; their answer is never aimed at the dollar value.

| Max budget (USD) | Band label        | Band hint (for UI only)                 |
|------------------|-------------------|------------------------------------------|
| < 50             | `entry`           | "something nice and simple"              |
| < 150            | `thoughtful`      | "something considered"                   |
| < 400            | `premium`         | "something premium"                      |
| < 1000           | `luxury`          | "something special"                      |
| ≥ 1000           | `ultra`           | "something extraordinary"                |

`budget_min` (if set) raises the band floor but the recipient still sees only the label.

### Endpoints

```
POST   /gift/requests                            (auth)  → create + return {giftId, shareUrl, expiresAt}
GET    /gift/requests                            (auth)  → list giver's requests
GET    /gift/requests/:id/audit                  (auth)  → spec-optimal pick(s) from recipient's constraints
DELETE /gift/requests/:id                        (auth)  → revoke (status=revoked)

GET    /gift/recipient?token=<opaque>                    → public; returns question shape (category/band/prompts)
POST   /gift/recipient?token=<opaque>                    → public; submit recipient constraints
```

### Audit output for the giver

Given `{ budgetMin, budgetMax, category, criteria }`, use the existing fixture catalog (`workers/api/src/fixtureCatalog.ts`) to:

1. Pull the candidate list for `category` (if present) filtered by `budgetMin <= price <= budgetMax`.
2. Rank via the same pure utility function the audit pipeline uses: `U = Σ wᵢ · sᵢ`.
3. Return top-3 with per-criterion contribution breakdown + "why #1 beat #2" delta.

If the category has no fixture catalog, return `{recipientConstraints, catalog: "none", recommendation: "Use /audit with these criteria to get a live-search pick"}`. Honest about what the deterministic layer can and cannot do.

**No affiliate links** in any product surface — pure retailer canonical URLs (or omit the URL).

## HTTP contract

### POST /gift/requests — create

Request body:

```json
{
  "recipientLabel": "Dad",
  "occasion": "birthday",
  "category": "espresso-machines",
  "budgetMin": 150,
  "budgetMax": 350,
  "expiresInDays": 14
}
```

Response:

```json
{
  "ok": true,
  "gift": { /* full row, no share_token_hash */ },
  "shareUrl": "https://lens-b1h.pages.dev/gift/respond?token=<opaque>",
  "expiresAt": "2026-05-06T04:00:00.000Z"
}
```

### GET /gift/recipient?token=&lt;opaque&gt;

Public. Returns the question shape:

```json
{
  "ok": true,
  "gift": {
    "id": "01J…",
    "recipientLabel": "Dad",
    "occasion": "birthday",
    "category": "espresso-machines",
    "budgetBand": "premium",
    "budgetBandHint": "something premium"
  },
  "expiresAt": "2026-05-06T04:00:00.000Z",
  "questionTemplate": {
    "criteria": [
      { "key": "pressure",      "label": "Brewing strength", "scale": "0-1" },
      { "key": "build_quality", "label": "Build quality",    "scale": "0-1" },
      { "key": "noise",         "label": "Quietness",         "scale": "0-1" },
      { "key": "ease_of_use",   "label": "Simplicity",        "scale": "0-1" }
    ],
    "notesPlaceholder": "Anything else we should know?"
  }
}
```

Budget band is coarse. Raw dollar numbers never returned on this endpoint.

### POST /gift/recipient?token=&lt;opaque&gt;

Recipient submits:

```json
{
  "criteria": { "pressure": 0.4, "build_quality": 0.3, "ease_of_use": 0.2, "noise": 0.1 },
  "notes": "He drinks it black, no milk froth needed."
}
```

Response:

```json
{ "ok": true, "acknowledged": true, "message": "Thanks! Your answer has been shared with the giver." }
```

### GET /gift/requests/:id/audit

Giver fetches the ranked output:

```json
{
  "ok": true,
  "gift": { /* row */ },
  "response": {
    "criteria": { "pressure": 0.4, "build_quality": 0.3, "ease_of_use": 0.2, "noise": 0.1 },
    "notes": "He drinks it black, no milk froth needed.",
    "submittedAt": "2026-04-22T05:00:00Z"
  },
  "audit": {
    "catalog": "fixture",
    "candidates": [
      { "name": "Breville Bambino Plus", "price": 349.99, "utility": 0.84, "contributions": { "pressure": 0.37, "build_quality": 0.24, "noise": 0.08, "ease_of_use": 0.15 }, "brand": "Breville", "url": "https://www.breville.com/..." },
      …
    ],
    "tiers": {
      "75": { /* at ~75% budget */ },
      "100": { /* at 100% budget */ },
      "150": { /* at ~150% budget — "if you can stretch" */ }
    },
    "narrative": "#1 beats #2 by +0.11 utility driven by stronger pressure (+0.08) and simpler operation (+0.04)."
  }
}
```

### DELETE /gift/requests/:id

Revokes the request. Subsequent GET/POST /gift/recipient with that token return 410 Gone.

### GET /gift/requests — list

All the giver's requests newest-first. Each row includes computed `hasResponse: boolean` but not the recipient's raw criteria until the giver opens `/audit`.

## Apple-product bar hooks

| § | Rule | How CJ-W48 meets it |
|---|---|---|
| 2 intelligent | inputs anticipate intent | budget band label respects recipient's dignity; token-based single-link flow |
| 3 beautiful | shape matches intent | recipient sees one clean form; giver sees an audit |
| 10 never a placeholder | empty-states are real states | no-catalog-category returns an explicit "catalog: none" + narrated fallback |
| privacy | no cross-user data leakage | recipient never sees the giver's other gifts or budget number |
| revenue | no affiliate links EVER | audit URLs are raw retailer canonical URLs |

## Files touched

- `workers/api/migrations/0009_gift_requests.sql` (new)
- `workers/api/src/db/schemas.ts` (modified — 2 new row schemas)
- `workers/api/src/gift/types.ts` (new)
- `workers/api/src/gift/token.ts` (new — HMAC sign + verify + SHA-256 hash)
- `workers/api/src/gift/bands.ts` (new — budget band mapping)
- `workers/api/src/gift/question.ts` (new — per-category criterion prompt templates)
- `workers/api/src/gift/audit.ts` (new — fixture-catalog rank for the giver view)
- `workers/api/src/gift/repo.ts` (new — create, listByUser, getById, getByTokenHash, revoke, submitResponse)
- `workers/api/src/gift/handler.ts` (new — 6 endpoints)
- `workers/api/src/gift/*.test.ts` (new tests)
- `workers/api/src/index.ts` (modified — wire 6 routes)
- `CHECKLIST.md` (modified)

## Implementation checklist

1. Write migration 0009.
2. Apply migration remote.
3. Extend db/schemas.ts with GiftRequestRow + GiftResponseRow Zod.
4. Build token module (`sign(giftId, expiresAt, secret) → token`; `verify(token, secret)`; `hashToken(token) → sha256-hex`).
5. Build bands module (pure function `bandFor(maxCents) → {label, hint}`).
6. Build question module — criterion prompts keyed by category slug; fallback to a generic set.
7. Build audit module — reuse existing fixture catalog (`fixtureCatalog`) + deterministic utility math (`Σ wᵢ · sᵢ`); returns candidates + tiers + narrative.
8. Build repo — create/list/get/revoke/getByTokenHash/submitResponse with UPSERT-by-gift semantics on responses + auto-expire on read.
9. Build handler — 6 endpoints, each with 503/401/400/404/403/410 paths + auth scoping.
10. Wire routes in index.ts.
11. Write tests: token (sign/verify round-trip, wrong secret, expiry, tamper), bands (every threshold), audit (catalog hit + no-catalog fallback + tier generation), repo (CRUD + status transitions), handler (create + share-flow + revoke + expiry).
12. Typecheck + vitest.
13. Deploy.
14. Smoke (unauth → 401 on giver endpoints; bad-token → 404/401 on recipient endpoints).
15. Commit `lens(CJ-W48): gift-buying shared-link flow`.
16. Push + CHECKLIST ✅.

## Acceptance criteria

- Migration 0009 applied remote (19 tables).
- POST /gift/requests writes a row + returns an opaque share token.
- HMAC round-trip: same token re-derivable; wrong secret rejected; tampered token rejected.
- GET /gift/recipient reads the question template + returns coarse band label, never the dollar figure.
- POST /gift/recipient writes the response row.
- GET /gift/requests/:id/audit returns a ranked audit with contributions when category has a fixture catalog; falls back cleanly otherwise.
- DELETE /gift/requests/:id revokes; subsequent recipient access returns 410.
- Expired links auto-flip to `expired` + return 410 on access.
- 401 unauth on giver endpoints; 404 on other-user's request; 404/410 on bad token.
- Typecheck + tests green.
- Deployed. Commit + CHECKLIST ✅.
