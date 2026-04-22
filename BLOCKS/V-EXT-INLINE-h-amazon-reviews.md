# V-EXT-INLINE-h — Amazon review-authenticity banner

**Depends on:** S3-W17 ✅ (`POST /review-scan` heuristic), V-EXT-INLINE-g ✅ (retail content-script scaffold).

**Goal:** On Amazon product + dedicated review pages, Lens scrapes visible review text + metadata, POSTs `/review-scan`, and renders a single banner at the top of the reviews block: "Reviews look authentic" / "⚠ Burstiness + template phrasing flagged on N reviews" / "✗ Likely incentivized — X of Y reviews suspect".

Per `BLOCK_PLAN.md`:

> V-EXT-INLINE-h: S3-W17 (review authenticity) inline on Amazon review list.

## Architecture

Pure content-script addition. Runs on Amazon product pages AND the dedicated `/product-reviews/{ASIN}` pages. Parses DOM for reviews, POSTs /review-scan, renders a shadow-DOM banner.

```
content/retail/review-scan-badge.ts (new)
  ├── isAmazonReviewContext(location): boolean
  │     (true when on /dp/ASIN/ OR /product-reviews/ASIN/ OR #customerReviews anchor)
  ├── scrapeVisibleReviews(document): Review[]
  │     (Amazon selectors: [data-hook="review"] wrappers;
  │     text from [data-hook="review-body"]; rating from [data-hook="review-star-rating"];
  │     date from [data-hook="review-date"]; reviewer from [data-hook="genome-widget"])
  ├── reviewAnchor(): HTMLElement | null
  │     (#reviews-medley-footer or #cm-cr-dp-review-list or #customerReviews)
  ├── postReviewScan(reviews, productName?): ReviewScanResult | null
  ├── renderBanner(result, anchor): HTMLElement
  │     (color-coded by authenticityScore: ≥0.7 green "clean", 0.4-0.7 amber "mixed",
  │     <0.4 red "suspect". Shows top 2 signals + flagged-review count. Click expands.)
  └── bootReviewScan(): void
```

### Amazon review selectors

Product page (`/dp/ASIN`):
- Review wrappers: `#cm-cr-dp-review-list [data-hook="review"]` (up to ~8 top reviews).
- Review body: `[data-hook="review-body"] span` (innerText).
- Star rating: `[data-hook="review-star-rating"]` or `[data-hook="cmps-review-star-rating"]` (text like "5.0 out of 5 stars").
- Date: `[data-hook="review-date"]` (text like "Reviewed in the United States on March 3, 2025" — parse "March 3, 2025").
- Reviewer: `[data-hook="genome-widget"] .a-profile-name`.

Dedicated review page (`/product-reviews/ASIN`):
- Review wrappers: `#cm_cr-review_list [data-hook="review"]` (pagination: 10 per page).
- Same per-review selectors.

### Silent-unless-signal

- authenticityScore ≥ 0.7 → green banner (passes), optional.
- 0.4 ≤ score < 0.7 → amber banner.
- score < 0.4 → red banner, mandatory.
- Fewer than 2 reviews visible → skip (backend requires min 2).

### Apple-bar

| § | How met |
|---|---|
| 2 intelligent | banner shows top-2 signals + flagged review count in one scan |
| 5 accessible | `role="status"` + `aria-live="polite"`; click-to-expand `aria-expanded` |
| 6 silent-unless-signal | ≥ 0.7 banner is compact muted-green; only amber + red are prominent |
| no-affiliate | no URLs surfaced; no outbound links |

## Files touched

- `apps/extension/content/retail/review-scan-badge.ts` (new)
- `apps/extension/content/retail/review-scan-badge.test.ts` (new)
- `apps/extension/content.ts` (wire bootReviewScan on Amazon hosts)
- `BLOCKS/V-EXT-INLINE-h-amazon-reviews.md` (this file)
- `CHECKLIST.md`

## Acceptance criteria

- 6 tests minimum covering `isAmazonReviewContext`, `scrapeVisibleReviews` (with seeded DOM), banner suppression for < 2 reviews.
- Rate-limit policy `review-scan` added.
- Consent gate: canStage2(host) — review text IS Stage-2 excerpt.
- No affiliate param leaks.
- Amazon-only for this block; other retailers tracked as follow-up.

## Implementation checklist

1. review-scan-badge.ts — detect + scrape + post + render.
2. Tests.
3. Wire into content.ts Amazon branch.
4. Rebuild extension.
5. Rate-limit policy entry.
6. Judge pass.
7. Apply P0/P1.
8. Commit + push + CHECKLIST ✅.

## Judge pass 2026-04-22

Opus 4.7 critic returned 10 findings. Applied in-block: P0-1/2/3, P1-4/5/6, P3-10. Deferred: P1-7 (Vine iframe scraping — out of scope) + P2-8/9 (short-review threshold, telemetry).

**P0 fixes shipped:**
- `reviewer` name stripped client-side in `postReviewScan` before POST — no PII on wire. (AMBIENT_MODEL §2 Stage-2 contract compliance.)
- Single-flight `inFlight` boolean at module scope prevents duplicate fetches when `setTimeout(1500)` boot and `retailReboot` pushState-hook race.
- Per-ASIN 10-minute cache (`SCAN_CACHE` map) — Amazon sort/filter/paginate pushStates inside `/product-reviews/` no longer each burn rate-limit budget.

**P1 fixes shipped:**
- UK/day-first locale date parser (`3 March 2025`) added as second branch after US parser; temporal-clustering heuristic now works on amazon.co.uk.
- `.caveat` opacity raised 0.7 → 0.85 (now > AA contrast on amber + red bands).
- `role="status"` moved off the wrapping `<section>` onto a visually-hidden sibling span so the expand-button isn't nested inside a live region (fixes NVDA double-announce).

**P3 fix shipped:**
- `.score` (pct/100) hidden on suspect band — redundant with "Likely incentivized — N of M suspect" headline.

**Known limitations documented:**
- Amazon Vine iframe reviews (`aplus-reviews` iframe) are NOT scraped; `scrapeVisibleReviews` walks top document only. Acceptable — iframe scraping would require a cross-frame messaging protocol, tracked as future P-EXT-VINE-iframe block.
- Emoji-only / ≤8-char reviews are skipped by the length guard at `scrapeVisibleReviews` line 91. Acceptable for now; some legit short reviews ("Amazing!!") lost.
- No impression telemetry (F17 dependency) — tracked there.
