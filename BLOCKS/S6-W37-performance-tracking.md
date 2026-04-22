# S6-W37 — Performance tracking

**Depends on:** F2 ✅ (purchases + preferences), F1 ✅ (auth).

**Goal:** When a user actually uses a product they bought, Lens collects honest post-purchase satisfaction and pushes that signal back into their category preference weights — revealed-preference learning without telemetry. `BLOCK_PLAN.md` states:

> `perf.log`. User logs post-purchase satisfaction. Feeds back into Layer 4 revealed-preference updating.
> Acceptance: satisfaction signal updates user's category weights.

## Why the block exists

Every other block in Stage-6 is advocate-shaped (recall, price-drop, returns, cancellation). S6-W37 is the **learning loop**: the only way Lens gets smarter about *this specific user's* preferences without harvesting behavioral telemetry. It closes the circuit back to Layer-4 of `docs/PREFERENCE_INFERENCE.md`:

- **Layer 1 (stated):** the user typed "pressure matters most"
- **Layer 2 (clarification):** we asked 2 trade-off questions
- **Layer 3 (category prior):** the pack told us espresso-machine buyers typically weight build-quality highly
- **Layer 4 (revealed):** **the user bought it, lived with it, and told us how it actually felt**

This block ships Layer-4.

## Contract

### POST /purchase/:id/performance — record satisfaction + update preferences

Requires auth. Body:

```json
{
  "overallRating": 4,               // required; integer 1..5
  "wouldBuyAgain": true,            // required; boolean
  "criterionFeedback": [            // optional; per-criterion revealed-importance
    { "criterion": "build_quality", "signal": "more-important" },
    { "criterion": "price",         "signal": "about-right"  },
    { "criterion": "warranty",      "signal": "less-important" }
  ],
  "notes": "free-text; stored only, never used for ranking"
}
```

Response:

```json
{
  "ok": true,
  "ratingId": "01J...",
  "preferenceUpdate": {
    "applied": true,
    "category": "espresso-machines",
    "before": { "pressure": 0.30, "build_quality": 0.25, "price": 0.40, "warranty": 0.05 },
    "after":  { "pressure": 0.30, "build_quality": 0.31, "price": 0.34, "warranty": 0.05 },
    "deltas": { "pressure": 0.00, "build_quality": 0.06, "price": -0.06, "warranty": 0.00 },
    "reason": "overall=4 + wouldBuyAgain=true → reinforce; build_quality flagged more-important, price flagged about-right"
  },
  "createdAt": "2026-04-22T04:00:00.000Z"
}
```

If no preference row exists for the purchase's `category`, the response includes `applied: false, reason: "no prior preference row — stored rating only"` and the rating is still persisted.

### GET /purchase/:id/performance — read prior rating

Requires auth. Returns `{ rating: PerformanceRatingRow | null }`.

### GET /performance/history — list user ratings

Requires auth. Returns `{ ratings: PerformanceRatingRow[], count: number }`.

## The Layer-4 updater (the load-bearing math)

**Input:** current weights `W = { c1: w1, c2: w2, ... }` with `Σ wᵢ = 1`, overall rating `r ∈ {1..5}`, `wouldBuyAgain ∈ {true, false}`, optional per-criterion feedback `F[cᵢ] ∈ {"more-important","about-right","less-important"}`.

**Overall signal** first sets a global "reinforcement direction":

- `r ≥ 4 AND wouldBuyAgain = true` → `sign = +1` (reinforce the chosen weights)
- `r ≤ 2 OR wouldBuyAgain = false` → `sign = -1` (dampen the chosen weights)
- otherwise → `sign = 0` (apply per-criterion feedback only)

**Per-criterion deltas** (applied additively, then renormalized):

- `F[cᵢ] = "more-important"` → `Δᵢ += +0.08`
- `F[cᵢ] = "less-important"` → `Δᵢ += -0.08`
- `F[cᵢ] = "about-right"` → `Δᵢ += 0`

**Global overall bump** (only when sign ≠ 0): add a small global reinforcement to the current top weight only (the one the user judged "most important" in their original preference — revealed to be correct or wrong):

- find `cₜₒₚ = argmax wᵢ`
- `Δₜₒₚ += sign * 0.04`

**Step 1 — apply deltas, floor at 0:**
```
wᵢ' = max(0, wᵢ + Δᵢ)
```

**Step 2 — renormalize to sum=1:**
```
wᵢ'' = wᵢ' / Σⱼ wⱼ'
```

Edge case: if `Σⱼ wⱼ' = 0` (every weight was floored to zero — only possible with heavy adversarial feedback), abort the update, keep original weights, return `applied: false, reason: "update would zero out every criterion — aborted"`.

**Round** to 4 decimal places after renormalize (same as source-weighting normalizer in S2-W13).

**Bounded drift.** A single rating cannot rotate a weight by more than `0.12` gross (one positive signal + one feedback signal capped by cumulative ceiling). That's the design — small nudges, many ratings add up.

**Deterministic.** Given `(W, r, wouldBuyAgain, F)`, the output is fully deterministic. No randomness, no temperature, no LLM in the loop.

## The performance_ratings table (migration 0007)

```sql
CREATE TABLE performance_ratings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  purchase_id TEXT NOT NULL,
  overall_rating INTEGER NOT NULL,
  would_buy_again INTEGER NOT NULL,      -- 0 | 1
  criterion_feedback_json TEXT,          -- JSON array
  notes TEXT,
  preference_snapshot_json TEXT,         -- { before, after, deltas } at the moment of rating
  category TEXT,                         -- purchase.category cached for analytics
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_perf_user_purchase ON performance_ratings(user_id, purchase_id);
CREATE INDEX idx_perf_user_created ON performance_ratings(user_id, created_at);
```

**Unique index on (user_id, purchase_id)** enforces the "one active rating per purchase" rule. A second POST to the same purchase overwrites (idempotent UPSERT).

## Files touched

- `workers/api/migrations/0007_performance.sql` (new)
- `workers/api/src/performance/types.ts` (new) — Zod schemas + types
- `workers/api/src/performance/updater.ts` (new) — pure updater math
- `workers/api/src/performance/repo.ts` (new) — D1 repo (upsert by user+purchase, get, list)
- `workers/api/src/performance/handler.ts` (new) — HTTP glue
- `workers/api/src/performance/updater.test.ts` (new)
- `workers/api/src/performance/repo.test.ts` (new)
- `workers/api/src/performance/handler.test.ts` (new)
- `workers/api/src/db/schemas.ts` (modified) — add PerformanceRatingRowSchema
- `workers/api/src/index.ts` (modified) — wire POST/GET /purchase/:id/performance + GET /performance/history
- `CHECKLIST.md` (modified)

## Apple-product bar hooks

| § | Rule | How S6-W37 meets it |
|---|---|---|
| 2 intelligent | inputs anticipate intent | enum for criterionFeedback signal; integer 1..5 for rating; strict Zod |
| 9 honest loading | response narrates what happened | preferenceUpdate.reason string names exactly which signals fired |
| 10 never a placeholder | empty-state has a real meaning | `applied: false, reason: "no prior preference row — stored rating only"` — never silent |
| off-limits | no affiliate links | N/A (pure learning loop, no product URLs) |

## Acceptance criteria

1. Migration `0007_performance.sql` applied remote.
2. POST /purchase/:id/performance with `overallRating=5 + wouldBuyAgain=true + criterionFeedback: [{build_quality, more-important}]` against a preference row `{build_quality: 0.25, price: 0.40, pressure: 0.30, warranty: 0.05}` updates it in a deterministic way that:
   - `build_quality` increases
   - `price` may decrease slightly (renormalize effect)
   - weights still sum to 1.0
3. POST with `overallRating=1 + wouldBuyAgain=false` against the same row produces a dampening update of the top weight.
4. When the purchase's category has no preference row, the POST returns `applied: false, reason: "no prior preference row — stored rating only"` and the rating is persisted.
5. Second POST to the same (user, purchase) replaces the prior rating (UPSERT).
6. 401 on unauth; 404 when purchase doesn't exist; 403 on cross-user.
7. 400 on invalid body (missing required, out-of-range rating, unknown criterionFeedback signal).
8. GET /purchase/:id/performance returns null when no rating; returns the row when it exists.
9. GET /performance/history returns rows sorted newest-first.
10. Typecheck + tests green.
11. Deployed; smoke confirms route is live.
12. Commit + CHECKLIST ✅.

## Implementation checklist

1. Write migration 0007_performance.sql.
2. Add PerformanceRatingRowSchema to db/schemas.ts.
3. Write `performance/types.ts` — Zod request body + criterion-feedback schema.
4. Write `performance/updater.ts` — `applyPerformanceUpdate(weights, rating) → { before, after, deltas, applied, reason }`.
5. Write `performance/repo.ts` — upsertByPurchase, getByPurchase, listByUser.
6. Write `performance/handler.ts` — 3 endpoints with auth + validation + updater + createIntervention-free repo write + preferences repo update.
7. Write 3 test files with ≥ 30 combined tests.
8. Apply migration remote.
9. Wire routes in index.ts.
10. Typecheck + vitest.
11. Deploy.
12. Smoke curl (401 unauth proves route deployed).
13. Commit lens(S6-W37): performance tracking + Layer-4 preference updater.
14. Push + CHECKLIST ✅ + progress log entry.
