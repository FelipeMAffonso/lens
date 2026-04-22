# V-EXT-INLINE-f — Cart-page checkout-readiness badge

**Depends on:** S4-W28 ✅ (`POST /checkout/summary`), S4-W22 ✅ (passive-scan runs on cart/checkout pages and yields confirmedCount+topPattern), V-EXT-INLINE-g ✅ (retail content-script scaffold).

**Goal:** On every retailer cart/checkout page, Lens renders a single **proceed / hesitate / rethink** badge at the cart-total region. The badge aggregates the signals the content script already collects (passive dark-pattern hits) and surfaces the composite verdict with the top rationale lines.

Per `BLOCK_PLAN.md`:

> V-EXT-INLINE-f: S4-W28 (cart/checkout summary) inline on any cart / checkout page.

## Architecture

Pure content-script addition. Reuses the existing passive-scan run + dark-pattern hit list to compose the request. No new backend — `/checkout/summary` exists and expects already-computed signals.

```
content/retail/cart-summary-badge.ts (new)
  ├── detectCartPage(location) → { host, pageType: "cart"|"checkout" } | null
  ├── cartTotalAnchor(host)     → HTMLElement | null    (per-host selector)
  ├── collectPassiveScanSignal(): { confirmedCount, topPattern? }
  │     (reads hits already computed by content.ts)
  ├── postCheckoutSummary(req)  → CheckoutSummaryResponse | null
  ├── renderVerdictBadge(resp, anchor): HTMLElement
  │     (shadow-DOM; verdict-colored; click expands to show the rationale list)
  └── bootCheckoutSummary(hits, host): void
      (invoked from content.ts after passive-scan finishes)
```

### Page-type detection

Reuse `classifyPageType()` already in content.ts. A page is cart/checkout when URL matches `/cart|/checkout|/booking/confirm|/payment`.

### Cart-total anchors (per host)

- Amazon: `#sc-subtotal-amount-buybox .a-size-medium, #sc-subtotal-amount-buybox` (Amazon's subtotal label in the cart).
- Best Buy: `[data-testid="order-summary-subtotal-value"]`.
- Walmart: `[data-testid="order-summary-sub-total"]`.
- Target: `[data-test="order-summary-subtotal"]`.
- Home Depot: `.price-detailed__total`.
- Costco: `[data-automation-id="orderSummarySubtotal"]`.

### Composed request

```ts
{
  host: "amazon.com",
  signals: {
    passiveScan: { confirmedCount: N, topPattern?: "hidden-costs", ran: "heuristic-only" }
  }
}
```

Future passes add `totalCost`, `breachHistory`, `priceHistory`. For this increment, passiveScan-only is enough to demonstrate the verdict surface end-to-end.

### Response → badge

- `proceed` (green): "Lens: looks clean — proceed"
- `hesitate` (amber): "Lens: hesitate — {top rationale}"
- `rethink` (red): "Lens: rethink — {top rationale}"

Click expands inline to show full rationale list (up to 3 items).

### Apple-bar

| § | How met |
|---|---|
| 2 intelligent | single verdict + top rationale in one scan |
| 5 accessible | `role="status"` + `aria-live="polite"`; keyboard focus on click |
| 6 silent-unless-signal | `proceed + 0 signals` → suppress entirely (cart has nothing to flag) |
| no-affiliate | URL never constructed; no retailer link surfaced |

## Files touched

- `apps/extension/content/retail/cart-summary-badge.ts` (new)
- `apps/extension/content/retail/cart-summary-badge.test.ts` (new)
- `apps/extension/content.ts` (wire bootCheckoutSummary inside passive-scan path on cart/checkout)
- `BLOCKS/V-EXT-INLINE-f-cart-summary.md` (this file)
- `CHECKLIST.md`

## Implementation checklist

1. cart-summary-badge.ts — page-detect + anchor + post + render.
2. tests — host detection, anchor selection, badge suppression for proceed+0.
3. Wire into content.ts after passiveScan completes on cart/checkout pages.
4. Rebuild ext.
5. Judge pass.
6. Apply P0/P1.
7. Commit + push + CHECKLIST ✅.
