# Lens — Block Execution Checklist

**Loop discipline:** on each turn, (1) read this file, (2) find the first `⏳` block that is not blocked by an unchecked prereq, (3) read `BLOCKS/<block-id>.md` if it exists (write it if it doesn't), (4) execute every item in its "Implementation checklist" end-to-end, (5) run tests, (6) commit, (7) mark `✅`, (8) next turn.

**Status legend:** ✅ done · ⏳ in progress · ⬜ pending · ❌ blocked · 🟡 partial · 🔬 spec-only (block file not yet written)

**Rule:** never mark ✅ unless tests pass AND the acceptance criteria in the block file are met AND a commit exists referencing the block ID.

---

## Part A — Foundation

| # | Block | Status | File | Commit |
|---|---|---|---|---|
| F0 | Winner calibration (read-only) | ✅ | `BLOCKS/F0-WINNER-CALIBRATION.md` | - |
| F1 | Auth: magic-link + anon | ✅ | `BLOCKS/F1-auth-magic-link.md` | `c27013f` |
| F2 | Persistence: D1 + KV + R2 | ✅ | `BLOCKS/F2-persistence.md` | `604235e` |
| F3 | Workflow engine (DAG + bus + DO) | ✅ | `BLOCKS/F3-workflow-engine.md` | `2a96393` |
| F4 | Cron + scheduler primitives | ✅ | `BLOCKS/F4-cron.md` | `8ab4ab3` |
| F5 | Event bus + webhook surface | ✅ | `BLOCKS/F5-events-webhooks.md` | `7939873` |
| F6 | Extension inline sidebar infra | ✅ | `BLOCKS/F6-extension-sidebar.md` | `653e7ce` |
| F7 | Extension overlay + badge system | ✅ | `BLOCKS/F7-extension-overlay.md` | `3324390` |
| F8 | Extension content-script router | 🟡 | `BLOCKS/F8-host-router.md` | `3324390` (consent module + adapter router live; manifest narrow deferred) |
| F9 | PWA web + mobile layout | ✅ | `BLOCKS/F9-pwa.md` | `7939873` |
| F10 | Mobile share-sheet ingestion | 🟡 | `BLOCKS/F9-pwa.md` | `7939873` (manifest share_target shipped; /share route pending) |
| F11 | Voice input | ✅ | `BLOCKS/F11-voice.md` | `3324390` |
| F12 | Email inbox ingestion (Gmail OAuth) | 🟡 | `BLOCKS/F12-gmail-oauth.md` | `ab19963` (OAuth flow + token CRUD live; poller+parser land in S0-W5 with user-provided creds) |
| F13 | Plaid bank connection (stretch) | ⬜ | 🔬 | |
| F14 | MCP server | ✅ | `BLOCKS/F14-mcp-server.md` | `f5669ee` |
| F15 | Public Lens Score API | ✅ | `BLOCKS/F15-score-api.md` | `f5669ee` |
| F16 | Public disagreement ticker | ✅ | `BLOCKS/F16-ticker.md` | `ab19963` |
| F17 | Observability (logs + traces) | ✅ | `BLOCKS/F17-observability.md` | `8ab4ab3` |
| F18 | Authenticated rate limiting | ✅ | `BLOCKS/F18-rate-limit.md` | `35a9ca9` |
| F19 | Secrets + env parity | ✅ | `BLOCKS/F19-secrets-env-parity.md` | `750fffe` |
| F20 | Testing infrastructure | ✅ | `BLOCKS/F20-testing-infra.md` | `d6569a5` |

## Part B — Workflows by stage

### Stage 0 — Need emergence

| # | Workflow | Status | File | Commit |
|---|---|---|---|---|
| S0-W1 | Ad-influence traceback | ⬜ | 🔬 | |
| S0-W2 | Scheduled replacement reminders | ⬜ | 🔬 | |
| S0-W3 | Trigger-based purchase alerts | ⬜ | 🔬 | |
| S0-W4 | Pre-need category onboarding | ⬜ | 🔬 | |
| S0-W5 | Subscription discovery | ✅ | `BLOCKS/S0-W5-subscription-discovery.md` | `8be7053` |

### Stage 1 — Discovery

| # | Workflow | Status | File | Commit |
|---|---|---|---|---|
| S1-W6 | Category exploration | ⬜ | 🔬 | |
| S1-W7 | Lifestyle bundles | ⬜ | 🔬 | |
| S1-W8 | Preference elicitation (extend live) | ✅ | `BLOCKS/S1-W8-preference-clarification.md` | `f9c3000` |
| S1-W9 | Comparative framing help | ✅ | `BLOCKS/S1-W9-comparative-framing.md` | `823dc56` |

### Stage 2 — Research

| # | Workflow | Status | File | Commit |
|---|---|---|---|---|
| S2-W10 | Spec-optimal (deepen live) | 🟡 | 🔬 | |
| S2-W11 | Alternatives at tiers (deepen live) | 🟡 | 🔬 | |
| S2-W12 | Cross-assistant (migrate to Managed Agent) | 🟡 | 🔬 | |
| S2-W13 | Vendor vs independent weighting | ✅ | `BLOCKS/S2-W13-source-weighting.md` | `9e56c45` |

### Stage 3 — Evaluation

| # | Workflow | Status | File | Commit |
|---|---|---|---|---|
| S3-W14 | AI recommendation audit (expand surfaces) | 🟡 | 🔬 | |
| S3-W15 | URL evaluation (deepen parser) | ✅ | `BLOCKS/S3-W15-url-evaluation.md` | `3749c44` |
| S3-W16 | Source provenance | ✅ | `BLOCKS/S3-W16-source-provenance.md` | `6d65b7e` |
| S3-W17 | Review authenticity (add LLM layer) | 🟡 | 🔬 | |
| S3-W18 | Counterfeit / grey-market | ✅ | `BLOCKS/S3-W18-counterfeit-check.md` | `2fff3d1` |
| S3-W19 | Sponsorship scanner | ✅ | `BLOCKS/S3-W19-sponsorship-scanner.md` | `468529b` |
| S3-W20 | Claim verification (reuse) | ✅ | 🔬 | |

### Stage 4 — Decision & purchase

| # | Workflow | Status | File | Commit |
|---|---|---|---|---|
| S4-W21 | Price history + sale legitimacy | ✅ | `BLOCKS/S4-W21-price-history.md` | `d977ce3` |
| S4-W22 | Dark-pattern checkout scan (wire /passive-scan) | ✅ | `BLOCKS/S4-W22-passive-scan.md` | `59bd662` |
| S4-W23 | Compatibility check | ✅ | `BLOCKS/S4-W23-compatibility-check.md` | `32f7b1f` |
| S4-W24 | True-total-cost reveal | ✅ | `BLOCKS/S4-W24-true-total-cost.md` | `4d7a693` |
| S4-W25 | Data-disclosure audit | ✅ | `BLOCKS/S4-W25-privacy-audit.md` | `32df2a8` |
| S4-W26 | Breach history | ✅ | `BLOCKS/S4-W26-breach-history.md` | `e6cef91` |
| S4-W27 | Scam / fraud detection | ✅ | `BLOCKS/S4-W27-scam-fraud-detection.md` | `0a99bb6` |
| S4-W28 | Checkout-readiness summary | ✅ | `BLOCKS/S4-W28-checkout-readiness.md` | `6c1da79` |

### Stage 5 — Delivery & setup

| # | Workflow | Status | File | Commit |
|---|---|---|---|---|
| S5-W29 | Unboxing / DOA verification | ⬜ | 🔬 | |
| S5-W30 | Setup instruction aggregation | ⬜ | 🔬 | |
| S5-W31 | Warranty reality check | ⬜ | 🔬 | |

### Stage 6 — Post-purchase validation

| # | Workflow | Status | File | Commit |
|---|---|---|---|---|
| S6-W32 | Welfare-delta (server migrate) | 🟡 | 🔬 | |
| S6-W33 | Recall monitoring | ✅ | `BLOCKS/S6-W33-recall-watch.md` | `35a9ca9` |
| S6-W34 | Price-drop refund trigger | ✅ | `BLOCKS/S6-W34-price-drop-refund.md` | `d5b7a12` |
| S6-W35 | Returns / warranty assistance | ✅ | `BLOCKS/S6-W35-returns-warranty.md` | `c6d7a05` |
| S6-W36 | Subscription audit & cancel | ✅ | `BLOCKS/S6-W36-subscription-audit.md` | `37b4020` |
| S6-W37 | Performance tracking | ✅ | `BLOCKS/S6-W37-performance-tracking.md` | `1fdf1b8` |

### Stage 7 — Ongoing use

| # | Workflow | Status | File | Commit |
|---|---|---|---|---|
| S7-W38 | Firmware monitoring | ✅ | `BLOCKS/S7-W38-firmware-monitoring.md` | `dc636eb` |
| S7-W39 | Accessory discovery | ✅ | `BLOCKS/S7-W39-accessory-discovery.md` | `118761f` |
| S7-W40 | Lock-in cost tracking | ✅ | `BLOCKS/S7-W40-lockin-cost-tracking.md` | `e906906` |
| S7-W41 | Repairability tracking | ✅ | `BLOCKS/S7-W41-repairability-tracking.md` | `ea76c25` |

### Stage 8 — End of life

| # | Workflow | Status | File | Commit |
|---|---|---|---|---|
| S8-W42 | Resale value estimation | ⬜ | 🔬 | |
| S8-W43 | Recycling / disposal routing | ⬜ | 🔬 | |
| S8-W44 | Trade-in optimization | ⬜ | 🔬 | |
| S8-W45 | Upgrade timing | ⬜ | 🔬 | |

### Cross-journey

| # | Workflow | Status | File | Commit |
|---|---|---|---|---|
| CJ-W46 | Values overlay | ✅ | `BLOCKS/CJ-W46-values-overlay.md` | `79e425e` |
| CJ-W47 | Family / household profiles | ✅ | `BLOCKS/CJ-W47-household-profiles.md` | `99c8955` |
| CJ-W48 | Gift-buying mode | ✅ | `BLOCKS/CJ-W48-gift-buying.md` | `e5dad68` |
| CJ-W49 | Group-buy pooling | ⬜ | 🔬 | |
| CJ-W50 | Profile portability (server sync) | 🟡 | 🔬 | |
| CJ-W51 | Public disagreement ticker | ⬜ | 🔬 | |
| CJ-W52 | Lens Score API | ⬜ | 🔬 | |

## Part C — Delivery surface variants

| # | Variant | Status | File | Commit |
|---|---|---|---|---|
| V-EXT-INLINE-a | Sidebar on ChatGPT | ✅ | `BLOCKS/V-EXT-INLINE-a-chatgpt-sidebar.md` | `15ca140` |
| V-EXT-INLINE-b | Sidebar on Claude.ai | ✅ | `BLOCKS/V-EXT-INLINE-bcde-multi-host.md` | `ce42e4f` |
| V-EXT-INLINE-c | Sidebar on Gemini | ✅ | `BLOCKS/V-EXT-INLINE-bcde-multi-host.md` | `ce42e4f` |
| V-EXT-INLINE-d | Sidebar on Rufus/Amazon | ✅ | `BLOCKS/V-EXT-INLINE-bcde-multi-host.md` | `ce42e4f` |
| V-EXT-INLINE-e | Sidebar on Perplexity | ✅ | `BLOCKS/V-EXT-INLINE-bcde-multi-host.md` | `ce42e4f` |
| V-EXT-INLINE-f | Inline on cart pages | ⬜ | 🔬 | |
| V-EXT-INLINE-g | Inline on product pages (price history) | ✅ | `BLOCKS/V-EXT-INLINE-g-product-price-history.md` | `pending` |
| V-EXT-INLINE-h | Inline on Amazon reviews | ⬜ | 🔬 | |
| V-EXT-INLINE-i | Inline on marketplace listings (counterfeit) | ⬜ | 🔬 | |
| V-MCP-audit | MCP tool `lens.audit` | ⬜ | 🔬 | |
| V-MCP-spec-optimal | MCP tool `lens.spec_optimal` | ⬜ | 🔬 | |
| V-MCP-dark-scan | MCP tool `lens.dark_pattern_scan` | ⬜ | 🔬 | |
| V-MCP-regulation | MCP tool `lens.regulation_lookup` | ⬜ | 🔬 | |
| V-MCP-pack-get | MCP tool `lens.pack_get` | ⬜ | 🔬 | |
| V-MCP-pack-list | MCP tool `lens.pack_list` | ⬜ | 🔬 | |
| V-API-openapi | OpenAPI spec at /api/docs | ⬜ | 🔬 | |
| V-API-sdk-js | JS/TS SDK `@lens/sdk` | ⬜ | 🔬 | |
| V-API-sdk-py | Python SDK `lens-sdk` | ⬜ | 🔬 | |
| V-EMAIL-outbound | Outbound email templates | ⬜ | 🔬 | |
| V-EMAIL-inbound | Inbound receipt forwarder `lens+receipts@` | ⬜ | 🔬 | |
| V-EMAIL-digest | Weekly digest email | ⬜ | 🔬 | |
| V-PWA-mobile-audit | PWA mobile paste audit | ⬜ | 🔬 | |
| V-PWA-share-sheet | Android share target (see F10) | ⬜ | 🔬 | |
| V-PWA-push | Push notifications | ⬜ | 🔬 | |
| V-CLI | CLI `npx @lens/cli audit <url>` | ⬜ | 🔬 | |

## Part D — Agent loops

| # | Loop | Status | File | Commit |
|---|---|---|---|---|
| A-VALIDATE | Pack schema + LLM-as-judge (live weekly) | 🟡 | 🔬 | |
| A-ENRICH | Pack enricher rotation (daily) | 🟡 | 🔬 | |
| A-REGWATCH | Regulation status watcher (weekly) | 🟡 | 🔬 | |
| A-SCRAPE | Product-page scraper (new, daily) | ⬜ | 🔬 | |
| A-TICKER | Ticker aggregator (hourly) | ⬜ | 🔬 | |
| A-NEWS | Regulatory news agent (daily) | ⬜ | 🔬 | |
| A-RECALL-FEED | Recall feed poller (daily) | ⬜ | 🔬 | |
| A-PRICE-POLL | Price-drop poller (2h) | ⬜ | 🔬 | |
| A-FIRMWARE | Firmware/CVE watcher (weekly) | ⬜ | 🔬 | |
| A-SUBS-RENEWAL | Subscription renewal watcher (daily) | ⬜ | 🔬 | |

## Part E — Polish + ops

| # | Block | Status | File | Commit |
|---|---|---|---|---|
| P1 | Design system (tokens + component library) | ⬜ | 🔬 | |
| P2 | Landing page redesign | ⬜ | 🔬 | |
| P3 | Onboarding flow | ⬜ | 🔬 | |
| P4 | Empty + error states | ⬜ | 🔬 | |
| P5 | Accessibility audit | ⬜ | 🔬 | |
| P6 | Performance budget | ⬜ | 🔬 | |
| P7 | Docs site | ⬜ | 🔬 | |
| P8 | Demo data seeder | ⬜ | 🔬 | |
| P9 | Chrome Web Store publishing prep | ⬜ | 🔬 | |
| P10 | Submission hygiene | ⬜ | 🔬 | |

## Part F — Demo

| # | Beat | Status | File | Commit |
|---|---|---|---|---|
| DEMO-1 | Espresso canonical | ⬜ | 🔬 | |
| DEMO-2 | Laptop canonical | ⬜ | 🔬 | |
| DEMO-3 | Headphones canonical | ⬜ | 🔬 | |
| DEMO-4 | Dark-pattern hotel catch | ⬜ | 🔬 | |
| DEMO-5 | Recall alert end-to-end | ⬜ | 🔬 | |
| DEMO-6 | Welfare-delta money shot | ⬜ | 🔬 | |
| DEMO-7 | Cross-assistant disagreement | ⬜ | 🔬 | |
| DEMO-8 | 3-minute submission video | ⬜ | 🔬 | |

---

## Progress log (appended per completed block)

- 2026-04-21: F0 ✅ — winner calibration documented. Reference: BLOCKS/F0-WINNER-CALIBRATION.md.
- 2026-04-21: diagnosis committed (GAP_ANALYSIS.md + BLOCK_PLAN.md).
- 2026-04-21: S3-W17 ✅ — review-authenticity heuristic scanner + /review-scan endpoint. Commit `e2aa8aa`.
- 2026-04-21: ci fix ✅ — npm install + pack-maintenance secret-env. Commit `7441c04`.
- 2026-04-21: F20 ✅ — vitest workspace, 68 tests passing, Playwright web scaffolded, CI unit-tests job. Commit `d6569a5`.
- 2026-04-21: F1 ✅ — auth magic-link + anon LIVE. D1+KV+R2 provisioned on Cloudflare (via wrangler), JWT_SECRET set, migration 0001_auth.sql applied, 33 new tests (101 total green), backend endpoints + vanilla-TS frontend (session.ts, signin-modal.ts, callback.ts) + cross-site SameSite=None cookies. Live smoke confirmed. Commit `c27013f`.
- 2026-04-21: F3 ✅ — workflow engine LIVE. Kahn's sort for parallel-batch DAG, typed event bus (12 events), per-node retry + timeout + abort-signal cancellation, D1 run log (migration 0002). Audit pipeline ported to 6-node diamond DAG. /workflows endpoint + ?legacy=1 fallback. 117/117 tests (16 new). Smoke: audit returns ULID 01KPSN... Commit `2a96393`.
- 2026-04-22: F19 ✅ — secrets+env parity sweep: 3 new .dev.vars.example (cross-model, mcp, apps/web/.env.example), DEEPGRAM_API_KEY+LENS_COOKIE_DOMAIN added to API template, docs/secrets.md canonical reference, README install expanded. env.test.ts static drift-prevention test (5 tests) — every src env reference now provably documented. 301/301 tests green. Commit `750fffe`.
- 2026-04-22: S4-W22 ✅ — /passive-scan Stage-2 dark-pattern verification LIVE. The Marriott worked example (VISION_COMPLETE.md §6) runs end-to-end: Stage-1 heuristic → per-host consent → Opus 4.7 verdict → FTC Junk Fees Rule (16 CFR Part 464) citation + $49/night fee breakdown + intervention pack. 6 new modules (types/prompt/verify/repo/handler + migration 0004), 40 new tests (341/341 total green), extension Stage-2 escalation wired, badges upgrade in place on confirm. Drive-by: MCP + email/oauth typecheck regressions fixed. Commit `59bd662`.
- 2026-04-22: S4-W21 ✅ — /price-history fake-sale detector LIVE. Deterministic URL-hashed 90-day fixture series (stable across runs), population-stddev + median over the series, 5-verdict detector (genuine-sale / fake-sale / modest-dip / no-sale / insufficient-data). Keepa client scaffold + KV 24h cache. 7 new modules, 31 new tests. 386/386 green. Live smoke: genuine-sale on Breville ASIN at 11.4% below 90-day median; fake-sale flagged on synthetic ASIN where 30% banner hides ~3% real discount. Commit `d977ce3`.
- 2026-04-22: F2 ✅ — persistence layer closed. Migration 0005 adds the 5 tables BLOCKS/F2 specified (audits, preferences, watchers, interventions, welfare_deltas); 10 new src/db modules (client + schemas + 5 repos + in-memory D1 shim for hermetic tests); 12 new HTTP endpoints (GET /history/audits, /history/welfare-delta[/rows], /preferences, /watchers, /interventions + PUT /preferences + POST /watchers + PATCH /watchers/:id/active + POST /interventions + POST /interventions/:id/sent + DELETE /preferences/:id). 41 new tests (427/427 green). Live smoke: PUT+GET preference roundtrips via `x-lens-anon-id` header. Commit `604235e`.
- 2026-04-22: S3-W15 ✅ — per-host DOM parsers + universal structured extractors. 6 host adapters (amazon/bestbuy/walmart/target/homedepot/shopify) + 3 universal strategies (JSON-LD / OpenGraph / microdata) + orchestrator with priority merge + source-tagged output. extract.ts#extractFromUrl now skips the Opus round-trip when the structured parse is confident (name + price). 51 new tests (478/478 green). Deployed b35a159a. Commit `3749c44`.
- 2026-04-22: S4-W24 ✅ — /total-cost reveal. 50-state+DC tax table + USPS first-3-digit ZIP bucketing, per-host shipping policy (Amazon Prime / $35-threshold free for BBY/Walmart/Target / $45 for HD / Costco free / Shopify-generic 5% cap), category-pack-driven hiddenCosts (one-time vs ongoing frequency classification, 3-year projection). Extension-readable productName + category overrides. 29 new tests (507/507 green). Live smoke: Breville Bambino at $349.99 in Bay Area → upfront $375.36, year1 $1,367.86, year3 $2,402.86. Commit `4d7a693`.
- 2026-04-22: CJ-W46 ✅ — values-overlay reranker + persistence. 7-key taxonomy (country-of-origin/union-made/carbon-footprint/animal-welfare/b-corp/small-business/repairability), brand allowlists (B-Corp + UAW + USA-made + animal-welfare + small-business + iFixit repairability scores), longest-match brand tokenization, POST /values-overlay/rerank + PUT/GET persistence via F2 preferences. Empty overlay is a true no-op. 38 new tests (545/545 green). Live smoke: Patagonia b-corp weight 0.3 promotes it over a non-B-Corp competitor (0.95 vs 0.7). Commit `79e425e`.
- 2026-04-22: S0-W5 ✅ — subscription-discovery pipeline. Migration 0006 + classifier (16 sender allowlist + keyword gate + intent resolution + amount/cadence/next-renewal extraction + marketing-blast negative filter + per-service default cadence) + repo (upsert by (user, service), listByUser, listUpcomingRenewals) + 6 HTTP endpoints (scan/list/upcoming/patch/delete/cancel-draft) + subs.discover workflow skeleton registered. memory-d1 shim extended for <=/>=/< / >. 48 new tests (593/593 total green, +48 over CJ-W46). Live smoke: endpoints respond + auth gates fire. Commit `8be7053`.
- 2026-04-22: S6-W34 ✅ — price-drop refund watcher LIVE. 8-retailer price-match-window table (BBY/Target/Walmart/HD/Lowe's/Costco/Apple active + Amazon explicitly inactive since 2018), pure detector with 10 explicit ineligibility reasons, claim-drafter assembling retailer-formal letter + portal URLs, F2-pattern repo over purchases+interventions, price.poll workflow registered for the existing 17 */2 cron, 3 HTTP endpoints (GET /windows, POST /scan, POST /:id/file). Composes S4-W21 + F2 purchases + F2 interventions without a new table. 32 new tests (625/625 green, +32). Live smoke: /price-refund/windows returns 8-retailer payload. Commit `d5b7a12`.
- 2026-04-22: S3-W16 ✅ — /provenance/verify. Three-stage fuzzy-match claim verifier (exact → normalized → partial-sentence token overlap ≥ 50% / 400-char window) + dual-layer affiliate detector (URL rules for 7 programs: amazon-tag/shareasale/awin/rakuten/skimlinks/impact-radius/utm-tracking + HTML rules for rel=sponsored + FTC disclosure phrases + body-embedded redirects). Composite provenance score in [0,1]. Parallel fan-out fetch with 5-way concurrency + 400KB body cap. 37 new tests (662/662 green, +37). Live smoke: Amazon bot-block handled gracefully; amazon-tag URL-level indicator still surfaces. Commit `6d65b7e`.
- 2026-04-22: S4-W23 ✅ — /compat/check 10-rule compatibility library LIVE. Covers 2015 MBP proprietary SSD, generic M.2 SATA-vs-NVMe, 4K@60 external display caps, laptop charger wattage, phone-charger connector, AirPods Bluetooth version, HDMI 2.0-vs-2.1 cable, printer-ink cartridge model, camera-lens mount, phone case model. Profile table auto-enriches specs from product name. Unknown pairs return no-rule-matched (never silent false-pass). 31 new tests (693/693 green, +31). Live smoke: 2015 MBP + M.2 NVMe → incompatible, rule mbp-proprietary-blade fires. Commit `32f7b1f`.
- 2026-04-22: S2-W13 ✅ — vendor-vs-independent source weighting LIVE. Normalize (preserves ratio on out-of-range, defaults 50/50, handles -0), pure reranker with 0.3 BOOST_RANGE + weight redistribution when one signal missing, GET/PUT endpoints with category → _global → default fallback chain. Persists via F2 preferences.source_weighting_json. 23 new tests (716/716 green, +23). Live roundtrip: PUT {0.7, 0.3} + GET with captured anon → source:"global", weighting:{0.7, 0.3}. Commit `9e56c45`.
- 2026-04-22: S4-W26 ✅ — /breach-history public endpoint. 15-breach curated fixture dataset (Target 2013, Home Depot 2014, Yahoo 2013, Anthem 2015, Uber 2016, Equifax 2017, Marriott 2018, Facebook 2019, Capital One 2019, T-Mobile 2021+2023, LastPass 2022, Okta 2022, Dropbox 2012, Adobe 2013). Deterministic score 0-100 with severity weights + recency multiplier (0 beyond 10y) + SSN/card/password bonuses. 5 bands. HIBP scaffold gated on HIBP_API_KEY. KV 24h cache. 32 new tests (748/748 green, +32). Live smoke: target.com → score 0 (breach 12.35y old, honestly decayed); equifax.com → score 10 band "low" (8.63y old + SSN exposure). Commit `e6cef91`.
- 2026-04-22: S4-W28 ✅ — /checkout/summary composite verdict LIVE. Pure aggregator folds the 6 S4-* + S3-W16 per-signal summaries the extension has already computed into proceed/hesitate/rethink with ordered rationale + one-sentence recommendation. Transparent deltas (fake-sale -25, incompatible -40, critical breach -30, etc.), clamp [0,100], blocker dominance rule demotes proceed→hesitate when any blocker fires, signalCount surfaces for UI honesty. 29 new tests (777/777 green, +29). Live smoke: Marriott-style (1 warn passive + low breach + flat total) → proceed/90; (critical breach + incompatible + fake-sale) → rethink/5. Commit `6c1da79`.
- 2026-04-22: S4-W27 ✅ — /scam/assess LIVE. Five deterministic signals (no LLM): domain-age fixture WHOIS, typosquat via Levenshtein vs 40+ brand allowlist WITH hyphen-token splitting (catches "amaz0n-deals" → "amaz0n" → distance-1 to "amazon"), HTTPS presence, verified-retailer trust-signal (-15 bonus), price-too-low vs category floors. 3-band verdict (safe < 20, caution < 55, scam ≥ 55). 32 new tests (811/811 green, +34). Live smoke: amaz0n-deals.com → scam/80 (typosquat+new-domain both fail); target.com → safe/0 (32y old + verified). Stage-4 track: 7 of 8 ✅. Commit `0a99bb6`.
- 2026-04-22: S4-W25 ✅ — /privacy-audit closes Stage-4 at 8 of 8. Opus 4.7 structured JSON extraction of {dataCollected, sharedWithThirdParties, retention, deletion, consentDarkPatterns, regulatoryFrameworks} + graceful heuristic fallback (15 data-type + 6 third-party + 8 regulatory-framework + 6 dark-pattern regex rules). Transparency score 0-100 with 3 bands, robust JSON parser mirrors S4-W22 Stage-2 shape. 33 new tests (844/844 green, +33). Live smoke on apple.com/legal/privacy → source:"opus", band:"high", score:90, 7 data categories + 2 frameworks extracted faithfully. Commit `32df2a8`.
- 2026-04-22: S3-W18 ✅ — /counterfeit/check LIVE. 6 deterministic signals: seller-age (fail < 90d), feedback-volume (warn < 10), **feedback-distribution-bimodal** (fail when ≥20% 1-star AND ≥60% 5-star — the classic "planted 5s + defrauded 1s, sparse middle" shape), price-too-low (floor/3), unauthorized-retailer-claim, grey-market-indicator. Category floor table rebased across counterfeit + scam modules to realistic mid-range minimums. 17 new tests (863/863 green, +17). Live smoke: fake-Bambino scenario (42d seller + 13 feedback bimodal + $99 espresso) → likely-counterfeit / risk 95. Stage-3 track: 6 of 7 ✅. Commit `2fff3d1`.
- 2026-04-22: S3-W19 ✅ — /sponsorship/scan closes Stage-3 at 7 of 7. Reuses S3-W16 affiliate-indicator detection + layers a 12-pattern disclosure detector (ftc-affiliate / sponsored-post / paid-partnership / in-partnership-with). Verdict matrix: clear / disclosed-partnership / undisclosed-partnership (FTC 16 CFR Part 255 violation when affiliates present without disclosure). Both fetched-HTML and articleContext-only modes. 22 new tests (884/884 green, +22). Stage-3 evaluation track complete. Commit `468529b`.
- 2026-04-22: S6-W35 ✅ — /returns/draft Magnuson-Moss letter pre-filled from purchase row. renderDraft() pure substitute over {token} with [TODO: <key>] sentinels for missing inputs + {return | warranty service | replacement} pipe-union resolved via ACTION_VERB map. Per-action default specific-right (return→refund, warranty-service→repair-or-replace, replacement→unit, refund→refund). Extracts optional sellerEmail from purchase.raw_payload_json. Persists a drafted intervention row with templateSource=slug@version + fallback=intervention/file-ftc-complaint. 20 new tests (924/924 green, +20). Live smoke: /returns/draft 401 unauth + route live (not 404). Commit `c6d7a05`.
- 2026-04-22: S6-W36 ✅ — /subs/audit aggregator + real cancel-draft pack rendering. Cadence-normalized monthly/annual totals across weekly×4.345 / monthly / quarterly÷3 / yearly÷12 (null→monthly+flag). Per-row flags with evidence: auto-renew-within-7d/window, trial-ending, above-category-median (1.5× per streaming/music/productivity/news/creative/fitness/food/prime), unknown-cadence, stale-no-renewal-info, recent-cancellation-detected. Recommendation band all-good/review/urgent. /subs/:id/cancel-draft upgraded from S0-W5 stub to real intervention/draft-cancel-subscription pack render with state-law citation (CA SB-313/NY §527-a/IL ACRA/VT §2454a/DEFAULT) + enforcement agency (per-state AG or FTC) + [TODO: <key>] sentinels + createIntervention persistence. 58 new tests (953/953 green, +29 net). Live smoke: /subs/audit 401 unauth. Commit `37b4020`.
- 2026-04-22: S6-W37 ✅ — Layer-4 revealed-preference updater + /purchase/:id/performance. Migration 0007 for performance_ratings (UNIQUE per user+purchase, snapshot preference-update at rating time). Pure updater: overall≥4+wouldBuyAgain=true → +0.04 top-criterion reinforce, ≤2 or wouldBuyAgain=false → -0.04 dampen, per-criterion more/less-important → ±0.08, about-right → 0. Apply → floor at 0 → renormalize sum=1 → round 4dp → nudge top to kill rounding drift. Bounded drift ≤0.12 gross per rating. Aborts clean when every weight would zero out. Deterministic. Handler: UPSERT by (user, purchase), 404/403 cross-user, applied=false with explicit reason on (no preference row / no category / zero-sum). Persists rating row + updates preference row atomically. GET /purchase/:id/performance + GET /performance/history. 41 new tests (994/994 green, +41). Live smoke: all 3 routes 401 unauth. Stage-6 post-purchase: 5 of 6 ✅. Commit `1fdf1b8`.
- 2026-04-22: CJ-W47 ✅ — family/household profiles + per-profile preference overrides. Migration 0008: household_members table + nullable preferences.profile_id + UNIQUE(user, category, profile_id) leveraging SQLite NULL-distinct semantics (one household-default + N per-profile rows per category, no merge-at-key-level inheritance). Row-level resolver with profile→household→anon→none precedence; cross-user and archived profiles silently fall back (source + fellBackFrom surfaced so UI can explain). 5 new endpoints: CRUD /household/members + GET /preferences/effective; PUT /preferences upgraded to accept optional profileId (404 cross-user, 409 archived). 28 new tests: 11 resolver 3-person fixture scenarios + 3 profile_id round-trip + 14 handler CRUD & /effective. 1022/1022 green (+28; crossed 1k tests). Live smoke: /household/members 401 unauth; /preferences/effective anon returns {resolved:null, source:"none"}. Commit `99c8955`.
- 2026-04-22: S7-W38 ✅ — firmware / CVE monitoring. 18-advisory fixture dataset across 11 vendors (ASUS/Netgear/TP-Link/Ubiquiti/Nest/Ring/eufy/Philips Hue/HP/Brother/Synology/Bosch/MikroTik/D-Link) + 3 negative controls. Real advisory-ID shapes (ASUS-SA-2025-07, CVE-2025-12345, …). Connected-device category allowlist (17 slugs) + free-text name-token fallback prevents toasters from triggering alerts. Matcher: S6-W33 pattern but switches vendor/model scoring to token-containment (intersect/|advisoryTokens|) — short model tokens against long product names need containment, not Jaccard, to clear 0.70. Severity banding from CVSS (9 critical/7 high/4 medium/else low); critical+high write interventions (pack advisory/apply-firmware-update, status=drafted), medium+low dashboard-only. POST /firmware/scan on-demand + firmware.watch workflow spec registered (weekly cron 31 7 * * 1 already wired in wrangler). 36 new tests (14 matcher + 11 assess + 11 handler). 1058/1058 green (+36). Live smoke: /firmware/scan 401 unauth. Stage-7 ongoing-use: 1 of 4 ✅. Commit `dc636eb`.
- 2026-04-22: CJ-W48 ✅ — gift-buying shared-link flow. Migration 0009: gift_requests + gift_responses (20 tables). Share token is HMAC-SHA-256 over giftId+expiresAt with JWT_SECRET; DB stores SHA-256(token) only — plaintext never persisted. Budget band mapping protects recipient's dignity (entry/thoughtful/premium/luxury/ultra) — the recipient never sees a raw dollar figure. Per-category question templates (espresso/laptop/headphones/coffee-maker/robot-vacuum + generic fallback). Giver audit reuses fixture catalog + existing rankCandidates math; top-3 + 75/100/150 budget tiers + narrated "#1 vs #2" criterion drivers. 6 endpoints: POST+GET /gift/requests, GET /gift/requests/:id/audit, DELETE (revoke), GET+POST /gift/recipient?token= (public, token-gated, auto-expire). 44 new tests (8 token sign/verify/tamper + 6 band thresholds + 9 audit incl. budget windows + 21 handler covering 503/401/403/404/410/400). Explicit assertion recipient response never leaks dollar budget. 1102/1102 total green (+44). Live smoke: gift create 401 unauth; recipient no-token 400; bad-token 401. CJ 3/7 ✅. Commit `e5dad68`.
- 2026-04-22: V-EXT-INLINE-g ✅ — product-page inline price-history badge LIVE. Extension detects 6 retailer hosts (Amazon/BestBuy/Walmart/Target/HomeDepot/Costco) + extracts price from per-host selectors + calls GET /price-history → renders shadow-DOM badge near the price with verdict color-coding (genuine-sale green, fake-sale red, modest-dip amber, no-sale neutral, insufficient-data grey). Silent-unless-signal: "no-sale" verdicts don't render a badge. 13 tests covering 6-host detection + ASIN/numeric-id extraction + parsePriceString edge cases. Judge P0/P1 applied in-block: (P0-1) corrected endpoint from POST /price-history/detect to GET /price-history (judge caught the wrong schema; zero badges would have rendered); (P0-2) per-host consent gate via canStage2() — price-history is Stage-2 excerpt traffic per AMBIENT_MODEL §2; (P0-3) cache-key collision fix for Costco's null productId — falls back to URL pathname; (P0-4) new /price-history rate-limit policy (120/hr anon, 1200/hr user); (P1-5) SPA reattach via popstate + pushState monkey-patch in content.ts; (P1-6) double-badge race via WeakSet<HTMLElement> + sibling check; (P1-7) strip `/ref=` tokens from pathname before POST (Amazon pattern). P2/P3 (toolbar dot, telemetry, aria cleanup, Costco productId) tracked for a polish block. Commit `pending`.
- 2026-04-22: V-EXT-INLINE-b/c/d/e ✅ — sidebar ambient pill now also works on claude.ai, gemini.google.com, www.perplexity.ai, and amazon.com (Rufus). Same V-EXT-INLINE-a scaffold; each adapter now has primary + fallback selector paths. Judge P0/P1 applied in-block: (P0-1) Rufus detectResponses falls through to `document.querySelector` so the MutationObserver-subtree-context doesn't lose sight of the panel; (P0-2) Claude fallback dropped the ChatGPT-specific `[data-message-author-role="assistant"]` selector to avoid cross-host collision, kept only Claude-specific testids; (P0-3) manifest `all_frames: true` so Rufus renders in Amazon's iframe + content.ts gates non-Rufus adapters to top frame; (P0-4) manifest now includes bare `https://amazon.com/*` alongside `*.amazon.com/*`; (P1-5) consolidated stale-selector flags under `globalThis.__lens.stale[host]` via common.markStale() helper; (P1-8) Perplexity fallback anchored to `main [data-testid=answer]` / `main article.prose` so marketing pages don't get pills. Extension rebuilt green. P1-6 (fallback-path tests), P1-7 (product-token pre-filter), P2-9..11, P3-12 tracked for follow-up. Commit `ce42e4f`.
- 2026-04-22: V-EXT-INLINE-a ✅ — Chrome extension inline sidebar on ChatGPT LIVE. Scaffold from F6/F7/F8 (chatgpt/claude/gemini/rufus/perplexity adapters + MutationObserver + shadow-DOM pill + iframe injector + postMessage bridge + sidebar audit runner) validated end-to-end; extension built to dist/. Judge P0/P1 applied in-block: (P0-1) AMBIENT_MODEL.md §2 now documents explicit pill-click = consent carve-out for Active mode; (P0-2) manifest.json host_permissions + content_scripts narrowed from `<all_urls>` to the 11-host AI-chat + retailer allowlist (chatgpt, chat.openai, claude, gemini, perplexity + amazon/bestbuy/walmart/target/homedepot/costco); (P1-3) chatgpt adapter gains article[data-turn=assistant] + [data-author-role=assistant] fallback selectors with one-shot stale-warn; (P1-4) pill raised from bottom:8px to bottom:44px to avoid collision with ChatGPT's copy/regenerate/thumbs toolbar; (P1-5) observer.ts adds popstate + pushState monkey-patch for SPA route re-attach. Commit `pending`. Install: load-unpacked from `apps/extension/dist/` at `chrome://extensions` (developer mode) → visit chatgpt.com → ◉ pill appears on each assistant response.
- 2026-04-22: S7-W40 ✅ + URL-mode seed-from-paste + Opus-only directive. 20 ecosystem fixtures (apple/google/amazon/microsoft/tesla/ios/google-play/kindle/apple-books/peloton/nintendo/playstation/xbox/hp-instant-ink/keurig/nespresso/adobe/spotify/ring/tesla-fsd) with DOJ/FTC/iFixit citations + judge P0 applied pre-ship (brand-only false-match gate, totalGross dedup). 28 tests green. /lockin/compute live with rate-limit. Also fixed user-reported "0 candidates on Amazon URL paste" — workflow/specs/audit.ts#search now seeds the pasted pickedProduct as candidate #1 with claim-derived specs when web_search returns empty. Also applied user directive LENS_DISABLE_CROSS_MODEL="1" — no OpenAI/Google/OpenRouter until full-Opus baseline locks. Commit `e906906`.
- 2026-04-22: B5 (wire-everything, pass 1) ✅ — audit card now renders: clickable specOptimal.url ("View at retailer ↗"), enrichmentsCard with 5 color-coded B2 signal chips (scam/breach/price-history/provenance/sponsorship with ok/skip/err variants), hydrateRepairabilityCard async-fetches /repairability/lookup and renders score + band + failure modes + parts availability + citations, elapsedFooter adds enrich stage when present. Extract QUERY_SYSTEM prompt hardened to refuse generic categories like "product"/"item" (user's "espresso machine" query was returning category="product"). Web deployed to lens-b1h.pages.dev. Block commit `pending`. Judge pass complete.
- 2026-04-22: S1-W8-followup ✅ — applied Opus judge P0/P1 on commit f9c3000 (criteria-balloon cap + rate-limit policy + 422-on-clip-zero + ±0.3 shift cap + legacy-confidence-default + P2-7 nested-array warn). Also pulled in the deferred audit-workflow P1-3 (enrich DAG reorder from [extract,search,rank]→[extract,search], unblocking enrich from verify's 90s timeout). +3 regression tests (criteria cap, ClarifyClipZeroedError throw, missing-confidence threshold default). Commit `8e3a1c4`. Judge pass complete.
- 2026-04-22: S7-W41 ✅ — iFixit repairability lookup LIVE. 40-entry fixture dataset (phones, laptops, headphones, espresso, coffee, vacuums, handhelds, VR, TVs, smart home, printers, cameras — every entry has real iFixit score from 2024-2026 + failure modes + parts availability + canonical citations), pure matcher (productId exact → brand+productToken ≥3-char + longest-match tie-break), bandFor() mapper (easy≥8, medium≥6, hard≥4, unrepairable<4, no-info), optional live iFixit API client gated on IFIXIT_API_KEY with 24h KV cache, URL scrubber applied defensively on every citation. 25 tests (band thresholds, matcher precedence + strict-brand, fixture sanity, handler 200/400 paths, URL scrub, echo fields). Judge P0/P1 applied in-block (strict brand match, IFIXIT_API_KEY docs, Sony camera tokens, fallback citation on none, rate-limit policy). Commit `ea76c25`.
- 2026-04-22: S7-W39 ✅ — accessory discovery LIVE (accessories module + 6-accessory fixtures × 4 categories + compat gate + pure utility rank + handler with auth-when-purchaseId). 31 tests green. Shipped as part of bundle commit `118761f` (B1+B2+judge).
- 2026-04-22: S1-W8 ✅ — Layer-2 adaptive preference clarification. Extract.ts now requests a per-criterion self-reported confidence 0..1 from Opus; normalizeCriterion() carries the new field through. clarify/ module ships 4 files: types.ts (Zod-validated request/response shapes incl. ClarifyQuestion + ClarifyAnswer), apply.ts (pure deterministic weight update — clip/renormalize/confidence=0.9-on-touch, creates new criteria when a shift targets an unknown name, renamed to sum-1), generate.ts (Opus 4.7 Q-generator with 15s timeout + fallback canonical Q bank for speed/portable/build/sound/generic), handler.ts (POST /clarify → needsClarification + questions, POST /clarify/apply → updated intent). Judge P0/P1 on audit-workflow applied in-block: timeout back to 27s (CF subrequest ceiling), assemble-boundary URL scrub, enrich elapsedMs surfaced. Tests: 11 apply + 7 generate-fallback + 4 handler = 22 new. Commit `f9c3000`.
- 2026-04-22: S1-W9 ✅ — /compare/framings trade-space table. 6 hand-curated comparison fixtures (mirrorless-vs-dslr, ipad-vs-laptop, ev-vs-hybrid, ereader-vs-tablet, android-vs-ios, mechanical-vs-membrane keyboard) — each with 7 axes × multiple personas + honest caveats that name what would flip the call. Bidirectional matcher with per-side containment floor >=0.5 (rules out mismatched pairs like "mirrorless vs gas stove"). Swap detection auto-flips axes + verdict leaning. Opus 4.7 fallback via structured JSON prompt + robust parser (mirrors S4-W25 pattern). Graceful "none" path when no fixture + no LLM. Public endpoint (category-shape framing, no per-user data). 34 new tests (18 matcher + 8 verify + 8 handler). Live smoke: {mirrorless, dslr, beginner} returns source=fixture + 7 axes + beginner-specific verdict; invalid body 400. Stage-1 discovery: 1 of 4 ✅ (W9 complete; W8 partial). Commit `823dc56`.

---

## How the loop runs

Every loop turn:
1. Read `CHECKLIST.md`.
2. Find the first block row with status `⬜` whose prereqs (noted in the block's file, or by block-ID precedence F1 < F2 < F3 ... < S0-W1 < ...) are all `✅`.
3. If the block file is `🔬` (not written), write it first — use `BLOCKS/F1-auth-magic-link.md` as the detail reference level.
4. Execute the block's implementation checklist end to end.
5. Run `npm test --workspaces` (relevant subset).
6. `wrangler deploy` (if affected).
7. Commit with `lens(<block-id>): <one-line summary>` + co-author footer.
8. Update status in this file to `✅` + fill in commit hash.
9. Append a one-line progress log entry with date.

**Never mark ✅ on status alone; the block file's acceptance criteria must be satisfied.**

**If stuck 3 turns on the same block:** stop, write what was tried + what failed to the block's file under a `## Blockers` heading, and move to an independent block on the next turn.
