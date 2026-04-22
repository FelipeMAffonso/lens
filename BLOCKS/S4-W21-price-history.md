# S4-W21 — Price history + sale legitimacy

**Goal:** for any retailer product URL, return a 90-day price series + a deterministic "fake sale" verdict. Surface it as an inline overlay pill on product pages.

**Why the block exists:**

"30% off" is the single most common purchase-motivating dark pattern. Amazon famously ran "Prime Day" with prices that were strictly higher than the rolling 90-day median. Keepa and CamelCamelCamel solved this externally; Lens does it natively so that the same badge that flagged `hidden-costs` at checkout also flags `fake-sale` at the product-page discount banner.

`AMBIENT_MODEL.md §2` treats price history as a passive surface — a tiny pill next to the price element, never modal, explainable-on-hover. `VISION_COMPLETE.md` touchpoint #9 lists this as demo-critical.

## The contract

### Request

```
GET /price-history?url=<urlencoded product URL>&category=<optional>
```

### Response

```ts
{
  url: string;
  canonicalUrl: string;           // query/fragment-stripped
  host: string;                   // "amazon.com"
  productId?: string;             // ASIN / SKU / URL-path ID we could extract
  currency: "USD";
  series: Array<{                 // reverse chronological, max 90
    date: string;                 // ISO date
    price: number;
  }>;
  current: number;
  median90: number;
  min90: number;
  max90: number;
  stddev90: number;
  saleVerdict: "genuine-sale" | "fake-sale" | "modest-dip" | "no-sale" | "insufficient-data";
  saleExplanation: string;        // 1-2 sentences
  discountClaimed?: number;       // percent, if a "X% off" banner was detected
  discountActual?: number;        // vs rolling median
  source: "keepa" | "fixture" | "none";
  cacheAgeSec: number;
  generatedAt: string;
}
```

### Heuristics

- **Fake sale:** a claimed discount of ≥ 15% whose actual discount against 90-day median is < 5%. Example: "30% OFF — was $299 now $209" but 90-day median is $210.
- **Genuine sale:** current price is more than 1 stddev below 90-day median.
- **Modest dip:** current < median by 1-5%, no loud "X% off" banner.
- **No sale:** current ≈ median.
- **Insufficient data:** fewer than 14 data points in the last 90 days.

### Data sources

1. **Keepa API** (`KEEPA_API_KEY` secret) — when available, real Amazon price history.
2. **Fixture mode** (`LENS_PRICE_MODE=fixture`) — deterministic 90-point series keyed by URL hash; enables demos without external keys. This is the hackathon default.
3. **None** — no key + no fixture → `source: "none"` + `series: []` + `saleVerdict: "insufficient-data"`.

Cache: per-URL, 24h TTL in KV. Keyed by SHA-256 of canonicalUrl.

### Surfaces

- **Worker:** `GET /price-history?url=...`.
- **Extension (future):** inline pill on Amazon product pages (amazon-price host module — scaffolded here).

## Implementation checklist

1. **`workers/api/src/price-history/types.ts`** — request/response Zod + TS.
2. **`workers/api/src/price-history/canonical.ts`** — URL canonicalization + host+productId extraction (Amazon ASIN, Best Buy SKU, Walmart IP).
3. **`workers/api/src/price-history/stats.ts`** — series-level statistics (median, stddev, min, max).
4. **`workers/api/src/price-history/detect.ts`** — fake-sale detector.
5. **`workers/api/src/price-history/fixture.ts`** — deterministic price-series generator keyed by URL hash.
6. **`workers/api/src/price-history/keepa.ts`** — stub client with interface, fail-closed when key absent.
7. **`workers/api/src/price-history/handler.ts`** — HTTP glue + KV cache.
8. **Wire** `GET /price-history` in `workers/api/src/index.ts`.
9. **Tests** — one test file per module; target ≥ 25 new tests total.
10. **Deploy** + **curl smoke** against a real-looking Amazon URL.

## Apple-product bar

- **Silent until signal (§2):** no badge until the price element is located AND a verdict other than "no-sale" is returned. Explain on hover.
- **Honest loading (§9):** response includes `cacheAgeSec` so UI can label "cached from 18h ago" vs "fresh".
- **Never a placeholder (§10):** when `source: "none"`, the extension's pill hides itself rather than showing a skeleton; the API still returns a structured verdict (`insufficient-data`) so callers never see an empty shape.

## Acceptance criteria

1. `GET /price-history?url=<amazon-product-url>` returns 200 with a valid series (fixture mode).
2. `saleVerdict` correctly identifies the 4 canonical cases from unit fixtures (genuine, fake, modest, no).
3. `median90`, `stddev90`, `min90`, `max90` match the stats module's outputs exactly.
4. Missing/invalid URL → 400 with Zod issues.
5. Response shape satisfies the contract above.
6. 24h KV cache round-trips (second call has `cacheAgeSec > 0`).
7. Typecheck + all tests green.
8. Deployed; curl smoke returns real data.

## Files touched

- `workers/api/src/price-history/types.ts` (new)
- `workers/api/src/price-history/canonical.ts` (new)
- `workers/api/src/price-history/stats.ts` (new)
- `workers/api/src/price-history/detect.ts` (new)
- `workers/api/src/price-history/fixture.ts` (new)
- `workers/api/src/price-history/keepa.ts` (new, stub)
- `workers/api/src/price-history/handler.ts` (new)
- `workers/api/src/price-history/*.test.ts` (several)
- `workers/api/src/index.ts` (modified — route wired)
- `workers/api/.dev.vars.example` (modified — KEEPA_API_KEY)
- `docs/secrets.md` (modified — KEEPA_API_KEY row)
