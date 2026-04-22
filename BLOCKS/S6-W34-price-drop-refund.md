# S6-W34 — Price-drop refund watcher

**Goal:** when a product a user bought drops in price within the retailer's price-match window, Lens drafts a refund/price-match claim automatically. The user sees "we filed a $42 price-match claim at Best Buy for your MacBook Air (bought 11 days ago, now $100 cheaper)" in their weekly digest.

**Why this block:**

VISION_COMPLETE.md §3 Sarah narrative — "Lens filed a price-match claim while you slept" — is the advocate-mode demo beat paired with S0-W5 (inbox receipts → purchases table). This block composes:
- `S4-W21 /price-history` (already ✅) for current-price signal
- `F2 purchases` (already ✅) for what the user owns
- `F2 interventions` (already ✅) for the drafted claim lifecycle
- `F4 cron` dispatcher (already ✅) — the existing `17 */2 * * *` pattern already declares `price.poll` as its workflow target; we register the handler.

No new tables. No new external APIs. Pure orchestration of already-shipped pieces + a retailer price-match-window rule table.

## Contract

### Retailer price-match windows

Stored as a static table in `price-refund/windows.ts`. Expandable via PR.

| Retailer | Window | Notes |
|---|---|---|
| Best Buy | 15 days | Standard return + price match. |
| Target | 14 days | Target RedCard can extend to 30. |
| Walmart | 7 days | Walmart.com items only (no marketplace). |
| Amazon | 0 days | **Amazon no longer offers price match as of 2018-05.** Lens surfaces an informational note but does NOT draft a claim. |
| Home Depot | 30 days | Both before and after purchase. |
| Costco | 30 days | Lowest price guarantee. |
| Lowe's | 30 days | Price matching active. |

### Detector decision

```ts
detectClaim({
  purchase: { retailer, price, purchased_at, product_name },
  currentPrice,                        // from /price-history
  now,                                 // Date
  window: { retailer, days, active },  // from windows table
}): ClaimDecision;
```

Returns:
- `{ claim: true, delta, draftNote, expiresAt }` when:
  - window is active
  - `now - purchased_at < windowDays`
  - `currentPrice < purchase.price`
  - drop ≥ $1 AND ≥ 2% of original (skip trivial drops)
- `{ claim: false, reason }` otherwise.

### Draft payload

The workflow writes an `interventions` row with `pack_slug: intervention/file-price-match-claim` + `payload_json`:

```ts
{
  businessName: "Best Buy",
  originalPrice: 1499.00,
  currentPrice: 1399.00,
  priceDelta: 100.00,
  purchaseDate: "2026-04-15",
  productName: "MacBook Air M3",
  orderId: "BBY-123456",
  expiresAt: "2026-04-30",            // windowDays from purchased_at
  claimLetter: "<rendered email body>",
  contactUrls: {
    portal: "https://bestbuy.com/site/customer-service/price-match-guarantee/...",
    email: "customercare@bestbuy.com",
  },
}
```

The claim letter is assembled from a template (inline in `claim-drafter.ts`). When the intervention pack `intervention/file-price-match-claim` ships, the workflow picks up the pack template.

### Endpoints

- **`POST /price-refund/scan`** (auth) — walk the signed-in user's active purchases, detect claim candidates, emit an array without writing interventions. User-triggered dry run.
- **`GET /price-refund/candidates`** (auth) — same output, reading a cached scan + cross-referenced with existing interventions.
- **`POST /price-refund/:purchaseId/file`** (auth) — write an intervention row + return the draft for the user to send.
- **`GET /price-refund/windows`** — public; returns the retailer window table (documentation surface).

### Cron workflow

Register `price.poll` with the engine:

```
enumerate-purchases → fetch-prices (parallel fanout, limited concurrency) →
  classify (detector) → draft-and-persist (only when claim=true)
```

The cron fires every 2h (`17 */2 * * *`). Each run scans active purchases, skips ones already drafted (interventions already filed), and writes a new intervention per claim candidate.

## Implementation checklist

1. `workers/api/src/price-refund/types.ts` — Zod + TypeScript.
2. `workers/api/src/price-refund/windows.ts` — retailer table + `windowFor(retailer)`.
3. `workers/api/src/price-refund/detector.ts` — pure `detectClaim(...)`.
4. `workers/api/src/price-refund/claim-drafter.ts` — draft letter + contact-URL lookup.
5. `workers/api/src/price-refund/repo.ts` — `listEligiblePurchases(d1, userId)` helper over existing `purchases` + `interventions` tables.
6. `workers/api/src/price-refund/workflow.ts` — `price.poll` workflow registered with the engine.
7. `workers/api/src/price-refund/handler.ts` — HTTP glue.
8. Wire routes in `index.ts`.
9. Tests per module.
10. Deploy + smoke.

## Acceptance criteria

- Windows table covers ≥ 7 retailers.
- `detectClaim` returns `claim: true` only when window active + date within + meaningful drop.
- Amazon purchase → `claim: false, reason: "Amazon discontinued price matching in 2018"`.
- Draft letter includes all 6 required fields (business, product, purchase date, order id, original price, current price, delta).
- `GET /price-refund/windows` returns the public table.
- `POST /price-refund/scan` lists candidates (never writes).
- `POST /price-refund/:purchaseId/file` writes an `interventions` row via F2 repo.
- `price.poll` workflow registered and idempotent (second run skips already-drafted claims).
- Typecheck + all tests green.
- Deployed, smoke curl returns structured response.

## Apple-product bar

- **Honest loading (§9):** `scan` response carries `elapsedMs` + counts of eligible / ineligible / already-filed.
- **Silent until signal (§2):** no outbound actions; drafts are stored — user always confirms before sending.
- **Never a placeholder (§10):** unknown retailer → returns `{ claim: false, reason: "retailer policy not known to Lens" }` with the exact string, not a silent skip.
