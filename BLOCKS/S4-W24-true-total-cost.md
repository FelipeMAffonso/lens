# S4-W24 — True-total-cost reveal

**Goal:** for any retailer product URL + user jurisdiction (ZIP or country), emit the itemized "what this purchase actually costs" — stated price + shipping + tax + category-specific hidden operating costs over 1 year and 3 years.

**Why the block exists:**

`VISION_COMPLETE.md §6` Marriott worked example + `AMBIENT_MODEL.md §5` ambient posture both call for a cart-time "true cost" badge. The primary reveal is that a $349 espresso machine isn't $349 — it's $349 + $50 shipping + $30 tax + (~$400/yr beans + $25/yr descaler + $45/yr filters) + grinder upgrade (if needed). Most AI recommendation assistants stop at the sticker price; Lens surfaces the year-over-year reality.

Every category pack already carries `body.typicalHiddenCosts: Array<{name, annualCostUsd: [min, max], frequency}>`. This block wires that data into a consumer-facing computation.

## The contract

### Request

```
GET /total-cost?url=<urlencoded product URL>&zip=<optional US zip>&country=<optional ISO-2, default US>
```

### Response

```ts
{
  url: string;
  canonicalUrl: string;
  host: string;
  product: {
    name: string;
    brand?: string;
    category?: string;        // inferred from parsed product
  };
  sticker: number;            // stated price
  currency: "USD";
  tax: {
    rate: number;             // e.g. 0.0925
    amount: number;           // sticker * rate
    jurisdiction: string;     // "CA", "NY", "UK", ...
    source: "zip" | "state" | "country" | "fallback";
  };
  shipping: {
    amount: number;
    reasoning: string;        // "free on this host" | "flat $X" | "estimated"
    source: "host-policy" | "estimated";
  };
  hiddenCosts: Array<{
    name: string;
    annualMin: number;
    annualMax: number;
    frequency: string;
    annualMid: number;        // (min + max) / 2
  }>;
  totals: {
    upfront: number;              // sticker + tax + shipping
    year1: number;                // upfront + sum(hiddenCosts.annualMid)
    year3: number;                // upfront + 3 * sum(ongoing annualMid) + sum(one-time)
  };
  notes: string[];            // human-readable callouts
}
```

### Tax table

Simple US state rate table in `tax.ts` (top 12 most-queried states + fallback). Every rate carries a source note. No attempt at municipal precision — the worker ships an approximation, clearly labeled as such.

### Shipping policy

Per-host defaults in `shipping.ts`:
- amazon.com → $0 (Prime assumption, flagged in `reasoning`)
- bestbuy.com → $0 over $35
- walmart.com → $0 over $35
- target.com → $0 over $35
- homedepot.com → $0 over $45
- shopify generic → $7.99 flat estimate
- Unknown host → 5% of sticker (capped at $25)

### Category resolution

Reuse `parsers/parse.ts` → pickedProduct.name → `inferCategoryFromName` (already extracted in S3-W15) → `registry.findCategoryPack`. If no pack matches, `hiddenCosts: []` and notes explains why.

## Implementation checklist

1. `workers/api/src/total-cost/types.ts` — Zod request + TypeScript response.
2. `workers/api/src/total-cost/tax.ts` — zip → state → rate lookup.
3. `workers/api/src/total-cost/shipping.ts` — host → policy.
4. `workers/api/src/total-cost/compute.ts` — pure function that takes `{sticker, hiddenCosts, tax, shipping}` and returns totals.
5. `workers/api/src/total-cost/handler.ts` — HTTP wrapper.
6. Tests — tax, shipping, compute, handler.
7. Wire `GET /total-cost` in index.ts.
8. Deploy + smoke.

## Acceptance criteria

- `GET /total-cost?url=<Breville espresso>&zip=94110` returns the itemized breakdown.
- Tax rate for CA ZIP is non-zero (~7.25% baseline).
- HiddenCosts pulled from espresso-machines pack (beans, descaler, filters).
- Year-1 total > upfront total by at least the ongoing hiddenCosts sum.
- Typecheck clean, all new tests green.
- Deployed live, smoke curl returns structured payload.

## Apple-product bar

- **Honest loading (§9):** response notes call out approximations (e.g., "tax is a state-level baseline; municipal rate may differ").
- **Never a placeholder (§10):** when hiddenCosts is empty, the response explains why (category pack unavailable) rather than shipping a blank array silently.
