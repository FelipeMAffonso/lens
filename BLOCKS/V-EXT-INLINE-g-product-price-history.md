# V-EXT-INLINE-g — Product-page price-history inline badge

**Depends on:** S4-W21 ✅ (/price-history/detect), F7 ✅ (overlay badge), V-EXT-INLINE-bcde ✅ (manifest host allowlist already covers Amazon/BestBuy/Walmart/Target/HomeDepot/Costco).

**Goal:** On every retailer product page the user visits, Lens quietly checks the 90-day price trajectory and inserts a small inline badge near the price. Verdict shapes: **genuine-sale** (green), **fake-sale** (red — the 30% off banner is really 3% below median), **modest-dip**, **no-sale** (neutral), **insufficient-data** (grey). Click opens the sidebar with the full SaleDetectionResult.

Per `BLOCK_PLAN.md`:

> V-EXT-INLINE-g: S4-W21 (price history) inline on any product page.

## Architecture

Pure content-script addition. No new backend. Reuses the per-host DOM parsers already shipped in S3-W15 to extract price + productId.

```
content/retail/price-history-badge.ts (new)
  ├── detectPricePage(location): ProductPageMeta | null
  │     (returns null on non-product pages)
  ├── extractProductMeta(document): { host, productId, currentPrice, currency }
  ├── postToPriceHistory(meta): Promise<SaleDetectionResult>
  │     (POST /price-history/detect with { url, currentPrice, asin? })
  ├── renderBadge(verdict, delta, anchor): HTMLElement
  │     (shadow-DOM, coral-accent, clickable)
  └── bootPriceHistory(): void
      (wired into content.ts's per-host retailer path)
```

### Page-type detection

The existing `classifyPageType()` in content.ts returns "product" when URL matches `/product|/dp/|/p/`. Reuse that; wrap with the host check (host must be in the Amazon/BestBuy/Walmart/Target/HomeDepot allowlist).

### Price extraction

Per-host selectors (partial — reuse `workers/api/src/parsers/hosts/*` logic conceptually but run client-side):
- Amazon: `#priceblock_ourprice, .a-offscreen, .a-price-whole` + `.a-price-fraction`.
- Best Buy: `.priceView-hero-price .priceView-customer-price`.
- Walmart: `[data-automation-id="product-price"]`.
- Target: `[data-test="product-price"]`.
- Home Depot: `[data-testid="mainPrice"]`.

ASIN / product-id extraction (Amazon only): `/\/(?:dp|gp\/product)\/([A-Z0-9]{10})\b/`.

### Backend call

Existing S4-W21 endpoint:
```
POST /price-history/detect
  body: { url, currentPrice, asin?: string, bannerDiscountPct?: number }
  → { verdict: "genuine-sale" | "fake-sale" | "modest-dip" | "no-sale" | "insufficient-data",
      explanation: string,
      discountClaimed?: number, discountActual?: number }
```

### Badge rendering

Shadow-DOM span inserted as a *sibling* of the price element:
- `fake-sale`: red pill "⚠ Fake sale · discount is {actual}% vs claimed {claimed}%"
- `genuine-sale`: green pill "✓ Genuine sale · {delta}% below 90-day median"
- `modest-dip`: amber pill "↓ Modest dip · {delta}%"
- `no-sale`: neutral pill "· Current price in line with 90-day median"
- `insufficient-data`: grey pill "? Insufficient price history"

Click opens the sidebar with the full SaleDetectionResult + a chart of the 90-day series.

### Idempotency + caching

- Per-session cache on `(host, productId||currentPrice)` so repeated DOM mutations (user scrolls, price re-renders) don't refetch.
- Badge attribute `data-lens-price-badge="1"` prevents double-insertion.

### Apple-bar

| § | How met |
|---|---|
| 2 intelligent | reads 1 price, 1 API call, single badge. Not five. |
| 5 accessible | shadow-DOM + role="status" + aria-live="polite" |
| 6 silent-unless-signal | no badge when verdict === "no-sale" (the default state; badge is only for genuine or fake or insufficient) |
| 10 never a placeholder | all 5 verdicts have specific copy; grey "insufficient" still tells user why |

## Files touched

- `apps/extension/content/retail/price-history-badge.ts` (new)
- `apps/extension/content/retail/detect-product-page.ts` (new)
- `apps/extension/content/retail/*.test.ts` (new)
- `apps/extension/content.ts` (wire booth retailer path)
- `BLOCKS/V-EXT-INLINE-g-product-price-history.md` (this file)
- `CHECKLIST.md`

## Implementation checklist

1. Write detect-product-page.ts — identify host + page type + extract price + ASIN.
2. Write price-history-badge.ts — render + call endpoint + cache.
3. Wire into content.ts after the passive-scan path, gated on host ∈ retailer allowlist AND pageType === "product".
4. Write 4+ tests (detect, render states, cache, no-double-insertion).
5. Rebuild extension.
6. Judge pass.
7. Apply P0/P1.
8. Commit + push.
9. CHECKLIST ✅.
