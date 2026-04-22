# S3-W18 — Counterfeit / grey-market check

**Goal:** for a marketplace listing (Amazon third-party seller, eBay, Etsy, AliExpress), emit a deterministic counterfeit-risk verdict based on seller + pricing + listing signals the extension can read from the DOM. Closes Stage-3 evaluation track at 6 of 7 (S3-W19 sponsorship remains).

**Why the block exists:**

GAP_ANALYSIS.md §4 calls this out: AI-chat recommendations routinely point users to third-party marketplace listings without any verification of seller authenticity. VISION_COMPLETE.md §3: Sarah's counterfeit-Breville moment is demo-critical — she avoids a $299 "Amazon renewed" Bambino that's actually a recased knockoff because Lens flagged the seller's 42-day age + bimodal 1-star/5-star feedback distribution.

Different scope from S4-W27 scam detection:
- S4-W27 operates at the **domain level** (is this retailer legit?)
- S3-W18 operates at the **seller level within a marketplace** (is this specific seller selling authentic product?)

They compose — the extension checks S4-W27 for the host + S3-W18 for the listing.

## The signal stack

No LLM. All deterministic. Extension supplies signals it already read from the DOM:

| id | What it means | Penalty |
|---|---|---|
| `seller-age-too-new` | Seller registered < 90 days ago | warn +10 if < 180, fail +25 if < 90 |
| `feedback-volume-low` | Feedback count < 10 | warn +15 |
| `feedback-distribution-bimodal` | ≥ 20% 1-star AND ≥ 60% 5-star (characteristic of review manipulation + genuine anger) | fail +25 |
| `price-too-low` | Price < category floor / 3 (reuses S4-W27 floors) | fail +30 |
| `unauthorized-retailer-claim` | Seller claims "authorized retailer" without verification — UI flag for user to manually verify | warn +10 |
| `grey-market-indicator` | Extension DOM scan surfaces keywords like "import-only", "no US warranty", "international version" | warn +10 per indicator (cap +20) |

### Score → verdict

```
riskScore = sum(penalties), clamp [0, 100]
verdict: < 20 authentic · 20–49 caution · ≥ 50 likely-counterfeit
```

### Bimodal feedback distribution

Given `{star1, star2, star3, star4, star5}` (integer counts), compute:
- `total = sum`
- `p1 = star1 / total`
- `p5 = star5 / total`
- `bimodal = p1 ≥ 0.20 AND p5 ≥ 0.60`

The shape: lots of five-stars (paid reviews / real satisfied buyers mixed together) AND lots of one-stars (defrauded buyers venting) with sparse 2/3/4 middle. Reliable counterfeit tell across Amazon + eBay literature.

## Contract

### Request

```
POST /counterfeit/check
{
  host: string,
  sellerId?: string,
  sellerName?: string,
  sellerAgeDays?: number,
  feedbackCount?: number,
  feedbackDistribution?: { star1, star2, star3, star4, star5 },
  productName?: string,
  category?: string,
  price?: number,
  authorizedRetailerClaim?: boolean,
  greyMarketIndicators?: string[],
}
```

### Response

```ts
{
  host: string;
  verdict: "authentic" | "caution" | "likely-counterfeit";
  riskScore: number;
  signals: Array<{
    id: string;
    verdict: "ok" | "warn" | "fail";
    detail: string;
  }>;
  feedbackProfile?: {
    p1: number;
    p5: number;
    total: number;
    bimodal: boolean;
  };
  generatedAt: string;
}
```

## Implementation checklist

1. `workers/api/src/counterfeit/types.ts` — Zod + TS.
2. `workers/api/src/counterfeit/bimodal.ts` — pure `analyzeBimodal({star1..5})`.
3. `workers/api/src/counterfeit/category-floors.ts` — re-export S4-W27's floor table OR define here + cross-link.
4. `workers/api/src/counterfeit/assess.ts` — pure composite scorer.
5. `workers/api/src/counterfeit/handler.ts` — HTTP glue.
6. Tests per module.
7. Wire `POST /counterfeit/check` in index.ts.
8. Deploy + smoke.

## Acceptance criteria

- `{sellerAgeDays: 42, feedbackCount: 8, feedbackDistribution: {star1: 3, star2: 0, star3: 0, star4: 0, star5: 10}, price: 99, category: "espresso machines"}` → `likely-counterfeit`.
- `{sellerAgeDays: 2000, feedbackCount: 50000, feedbackDistribution: {star1: 2000, star2: 1000, star3: 2000, star4: 10000, star5: 35000}, price: 500, category: "espresso machines"}` → `authentic`.
- Empty request body → 400.
- Typecheck + all tests green.
- Deployed; smoke curl returns shaped payload.

## Apple-product bar

- **Never a placeholder (§10):** `signals` always returns a list even if empty (with a single "insufficient-data" bullet).
- **Honest loading (§9):** `feedbackProfile` surfaces the computed p1/p5 so UI can render the bimodal histogram.
- **Silent until signal (§2):** no fan-out; pure computation over caller-supplied signals.

## Files touched

- `workers/api/src/counterfeit/types.ts` (new)
- `workers/api/src/counterfeit/bimodal.ts` (new)
- `workers/api/src/counterfeit/assess.ts` (new)
- `workers/api/src/counterfeit/handler.ts` (new)
- `workers/api/src/counterfeit/*.test.ts` (new)
- `workers/api/src/index.ts` (modified — route)
