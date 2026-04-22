# V-EXT-INLINE-i — Marketplace counterfeit-risk inline badge

**Depends on:** S3-W18 ✅ (`POST /counterfeit/check` — 6-signal deterministic counterfeit detector), F6 ✅ (content-script scaffold), F7 ✅ (badge shadow-DOM patterns), V-EXT-INLINE-h ✅ (shipped predecessor; pattern established).

**Goal:** On third-party marketplace listings (eBay, Amazon third-party seller pages via storefront / `/sp/` URL, Facebook Marketplace, Walmart third-party, Mercari), Lens scrapes seller metadata + price + listing detail, POSTs `/counterfeit/check`, and renders a color-coded inline badge next to the price or "Buy It Now" button: "Likely counterfeit — {top-signal}" / "Counterfeit risk (monitor)" / "Authentic — verified retailer" / silent when clean.

Per `BLOCK_PLAN.md`:

> V-EXT-INLINE-i: S3-W18 (counterfeit check) inline on marketplace listings.

## Architecture

Content-script addition. Runs when the URL matches a marketplace listing pattern. Scrapes seller info (name, age, feedback count, star distribution), product (brand + name + price + declared category), POSTs existing `/counterfeit/check` endpoint, renders a shadow-DOM badge near the price. Cross-marketplace with per-host scraper table.

```
apps/extension/content/retail/counterfeit-badge.ts (new)
  ├── isMarketplaceListing(url): boolean
  │   (true when hostname + path match: ebay.com/itm, facebook.com/marketplace/item,
  │    amazon.com/sp (storefront) OR ?m= (seller-id), walmart.com/seller, mercari.com/us/item)
  ├── detectMarketplace(url): "ebay" | "amazon-3p" | "fb-marketplace" | "walmart-3p" | "mercari"
  ├── scrapeListing(host, document): ListingSnapshot | null
  │     (per-host selector table for seller name / feedback count / star dist /
  │      price / product name / brand / listing age. Each with primary + fallback.)
  ├── priceAnchor(host): HTMLElement | null
  │     (ebay: #prcIsum, #mainContent .x-price-primary .ux-textspans
  │      amazon-3p: #corePriceDisplay_desktop_feature_div, .a-price
  │      fb-marketplace: div[role="main"] span[dir="auto"] — regex-filtered for "$N"
  │      walmart-3p: [data-automation-id="product-price"]
  │      mercari: [data-testid="ItemDetailsPrice"])
  ├── postCounterfeitCheck(snapshot): CounterfeitResponse | null
  ├── renderBadge(resp, anchor): HTMLElement
  │     (color-code by verdict: authentic-verified-retailer green compact,
  │      monitor amber prominent, likely-counterfeit red mandatory with
  │      top signal + signal count. Click expands all signals + rationale.)
  └── bootCounterfeit(): void
```

### Per-host scrape table

**eBay** (`ebay.com/itm/{item-id}`):
- Seller name: `.x-sellercard-atf__info__about-seller a` or `[data-testid="ux-seller-section__item--seller"] a` → innerText.
- Seller feedback count: `.x-sellercard-atf__info__about-seller .ux-seller-section__item--feedback-count` → text like "(1,245)". Parse integer.
- Star distribution: only the aggregate feedback % is on the item page; full 1-5 star histogram requires clicking into seller profile. Use `.fdbk-seller-rating__positive` → "99.2%" as a proxy. For the bimodal signal, skip when distribution unavailable (pass `feedbackDistribution: null`).
- Listing age: not shown on item page; leave `sellerAgeDays: null`. Backend degrades gracefully.
- Price: `.x-price-primary .ux-textspans` primary, `#prcIsum` fallback.
- Product name: `.x-item-title .ux-textspans` → trimmed innerText.
- Brand: `.ux-layout-section-evo__item .ux-labels-values__values` when label = "Brand".

**Amazon 3P seller** (URL contains `/sp/`, `?m=`, or `&seller=`):
- Seller name: `#sellerProfileTriggerId` (on detail page) or `#sellerName` (on storefront) → text.
- Feedback count: `.feedback-link` or `.ceb-atf-seller-rating-count` → regex `/\(([\d,]+)\s*ratings?\)/`.
- Star distribution: `.a-histogram-row` rows with `data-rating` 1-5 → bimodal detector takes pct each.
- Listing age (seller age): `#sellerProfileContainer #from` → "since April 2024" → parse relative.
- Product page anchors inherited from V-EXT-INLINE-g.

**Facebook Marketplace** (`facebook.com/marketplace/item/{id}`):
- DOM is shadow-heavy + class-obfuscated. Primary strategy: textContent of `div[role="main"]` + regex.
- Seller name: `a[href*="/marketplace/profile/"]` → innerText (fallback: empty, mark optional).
- Feedback count: not available on FB Marketplace (no public seller rating). Pass `null`.
- Price: regex over main — first `$NUMBER` preceded by whitespace, at the top.
- Product name: `h1[role="heading"]` or first `h1` in main.

**Walmart 3P seller** (`walmart.com/seller/{id}` OR listing with `?sellerId=...`):
- Seller name: `[data-automation-id="seller-name"]`.
- Feedback count: `[data-automation-id="rating-count"]`.
- Price: shared with V-EXT-INLINE-g walmart anchor.

**Mercari** (`mercari.com/us/item/{id}`):
- Seller name: `[data-testid="ItemDetailsSellerDisplayName"]`.
- Feedback count: `[data-testid="ItemDetailsSellerRatings"]`.
- Price: `[data-testid="ItemDetailsPrice"]`.

### Silent-unless-signal (Apple-bar §6)

- verdict = `authentic-verified-retailer` AND signalCount = 0 → no badge (silent path). Mark anchor to avoid re-scan.
- verdict = `monitor` → compact amber badge (honest signal, non-blocking).
- verdict = `likely-counterfeit` → prominent red badge with top signal + signal count + expand affordance.

### Apple-bar

| § | How met |
|---|---|
| 1 smooth | Badge slides in with 180ms cubic-bezier; no layout shift because injected as sibling after the price anchor. |
| 2 intelligent | Top signal + one-sentence rationale in the collapsed state; expand reveals all 6 signals with the specific values that tripped them (e.g. "feedback distribution 22% 1-star + 64% 5-star — bimodal"). |
| 3 beautiful | Coral-accent focus ring, `#fdecec / #d85a5a` red band for counterfeit, `#fdf5e6 / #c78a1f` amber for monitor, `#ecfaf2 / #3fb27f` green for authentic-verified. Shadow-DOM isolated from host styles. |
| 4 motion with purpose | 180ms slide-in; 150ms expand/collapse. `prefers-reduced-motion` disables. |
| 5 accessible | `role="status"` + `aria-live="polite"` on the visually-hidden summary span (per V-EXT-INLINE-h judge P1-6 pattern — don't nest interactive button inside live region); button has explicit `aria-expanded`; full keyboard focus ring. |
| 6 silent-unless-signal | Authentic + zero signals renders nothing. |
| 7 delightful | Expand reveals signal-by-signal with specific counts ("seller is 42 days old, < 90d floor"), not abstract "suspicious". |
| 8 consistent | Re-uses tokens from V-EXT-INLINE-g/h. No new colors. |
| 9 honest loading | No spinner — the check is fast (< 200ms). On timeout, no badge (silent fail, never false-positive). |
| 10 no placeholder | Every rendered state has real copy grounded in the scraped values. |

### Consent + privacy

- Seller metadata IS Stage-2 excerpt traffic per `AMBIENT_MODEL.md §2`. Gate on `canStage2(host)`.
- Seller names ARE stripped client-side before POST (same pattern as V-EXT-INLINE-h P0-1 — backend accepts optional `sellerName` but client never sends PII).
- No URLs leaked with affiliate params; reuse `scrubClarifierText` equivalent or hardcode `linkCode`/`ref=`/`tag=` pattern strip on any URL surfaced in the badge (none surfaced in v1).

### Rate limit

Add `marketplace-counterfeit` policy to `workers/api/src/ratelimit/config.ts`: `windowSeconds: 3600, anonLimit: 120, userLimit: 1200`. Match V-EXT-INLINE-f/g/h cadence. `routeFromPath` gets a line: listings hit `/counterfeit/check` which already has `counterfeit-check` policy? Check current config; if not, add.

### SPA reattach

Same pattern as V-EXT-INLINE-g/h — `retailReboot()` in `content.ts` also re-runs `bootCounterfeit()`. eBay in particular pushState-navigates between item views.

## Files touched

- `apps/extension/content/retail/counterfeit-badge.ts` (new)
- `apps/extension/content/retail/counterfeit-badge.test.ts` (new)
- `apps/extension/content.ts` (import + wire in boot + retailReboot)
- `apps/extension/manifest.json` (add host_permissions for ebay.com, facebook.com/marketplace, mercari.com — Walmart + Amazon already covered)
- `workers/api/src/ratelimit/config.ts` (add policy if counterfeit-check doesn't already map)
- `workers/api/src/ratelimit/middleware.ts` (routeFromPath entry if needed)
- `BLOCKS/V-EXT-INLINE-i-marketplace-counterfeit.md` (this)
- `CHECKLIST.md`

## Acceptance criteria

- ≥ 8 tests: `isMarketplaceListing` (5 hosts + negatives), `detectMarketplace`, `scrapeListing` per host (smallest DOM fixture), `renderBadge` silent-on-clean + double-render guard.
- Rate-limit policy active.
- Seller name NEVER on the wire (regression test).
- Silent-unless-signal honored.
- SPA reattach via popstate + pushState monkey-patch.
- Affiliate param scrub proven by absence test.
- Consent gate: `canStage2(host)` — seller + listing text IS Stage-2 excerpt.

## Implementation checklist

1. `counterfeit-badge.ts` — detect + scrape + post + render.
2. Tests.
3. Wire into `content.ts` boot + retailReboot.
4. Manifest host_permissions update.
5. Rate-limit config (only add if not already in place for /counterfeit/check).
6. Rebuild extension.
7. Judge pass.
8. Apply P0/P1.
9. Commit + push + CHECKLIST ✅.

## Judge notes (reserved)

(Filled in after the Opus 4.7 critic pass.)

## Progress log (internal)

- 2026-04-22: Block written. Pattern inherits from V-EXT-INLINE-h (commit `a15a355`) and V-EXT-INLINE-g (commit `d0e605c`). Backend `/counterfeit/check` already shipped in S3-W18 (commit `2fff3d1`) and supports all 6 signals; client just needs to pass the subset it can scrape (remaining signals degrade gracefully on `null`).
