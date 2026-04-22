# S4-W27 — Scam / fraud detection

**Goal:** given a host + optional product context (price, category, productName), emit a deterministic scam-risk verdict + per-signal rationale. The extension paints this as a pre-checkout warning when a user is about to type a card number on a site Lens has structural reasons to distrust.

**Why the block exists:**

VISION_COMPLETE.md §3 Sarah narrative: one of her canonical moments is near-missing a fake retailer. This is the workflow that catches it. Complements S4-W22 (dark patterns on known retailers) + S4-W26 (breach history on legit retailers) by surfacing "this isn't a legit retailer at all" before either of those matters.

No LLM required in v1 — all signals are deterministic: domain age from fixture WHOIS, Levenshtein typosquat distance against a major-brand allowlist, HTTPS presence, price-too-low vs category-median from category packs, trust-signal presence (verified-retailer list). Composable with S4-W28 checkout-summary for the unified checkout verdict.

## Contract

### Request

```
POST /scam/assess
{
  host: string,
  productName?: string,
  category?: string,            // optional slug to unlock price-too-low check
  price?: number,
  receivedViaHttps?: boolean,   // caller-supplied (extension knows current page scheme)
}
```

### Response

```ts
{
  host: string;
  verdict: "safe" | "caution" | "scam";
  riskScore: number;            // 0..100 (higher = scammier)
  signals: Array<{
    id: string;
    verdict: "ok" | "warn" | "fail";
    detail: string;
  }>;
  typosquat?: {
    nearestBrand: string;
    editDistance: number;
  };
  source: "fixture" | "hybrid";
  generatedAt: string;
}
```

### Signal set (deterministic)

| id | What it checks |
|---|---|
| `domain-age` | Fixture WHOIS — domains < 30 days → fail, < 90 days → warn, ≥ 1 year → ok. |
| `typosquat` | Levenshtein distance ≤ 2 from any of the 30+ major brands (amazon, bestbuy, walmart, target, costco, paypal, apple, ebay, etsy, ...). Distance 1 → fail, distance 2 → warn, ≥ 3 → ok. |
| `https` | `receivedViaHttps: false` → warn (HTTPS is universal on legit retailers). |
| `trust-signals` | Host on verified-retailer allowlist → +ok bonus. |
| `price-too-low` | When category supplied + category pack has a price floor + supplied price < floor / 3 → fail. |

### Score → verdict

```
riskScore = sum of signal weights:
  fail = 40, warn = 15, ok = 0
  + trust-signal bonus: -15 if host on verified list
clamp [0, 100]
verdict: < 20 safe · 20..54 caution · ≥ 55 scam
```

### Brand allowlist (30+ entries)

In `brands.ts`. Covers the top consumer retailers + payment brands (amazon, ebay, walmart, target, bestbuy, costco, homedepot, lowes, etsy, shopify, paypal, apple, shein, temu, wayfair, newegg, microcenter, fry's, zappos, nordstrom, macys, kohls, jcpenney, sephora, ulta, rei, gap, nike, adidas, underarmour, zappos, ...).

### Fixture domain-age data

`fixtures.ts` lists recently-created suspicious-looking domains + well-established ones. Expandable via PR. Real WHOIS integration is a follow-up block (requires a paid API).

## Implementation checklist

1. `workers/api/src/scam/types.ts` — Zod + TS.
2. `workers/api/src/scam/brands.ts` — 30+ brand allowlist + trust-signal list.
3. `workers/api/src/scam/levenshtein.ts` — optimized edit distance.
4. `workers/api/src/scam/domain-age.ts` — fixture WHOIS + lookup.
5. `workers/api/src/scam/assess.ts` — pure scoring + rollup.
6. `workers/api/src/scam/handler.ts` — HTTP glue.
7. Tests per module.
8. Wire `POST /scam/assess` in index.ts.

## Acceptance criteria

- `amaz0n-deals.com` → `scam` verdict (typosquat distance 2 vs amazon).
- `target.com` → `safe` verdict (trust-signal bonus + 20+ year domain).
- Unknown brand-new host (fixture: `brand-new-shop-2026.example`) → at minimum `caution`.
- Typecheck + tests green.
- Deployed; smoke curl returns structured payload.

## Apple-product bar

- **Never a placeholder (§10):** `signals` always includes an entry per checked signal, with explicit `ok` / `warn` / `fail` rather than omitting.
- **Honest loading (§9):** `source: "fixture"` makes clear what evidence backed the verdict.
- **Silent until signal (§2):** verdict `safe` with no warnings → one info bullet "No red flags detected" rather than empty list.

## Files touched

- `workers/api/src/scam/types.ts` (new)
- `workers/api/src/scam/brands.ts` (new)
- `workers/api/src/scam/levenshtein.ts` (new)
- `workers/api/src/scam/domain-age.ts` (new)
- `workers/api/src/scam/assess.ts` (new)
- `workers/api/src/scam/handler.ts` (new)
- `workers/api/src/scam/*.test.ts` (new)
- `workers/api/src/index.ts` (modified — route)
