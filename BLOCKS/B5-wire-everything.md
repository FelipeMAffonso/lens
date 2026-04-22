# B5 — Wire everything into the UI

**Depends on:** F1 ✅ auth, F2 ✅ persistence, every workflow endpoint that already ships on /audit + /clarify + /repairability/lookup + /accessories/discover + /compare/framings + /breach-history + /price-history + /scam/assess + /privacy-audit + /checkout/summary + /provenance/verify + /sponsorship/scan + /counterfeit/check + /returns/draft + /subs/audit + /firmware/scan + /gift/* + /household/* + /values-overlay/* + /source-weighting/* + /total-cost + /compat/check + /performance/*.

**Goal:** The user's explicit directive (2026-04-22): "wire everything". Before B5, the home page shows a paste box + 3 modes + a ranked list. 25+ backend endpoints have zero UI. This block closes the integration gap on the audit result page so every signal the backend computes is visible on the audit card.

Per user (2026-04-22):
> "in the UI when I put the damn amazon link nothing works. the page is ugly. the top pick doesn't leave me to any page. it offered an option of 499 dollars (for espresso machine) instead of 119 dollars despite me saying price matters a lot. this is fully broken"

Per VISION_COMPLETE.md §4 (the touchpoint inventory): the web dashboard must render every backend-produced signal.

## Scope (this block only)

This block is the minimum viable "wire everything into the audit result". Follow-up blocks handle:
- B5-hero: hero animation + auth CTA redesign
- B5-tabs: dedicated pages for Repairability, Gifts, Household, Values
- B5-extension: inline sidebar injection on ChatGPT/Claude/Gemini (V-EXT-INLINE-*)

What ships now:
1. **Top pick clickable URL**: `specOptimal.url` is already on the API response + scrubbed of affiliate params at the search boundary. Render as "View at retailer ↗" link.
2. **enrichmentsCard**: surface all 5 parallel-enrichment signals (scam / breach / price-history / provenance / sponsorship) as a chip grid with color-coded verdicts (ok / skipped / error).
3. **repairabilityCard**: async fetch to /repairability/lookup for the top pick; render score + band + failure modes + parts availability + citations. Graceful loading/error states.
4. **elapsedFooter enrich**: include `enrich` stage time when present.
5. **Category extraction hardening**: QUERY_SYSTEM prompt now explicitly requires a concrete noun-phrase category (never "product", "item", "device" alone).

## Acceptance criteria

- Pasting an Amazon URL → audit renders with a clickable top-pick link.
- Query "espresso machine under $400, price matters a lot" → category extracted as "espresso machine" (not "product") → fixture match succeeds → Stilosa ranks first (rank-fix commit 8830097 lands this via top-level price).
- Every audit result shows a "Trust signals" card with at least the 5 enrichment chips.
- Every audit result shows a "Repairability" card that loads async, shows a score or a clear "no-info" fallback with a real iFixit search link.
- No affiliate params surface in any rendered URL.
- Apple-product-bar: chips are color-coded (ok/skip/err), compact, mobile-responsive (single-column at ≤720px).

## Files touched

- `apps/web/src/main.ts` — heroPickCard URL link, enrichmentsCard, hydrateRepairabilityCard, elapsedFooter.enrich.
- `apps/web/src/styles.css` — `.trust-grid`, `.trust-chip`, `.repair-grid`, `.repair-score` (4 bands).
- `workers/api/src/extract.ts` — QUERY_SYSTEM prompt hardening to refuse generic categories.
- `BLOCKS/B5-wire-everything.md` (this file).

## Implementation checklist

1. main.ts: extend heroPickCard to render clickable `o.url` when present.
2. main.ts: add enrichmentsCard(r) renderer.
3. main.ts: add hydrateRepairabilityCard(r, slot) async renderer.
4. main.ts: extend elapsedFooter with optional `enrich` time.
5. main.ts: wire both cards into renderResult between heroPickCard and criteriaCard.
6. styles.css: add `.trust-*` + `.repair-*` classes with band color coding.
7. extract.ts: replace QUERY_SYSTEM prompt with explicit category requirements.
8. Build apps/web, deploy to Cloudflare Pages.
9. Smoke test (web): paste the user's failing espresso query → top pick should be Stilosa + enrichments card visible + repairability card loads.
10. Opus 4.7 judge pass (mandatory).
11. Apply P0/P1 in-block.
12. Commit `lens(B5): ...` + push.
13. CHECKLIST.md progress log.
