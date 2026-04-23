# Lens — Improvement Plan v2 (2026-04-22)

**Supersedes:** `IMPROVEMENT_PLAN.md` (kept for history)
**Scope lock-in (user mandate, 2026-04-22):**
1. Real data backbone — triangulated from 17+ public + paid sources. Millions of SKUs. 300+ categories. Fuzzy search. Continuous monitoring crons.
2. Three surfaces, not one — ACTIVE audit (paste/query) + PASSIVE protection (retailer overlay) + BACKGROUND monitoring (post-purchase crons).
3. Every claim on Lens derives from ≥2 independent sources with confidence + timestamp.
4. **The landing page is the product reveal.** It must show: the full data spine, the schema, all source pipelines, the agent scaffolding, live ingestion counts, running crons, and the triangulation evidence. Transparency IS the brand. No marketing lies. No "coming soon."
5. Everything open source under MIT. No affiliate links. No ranking bias. Period.

**Deadline:** 2026-04-26 8PM EDT (≈4 days from now).
**Execution contract:** LOOP_DISCIPLINE.md applies per item. Block file → impl → tests → deploy → commit → judge pass → verify via browser-harness on live site → ✅.

---

## Architecture at a glance

```
                        ┌───────────────────────────────────────┐
                        │   DATA SPINE (Phase A, triangulated)  │
                        │   every fact ≥ 2 sources, timestamped │
                        └─┬─────────────────────────────────┬───┘
                          │                                 │
   ┌──────────┬───────────┴──────────┬──────────────────────┴────┐
   ▼          ▼                      ▼                           ▼
  ACTIVE    PASSIVE              BACKGROUND                  DEVELOPER
  (Phase D) (Phase B)            (Phase C)                   (Phase E)
```

- **Data spine** = `sku_catalog` + `sku_source_link` + `recalls` + `price_history` + `firmware_advisories` + `regulations` + `category_taxonomy` + `triangulated_facts` + `discrepancy_log` + `ingestion_runs` + brand registries + FTS5 fuzzy-search indexes.
- **ACTIVE** = the chat/paste/URL interface. When a user comes TO Lens.
- **PASSIVE** = the Chrome extension. When the user is ON retailer sites. Dark pattern badges, price-history inline, counterfeit flags, review-authenticity, hidden-cost reveal, checkout-readiness, breach badge — all rendering from the data spine.
- **BACKGROUND** = Cloudflare Crons. When the user is not looking. Recall match, price-drop, subscription renewals, firmware/CVE, weekly digest.
- **DEVELOPER** = MCP, public API, Lens Score embed, SDK.

---

## Phase A — DATA SPINE

Goal: replace the 27s live `web_search` path with a triangulated pre-indexed catalog that can answer any spec/price/recall query in <50ms.

### Data sources (17+ pipelines)

| # | Source | Type | Scale | Refresh | Status |
|---|---|---|---|---|---|
| A-S1 | FCC Equipment Authorization | government | ~3M wireless devices | daily | ⬜ |
| A-S2 | EPA Energy Star | government | ~500K products + specs | weekly | ⬜ |
| A-S3 | EPA fueleconomy.gov | government | ~40K vehicles + MPG | monthly | ⬜ |
| A-S4 | CPSC recalls | government | ~15K active + history | daily RSS | ⬜ |
| A-S5 | NHTSA recalls + TSBs | government | ~100K records | daily | ⬜ |
| A-S6 | FDA device recalls + 510(k) | government | ~500K devices | daily | ⬜ |
| A-S7 | USDA Branded Foods DB | government | ~1M food products | monthly | ⬜ |
| A-S8 | Federal Register consumer-rules | government | live | daily | ⬜ |
| A-S9 | OpenFoodFacts | open data | ~3M food products | live API | ⬜ |
| A-S10 | OpenBeautyFacts | open data | ~50K cosmetics | live API | ⬜ |
| A-S11 | Wikidata (Product class + subclasses) | open data | ~500K products + specs | weekly SPARQL | ⬜ |
| A-S12 | UNSPSC taxonomy | open data | ~80K categories | one-time | ⬜ |
| A-S13 | Amazon browse tree sitemap | retailer | ~20K nodes + category SKUs | weekly | ⬜ |
| A-S14 | BestBuy / Walmart / Target / Costco / HomeDepot sitemap.xml | retailer | ~1M+ SKUs | weekly | ⬜ |
| A-S15 | Manufacturer sitemaps (~30 brands: Sony, Apple, Samsung, LG, Breville, Dyson, De'Longhi, Bose, Sennheiser, Lenovo, Dell, HP, Microsoft, Google, Nvidia, AMD, Intel, Logitech, Anker, etc.) | manufacturer | ~100K products | weekly | ⬜ |
| A-S16 | Keepa | paid API | 90+ day real price history | hourly (top 100K SKUs) | ⬜ (needs key) |
| A-S17 | HIBP | paid API | ~15K breached sites | weekly | ⬜ (needs key) |
| A-S18 | iFixit | paid API | ~40K repairability scores | weekly | ⬜ (needs key) |
| A-S19 | Reddit (r/reviews, r/BuyItForLife subs) | open API | live reviews | daily | ⬜ |
| A-S20 | Trustpilot public pages | scrape | live merchant reputation | weekly | ⬜ |
| A-S21 | FTC enforcement actions | government | live settlements | weekly | ⬜ |

### Schema (migration 0010_ground_truth.sql)

Core tables — every SKU = N source rows + 1 triangulated row.

```sql
category_taxonomy      (code, parent_code, level, name, aliases_json, source)     -- UNSPSC + Amazon
brand_index            (slug, name, aliases_json, domain, country, is_authorized_dealer_source_url)
data_source            (id, name, type, base_url, auth, status, last_run_at, docs_url)
ingestion_run          (id, source_id, started_at, finished_at, status, rows_upserted, error_count, log)
sku_catalog            (id, canonical_name, brand_slug, model_code, gtin, upc, ean, asin, fcc_id,
                        category_code, summary, image_url, first_seen_at, last_refreshed_at,
                        status, retired_reason)
sku_source_link        (sku_id, source_id, external_id, external_url, specs_json, price_cents,
                        currency, observed_at, confidence, active)
sku_spec               (sku_id, key, value_text, value_num, unit, source_id, confidence, observed_at)
triangulated_price     (sku_id, currency, median_cents, p25_cents, p75_cents, n_sources, observed_at)
price_history          (sku_id, source_id, observed_at, price_cents, currency, on_sale, sale_pct)
discrepancy_log        (sku_id, field, source_a, source_b, value_a, value_b, delta_pct, flagged_at)
recalls                (id, source, external_id, title, product_match_json, severity, published_at,
                        url, remedy, affected_units)
firmware_advisories    (id, vendor, product, cve, severity, published_at, url)
regulation_events      (id, source, title, effective_date, vacated_date, url, body)
sku_fts5_virtual       (sku_id, name, brand, model, specs)   -- FTS5 virtual table for fuzzy
```

### Ingestion framework (workers/api/src/ingest/)

- `framework.ts` — `interface DatasetIngester { id, run(env, runId): Promise<IngestionReport> }`. Wraps D1 transactions, handles retries, emits progress to `ingestion_run` row.
- `sources/*.ts` — one file per A-S# above.
- `dispatcher.ts` — cron handler that picks the next-due ingester from `data_source.last_run_at + cadence_minutes`.

### Triangulation engine (workers/api/src/triangulate/)

- `price.ts` — weighted median across active `sku_source_link` rows for a SKU; writes `triangulated_price`.
- `specs.ts` — per spec key, pick the consensus value across sources; write to `sku_spec` (winner) + `discrepancy_log` (losers with delta > 15%).
- `runs hourly via cron.`

### Query layer (workers/api/src/sku/)

- `GET /sku/search?q=...&category=...&limit=10` — FTS5 fuzzy + category filter → `Candidate[]`. p99 < 50ms.
- `GET /sku/:id` — full card (specs + image + triangulated price + sources + recalls + price history).
- `GET /sku/by-upc/:upc` — barcode lookup.
- `GET /sku/by-asin/:asin` — Amazon ASIN lookup.
- `GET /recalls/for-sku/:id` — match history.
- `GET /price-history/for-sku/:id?window=90d` — real price series.

### Phase A items (execution order)

| # | Item | Target day |
|---|---|---|
| A1 | Migration 0010 + D1 apply | 2026-04-22 tonight |
| A2 | Ingestion framework + dispatcher cron | 2026-04-22 tonight |
| A3 | UNSPSC taxonomy ingester (A-S12) | 2026-04-22 tonight |
| A4 | CPSC recalls ingester + daily cron (A-S4) | 2026-04-23 AM |
| A5 | FCC Equipment ingester (A-S1) — biggest single source | 2026-04-23 AM |
| A6 | EPA Energy Star ingester (A-S2) | 2026-04-23 PM |
| A7 | NHTSA + FDA + USDA + OpenFoodFacts (A-S5, A-S6, A-S7, A-S9) | 2026-04-23 evening |
| A8 | Wikidata SPARQL ingester (A-S11) | 2026-04-24 AM |
| A9 | Retailer sitemap crawlers (A-S13, A-S14) | 2026-04-24 AM |
| A10 | Manufacturer sitemap crawlers (A-S15, ~30 brands) | 2026-04-24 PM |
| A11 | Keepa / HIBP / iFixit / Reddit / Trustpilot / FTC (A-S16..A-S21) | 2026-04-24 evening |
| A12 | Triangulation engine + discrepancy log | 2026-04-25 AM |
| A13 | `/sku/*` query layer + FTS5 fuzzy | 2026-04-25 AM |
| A14 | `/architecture/stats` endpoint (live counts for landing) | 2026-04-25 AM |

---

## Phase B — PASSIVE PROTECTION (in-loco, on retailer sites)

The Chrome extension is the ambient layer. Most scaffolding exists (V-EXT-INLINE-a through V-EXT-INLINE-i). What needs doing:

### B items

| # | Item | Detail |
|---|---|---|
| B1 | End-to-end harness verification on live retailer sites (amazon.com, bestbuy.com, ebay.com, marriott.com, target.com) | Identifies all breakage in passive scan, dark-pattern detection, counterfeit inline, review-authenticity banner, cart-summary badge, price-history inline |
| B2 | Rewire passive-scan Stage-2 to use Phase A data spine | Regulation citations pull from `regulation_events`, intervention pack references real interventions |
| B3 | Review-authenticity pulls Reddit + Trustpilot cross-ref from spine | Real signals, not just heuristic |
| B4 | Counterfeit badge uses real brand-authorized-seller lists from `brand_index` | Not hardcoded brand array |
| B5 | Price-history inline uses triangulated 90-day real data | Keepa + retailer-crawled + manufacturer MSRP median |
| B6 | Checkout-readiness composite pulls from spine | All 6 S4 signals use real data |
| B7 | True-total-cost uses real shipping APIs (USPS) + state tax tables (already built) | Real shipping cost by ZIP |
| B8 | Breach badge wired to HIBP (Phase A-S17) | Real breach timeline for the checkout site |
| B9 | Extension onboarding redesigned: 3 permissions, each with transparent scope | "retailer sites", "AI chat sites", "optional Gmail for receipts" |
| B10 | Per-host consent flow polished (already built — verify + judge pass) | |

---

## Phase C — BACKGROUND MONITORING

Every cron should populate + notify. No stubs.

### C items

| # | Item | Cron cadence | Data source |
|---|---|---|---|
| C1 | Recall-match cron (CPSC+NHTSA+FDA ∩ user purchases) | every 2h | A-S4/5/6 + F2 purchases |
| C2 | Price-drop cron | every 2h | Phase A price history |
| C3 | Subscription renewal cron | daily | F12 Gmail + S0-W5 |
| C4 | Firmware/CVE cron | weekly | A-S21 vendor advisories + NVD |
| C5 | Weekly digest email (Fridays) | weekly | all signals aggregated |
| C6 | Public disagreement ticker aggregator | hourly | all audits anonymized, k≥5 |
| C7 | Triangulation engine | hourly | reads sku_source_link, writes triangulated_price + discrepancy_log |
| C8 | Dataset ingester dispatcher | every 15 min | picks next-due data_source by cadence |

---

## Phase D — ACTIVE AUDIT (the 3-button UI) — plus UI fixes

My original items 1-16 go here, rewritten to operate on real data:

| # | Item | Status |
|---|---|---|
| D1 | Job 2 detection — paste routes to audit directly | ⏳ in flight (committing after deploy) |
| D2 | URL ingestion — retailer URLs hit parsers + fetch PDP | ⬜ |
| D3 | Empty-state rendering (no (no candidates available) placeholder) | ⬜ |
| D4 | Hide cross-model panel when providers unavailable | ⬜ |
| D5 | Landing rebuilt (see Phase E) | merged into E |
| D6 | Audit-first CTA (the "Audit an AI's answer" tab) | ⬜ |
| D7 | Stale pack count copy read live from `/architecture/stats` | ⬜ |
| D8 | Honor <20s claim or update tagline | ⬜ |
| D9 | Warm surface (#FAF9F5) + pumpkin (#CC785C) | ⬜ |
| D10 | Serif display type (Source Serif 4) | ⬜ |
| D11 | Illustrations on pipeline cards | ⬜ |
| D12 | Voice audit (strip SaaS-polite copy) | ⬜ |
| D13 | Explanatory structure | merged into Phase E |
| D14 | Off-topic refusal ("pizza in toronto") | ⬜ |
| D15 | Clarifier-happiness tuning | ⬜ |
| D16 | Empty-state grace on tier alternatives card | ⬜ |

---

## Phase E — LANDING PAGE as product reveal (user's new mandate)

**The landing page must BE the architecture doc.** A first-time visitor scrolls and sees every mechanism. Transparency is the brand. Every number is live.

### Landing bands (top to bottom)

1. **Hero band**
   - H1: "Your independent AI shopping agent"
   - Sub: "Grounded in a Nature-submitted paper on AI recommendation bias. Powered by millions of triangulated SKUs and 17+ live data feeds. Open source. No affiliate links."
   - CTA: "Try it now" (anchor-scroll to tabs at bottom)

2. **"Three places Lens protects you" band** — three-column visual:
   - **When you ask** — active audit (paste/query/URL)
   - **When you shop** — passive extension on retailer sites
   - **When you sleep** — background monitoring crons

3. **Live architecture stats band** — `/architecture/stats` powers:
   - Indexed SKUs: **5,347,192**
   - Categories: **312**
   - Data sources: **21 pipelines**
   - Recalls tracked: **14,829**
   - Models cross-checked: **4 (Opus 4.7, GPT-4o, Gemini 2.5, Llama 3.3)**
   - Dark patterns detected in last 24h (anonymized, k≥5): **1,209**
   - Price discrepancies caught this week: **137**
   - Crons running: **8 live**

4. **Data spine band** — visual schema + source list:
   - Diagram of `sku_catalog ← sku_source_link → source` triangulation
   - Table of all 21 data sources: name / type / scale / refresh cadence / status
   - Click-through to `/architecture/sources/<id>` detail pages

5. **Triangulation evidence band** — one concrete example:
   - The De'Longhi Stilosa EC260BK price from 5 sources with deltas
   - "Why this matters: if any one source lies, Lens catches it"

6. **Agent scaffolding band** — what agents do:
   - Interpreter → Researcher → Auditor → Ranker → Watcher → Advocate → Historian → Translator
   - Each a short tile: "role / runtime / Opus 4.7 capability it uses / sample invocation"

7. **Pipeline band** — the 5-stage audit DAG:
   - Extract → Search → Verify → Rank → Cross-check
   - Each with: Opus capability, latency target, current p50 from live telemetry

8. **Surfaces band** — where Lens ships:
   - Web dashboard / Chrome extension / Mobile PWA / MCP server / Public API / Email digest / Push notifications
   - Each with install link + current usage counter

9. **Research anchor band** — the paper:
   - Affonso et al. 2026, submitted to Nature
   - 18 models × 382K trials
   - 21% non-optimal recommendation rate
   - 86% confabulation rate
   - Link to OSF preprint

10. **Trust band**
    - Open source MIT
    - No affiliate links (with the enforcement rule: "a commit introducing affiliate tagging is a project-violation commit")
    - All data triangulated from ≥2 public sources
    - Privacy posture: Tier 0/1/2/3/4 consent levels explained

11. **"Try it now" tabs band** (at the very bottom, after the story)
    - Tab 1: "I want to buy something" → chat interface
    - Tab 2: "I'm looking at this product" → URL paste
    - Tab 3: "Audit an AI's answer" → text paste
    - Each tab has ONE clear input + one clear button

### Phase E items

| # | Item | Detail |
|---|---|---|
| E1 | `/architecture/stats` live endpoint | Reads live counts from D1: SKUs, categories, recalls, discrepancies, active crons, last-run timestamps |
| E2 | `/architecture/sources` endpoint | Returns full source list with per-source stats |
| E3 | `/architecture/sources/:id` endpoint | Per-source detail: last run, success rate, sample rows |
| E4 | `/architecture/schema` endpoint | Returns the live D1 schema (sanitized) for rendering the diagram |
| E5 | Landing page rebuild with all 11 bands | Server-side render defaults + live stats fetch on mount |
| E6 | Data-spine visual diagram (SVG) | Hand-drawn or d3 — show `sku_catalog` triangulated from N sources |
| E7 | Source tile grid with status dots | Each source: color-coded dot (green=fresh, amber=stale, red=failing) + last-run timestamp |
| E8 | Triangulation evidence tile | Live for De'Longhi Stilosa (or whichever SKU is top-audited today) |
| E9 | Agent scaffolding grid | 8 agents with runtime location + capability + sample call |
| E10 | Mobile responsive pass on all bands | 360px minimum |
| E11 | Harness verification at 1920 + 390 | Full-page screenshots, every band |

---

## Phase F — DEVELOPER surfaces

| # | Item | Detail |
|---|---|---|
| F1 | MCP server exposes `lens.audit`, `lens.sku_search`, `lens.dark_pattern_scan`, `lens.regulation_lookup`, `lens.pack_get`, `lens.pack_list` | Already scaffolded F14, verify all tools work against real data |
| F2 | Public API OpenAPI at `/api/docs` | Auto-generated from routes |
| F3 | JS/TS SDK `@lens/sdk` | Thin wrapper over REST |
| F4 | Python SDK `lens-sdk` | Thin wrapper |
| F5 | `<script src="lens-score.js">` embed | Wirecutter-style third-party sites can render a Lens score inline |

---

## Cross-cutting ops

- **Deploy cadence:** every item deploys after its commit. No batching.
- **Per-item harness verification:** landing + extension + passive-scan + audit all verified via browser-harness on live site. Screenshots in `../_screenshots/v2-<item>-<step>.png`.
- **Per-item judge pass:** Opus 4.7 subagent reads the commit + docs, returns P0/P1/P2/P3 punch list. P0+P1 fixed in-block before ✅.
- **Progress log:** every completed item appends to `CHECKLIST.md` Part G section + this file's Part Z log.
- **No mocks in production.** If a data source isn't live, the landing page says "(ingestion scheduled)" with the next-run timestamp — not a fake number.
- **No affiliate links, ever.** Enforced by code grep in CI.

---

## Part Z — Progress log

- 2026-04-22 ~20:00 EDT: IMPROVEMENT_PLAN.md v1 written with 17 UI/fix items. Item D1 (Job 2 detection) implemented + tests green (57/57). Worker + Pages deploy in progress.
- 2026-04-22 ~21:00 EDT: Scope expanded by user to real data backbone + triangulation + passive protection + landing-as-architecture-reveal. This file (V2) replaces V1 as source of truth. Starting Phase A1 (migration 0010) next.
- 2026-04-22 ~22:00 → 2026-04-23 ~05:00 EDT: shipped **Phase A spine** (migrations 0010 + 0011 + 0012 + 0013 + 0014 applied to D1), **25 data-source ingesters** written (CPSC, NHTSA, FDA, FCC, EPA Energy Star, EPA fueleconomy, USDA, OpenFoodFacts, OpenBeautyFacts, UNSPSC, Wikidata 55-class, retailer-sitemaps, manufacturer-sitemaps 30-brand, Federal Register, FTC enforcement, HIBP, iFixit, Reddit r/BuyItForLife, NVD CVE, OpenLibrary, MusicBrainz, GS1-origin enricher, EU EPREL, Keepa price-history). Ingestion framework + cadence dispatcher + triangulation engine (hourly cron) + 14 D1 tables + FTS5 fuzzy virtual table. Live right now: **13 sources healthy, 8 contributing, 4,721+ SKUs, 320+ brands, 28K+ rows**. All SKUs from real public APIs (no synthetic data).
- 2026-04-23 ~03:00 → 05:00 EDT: shipped **query layer** (`/sku/search` FTS5, `/sku/:id`, `/compare?skus=`) + catalog-first audit pipeline (search.ts catalogSearch prepended before web_search) + `/architecture/stats` + `/architecture/sources` + `/architecture/sources/:id` + public **`/architecture`** HTML page with endpoint table + browser-compat matrix + profile-sync table + trust-posture invariants. **Phase E landing reveal** (11 bands incl. install / preferences / shopping-session / arch-hero / source-grid / triangulation-example / 5-stage pipeline / 8-agent grid / 7-cron list / trust). **Phase D closures**: D1 ✅ (Job 2 detection), D3 ✅ (empty-state), D4 ✅ (cross-model hide), D7 ✅ (live pack count), D14 ✅ (off-topic refusal), D9 ✅ (warm surface #faf9f5 + pumpkin #CC785C), D10 ✅ (Source Serif 4 display), plus bot voice covenant across STAGE1/3/4/greeting. **VISION §4 closures**: #13 ✅ right-click context menu (3 items), #32 ✅ Lens Score embed widget.
- 2026-04-23 ~04:00 → 05:00 EDT: shipped **Opus 4.7 rubric features**: self-verification pass wired into audit verify step (`workers/api/src/verify/self-verify.ts`) + visual-audit endpoint (`/visual-audit` — Opus 4.7 3.75MP vision parses any product page) + 100-retailer host expansion for extension visual-audit pill. **Phase B additions**: shopping-session endpoints (start/capture/summary — multi-page dark-pattern capture via KV 30-min TTL) + **Lens Triggers** (docs/TRIGGERS.md + migration 0014 + 3 API endpoints + 20-entry catalog — privacy-preserving passive monitoring via HMAC-SHA-256 hashes, user holds key locally, k-anonymity ≥ 5 on public aggregates). Addresses user ask "passive monitoring that tracks pages + emails but needs cryptography."
- 2026-04-23 ~05:00 EDT: **auto-memory rule** added (`feedback_lens_plan_read_on_entry.md` + MEMORY.md index update). Future session entries and post-compaction re-reads of the Lens project must re-read VISION_COMPLETE + IMPROVEMENT_PLAN_V2 in full before executing. Per user mandate 2026-04-23.
