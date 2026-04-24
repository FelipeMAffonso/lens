# Lens

[![CI](https://github.com/FelipeMAffonso/lens/actions/workflows/ci.yml/badge.svg)](https://github.com/FelipeMAffonso/lens/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Lens is your AI shopping companion — one agent that works for you, before, during, and after every purchase.** Tell Lens what you want, paste what another AI told you, drop any product URL, or attach a photo. Lens runs a 5-stage pipeline — extract, search (real catalog + live web), verify, rank with transparent `U = Σ wᵢ · sᵢ` math, cross-check against GPT-4o / Gemini / Llama via a Claude Managed Agent — and returns one answer. Retune in plain language: "make it quieter", "budget tight at $300". No sliders.

Built with Claude Opus 4.7 for the *Built with Opus 4.7: a Claude Code Hackathon* (Apr 21-26, 2026). Track: **Build From What You Know / Build A Tool That Should Exist**. Grounded in the *Nature*-submitted paper on AI shopping recommendation bias (Affonso et al., 2026 — 18 models, 382,000 trials).

## Four surfaces, one backend

| Surface | Where | Purpose |
|---|---|---|
| **Web chat** (primary) | [lens-b1h.pages.dev](https://lens-b1h.pages.dev) | Chat home with 📎 photo + any-URL + description. Streaming audit narration via SSE. Plain-language re-rank. |
| **Chrome extension** | [/downloads/lens-extension.zip](https://lens-b1h.pages.dev/downloads/lens-extension.zip) | Silent dark-pattern / hidden-fee / fake-sale / counterfeit / fake-review badges on retailer checkouts. Inline pill on chat.openai.com / claude.ai / gemini.google.com / perplexity.ai / amazon.com. |
| **Mobile PWA** | Same URL → Share → Add to Home Screen | Share-target, camera input, push notifications (iOS 16.4+ after install). |
| **MCP server** | `workers/mcp/` | 13 tools: `lens.audit`, `lens.sku_search`, `lens.sku_get`, `lens.dark_pattern_scan`, `lens.regulation_lookup`, `lens.resolve_url`, `lens.trigger_ingest`, `lens.intervention_draft`, `lens.architecture_stats`, `lens.pack_list`, `lens.pack_get`, `lens.spec_optimal`, `lens.architecture_sources`. |

## Your Shelf — the after-you-buy surface

[lens-b1h.pages.dev/shelf](https://lens-b1h.pages.dev/shelf) shows what Lens is watching for every purchase: CPSC / NHTSA / FDA recall feeds, 8-retailer price-match-window table, firmware CVE scans (CISA KEV + NVD), subscription auto-renewal calendars, warranty expiry. Interventions pre-drafted — Magnuson-Moss letters, CFPB complaints, FTC junk-fee reports, state-by-state subscription-cancellation templates. See it LIVE with the canonical Sarah scenario.

## Data backbone (live as of 2026-04-24)

Every fact Lens shows is **triangulated from ≥ 2 independent public sources**.

- **52 data pipelines configured, 24 contributing rows today, 29 healthy** — government (CPSC, NHTSA, FDA recalls + 510(k) + FAERS, FCC Equipment Authorization, EPA Energy Star + fueleconomy, USDA Branded Foods, Federal Register, FTC enforcement, CFPB complaints, BLS CPI, CISA KEV), open data (Wikidata SPARQL 106 classes, UNSPSC, OpenFoodFacts, OpenBeautyFacts, OpenLibrary, MusicBrainz, GS1 origin, NVD CVE, HIBP, Google Product Taxonomy), retail sitemap crawlers (Amazon, BestBuy, Walmart, Target, HomeDepot, Costco), manufacturer sitemaps (~30 brands), deal RSS (Slickdeals, DealNews, Bensbargains, GottaDeal, MyBargainBuddy), third-party enrichment (upcitemdb cross-retailer, iFixit repairability), paid-tier scaffolding (Keepa, SerpApi, Apify, Priceapi, Brightdata, Reddit).
- **Live counts:** 85,918 indexed SKUs · 5,326 categories · 9,518 recalls · 18,806 regulations · 8,862 brands · 120 packs.
- **28 D1 migrations** (`workers/api/migrations/`): `sku_catalog`, `sku_source_link`, `sku_spec`, `triangulated_price`, `price_history`, `discrepancy_log`, `recalls`, `firmware_advisories`, `regulation_events`, `brand_index`, `category_taxonomy`, `data_source`, `ingestion_run`, `triggers`, `gmail_tokens`, `household_members`, `gift_requests`, `gift_responses`, `subscriptions`, `performance_ratings`, …
- **FTS5 fuzzy search** over the catalog — p99 < 50 ms; `/sku/search?q=…&category=…&brand=…`.
- **Hourly triangulation engine** (`workers/api/src/triangulate/price.ts` + `specs.ts`): weighted median + p25/p75 + n_sources; any two sources differing > 15 % → `discrepancy_log` row surfaced on the audit card.
- **Audit pipeline catalog-first**: `search.ts` queries the indexed spine BEFORE falling through to live web_search. Audits of indexed categories drop from 20 s+ to < 8 s.
- **Landing page as architecture reveal** — see [/architecture.html](https://lens-b1h.pages.dev/architecture.html): 11 bands, every number live from `/architecture/stats`, source grid with green/amber/red dots.

See [`IMPROVEMENT_PLAN_V2.md`](IMPROVEMENT_PLAN_V2.md) for the sprint log, [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) for the ingester registry, [`VISION_COMPLETE.md`](VISION_COMPLETE.md) for the canonical vision, [`AMBIENT_MODEL.md`](AMBIENT_MODEL.md) for the two-stage passive model.

## Why this exists

A peer-reviewed study of 18 frontier models across 382,000 shopping trials (Affonso et al., submitted to *Nature*, 2026) found AI shopping assistants recommend a non-optimal product 21 % of the time and confabulate the reasons in 86 % of cases. Lens is the welfare fix.

## The 5-stage audit pipeline

1. **Extract** — Opus 4.7 adaptive thinking parses the user's stated criteria into a weighted utility function with per-criterion confidence. Handles text / URL / photo / AI-paste inputs uniformly.
2. **Search** — `catalogSearch()` hits the indexed spine first (85 918 SKUs); live `web_search_20260209` fallback for unindexed categories. Per-host parsers (Amazon / BestBuy / Walmart / Target / HomeDepot / Shopify) + universal JSON-LD / OpenGraph / microdata extractors + Jina-markdown + Opus structured JSON extraction for hard retailer pages.
3. **Verify** — 1 M context loads every candidate spec sheet alongside every AI claim in one window. Knowledge packs inject confabulation patterns. Verdicts carry pack-evidence references.
4. **Rank** — deterministic `U = Σ wᵢ · sᵢ`. Transparent. Every contribution inspectable. Retune in plain language via `POST /rank/nl-adjust` — Opus parses "make it quieter" into per-criterion weight deltas, renormalises sum = 1, re-ranks client-side.
5. **Cross-check** — parallel fan-out to GPT-4o / Gemini / Llama via a Claude Managed Agent Worker. Agreement / disagreement rendered inline.

## 120 Knowledge Packs (`packs/`)

- **59 category packs** — espresso machines, laptops, headphones, office chairs, running shoes, microwaves, robot vacuums, smartphones, TVs, cameras, monitors, printers, routers, tablets, mattresses, backpacks, luggage, kitchenware, coffee makers, …
- **24 dark-pattern packs** — complete Brignull canonical set + 2024 FTC Fake Reviews Rule extensions: hidden-costs, preselection, bait-and-switch, confirmshaming, drip pricing, fake-urgency, forced continuity, disguised ads, hard-to-cancel, basket sneaking, …
- **16 regulation packs** — FTC Junk Fees Rule (16 CFR Part 464), California SB-313, New York §527-a (auto-renewal), FTC 16 CFR Part 255 (affiliate disclosure), Illinois ACRA, Vermont §2454a, CCPA, EU DSA, Magnuson-Moss Warranty Act, …
- **14 fee packs** — resort fees, destination fees, booking fees, convenience fees, service charges, handling fees, restocking fees, early-termination fees, …
- **8 intervention packs** — file FTC complaint, draft return letter, draft warranty claim, draft price-match claim, draft cancellation letter, draft FCC complaint, draft state-AG complaint, Magnuson-Moss letter.

## 9 workflow specs + 7 cron schedules

- `audit` (the 5-stage pipeline DAG)
- `ingest.dispatch` (every 15 min — rotate through 52 configured data sources)
- `triangulate.price` + `triangulate.specs` (hourly :41 — median + p25/p75 + discrepancy log)
- `recall.watch` (daily 07:09 — CPSC/NHTSA/FDA ∩ user purchases)
- `price.poll` (every 2 h — price-drop refund window detection)
- `subs.renewal-watch` (daily 10:23 — 7-day pre-charge alerts)
- `firmware.watch` (weekly Mon 07:31 — CVE ∩ connected-device purchases)
- `ticker.aggregate` + `digest.send` (hourly :41 — k ≥ 5 anonymised aggregates + weekly email)
- `pack.maintenance` (weekly Mon 06:13 — validator + enricher + reg-watcher)
- `gmail.poll` (every 2 h — receipt ingestion via OAuth)

## No affiliate links. Ever.

Every retailer URL Lens returns is scrubbed of `ref=`, `tag=`, `utm_*`, `awc=`, and every other monetized-redirect parameter. Enforced in code at the search boundary. A commit introducing affiliate tagging is a project-violation commit and must be reverted (see [`VISION_COMPLETE.md`](VISION_COMPLETE.md) §13 #8).

## Live endpoints

- **Web dashboard:** https://lens-b1h.pages.dev
- **Audit API:** `https://lens-api.webmarinelli.workers.dev`
  - `GET /health`
  - `GET /packs/stats` — registry stats (pack counts, categories indexed, regulations by status)
  - `GET /packs/:slug` — full pack JSON
  - `POST /audit` — Job 1 or Job 2 depending on input `kind` (`query`, `text`, or `image`)
  - `POST /audit/stream` — SSE variant with per-stage events

## Install (developer, load-unpacked)

```bash
npm install --no-audit --no-fund            # npm workspaces, not pnpm
node scripts/bundle-packs.mjs               # bundle packs/ -> workers/api/src/packs/all.generated.ts

# Copy every env template (see docs/secrets.md for what to fill in).
cp workers/api/.dev.vars.example workers/api/.dev.vars
cp workers/cross-model/.dev.vars.example workers/cross-model/.dev.vars
cp workers/mcp/.dev.vars.example workers/mcp/.dev.vars
cp apps/web/.env.example apps/web/.env.local

cd workers/api && npx wrangler deploy       # deploy the Worker
cd apps/web && npm run dev                  # local web dashboard
# Load apps/extension as unpacked in chrome://extensions
```

### Secrets

**Every secret Lens reads is documented in [`docs/secrets.md`](docs/secrets.md)**, including the exact `wrangler secret put` command per worker, which are required vs optional, and the graceful fallback when an optional key is missing. The minimum to boot meaningfully is `ANTHROPIC_API_KEY` in `workers/api/.dev.vars`.

For production, each worker gets its own secret store:

```bash
cd workers/api
for NAME in ANTHROPIC_API_KEY JWT_SECRET RESEND_API_KEY \
            OPENAI_API_KEY GOOGLE_API_KEY OPENROUTER_API_KEY \
            GMAIL_OAUTH_CLIENT_ID GMAIL_OAUTH_CLIENT_SECRET \
            DEEPGRAM_API_KEY; do
  npx wrangler secret put "$NAME"
done
```

## Running the pack-maintenance agents

```bash
# Validate every pack's evidence against its cited source
node scripts/validate-packs.mjs

# Enrich a specific pack via Opus 4.7 web search (proposes version bump + changes)
node scripts/enrich-pack.mjs packs/category/espresso-machines.json

# Check every regulation pack for status changes
node scripts/check-regulation-status.mjs
```

## Repo layout

See `../BUILD_PLAN.md` in the enclosing planning folder for the full architecture.

## License

MIT. See `LICENSE`.

## Acknowledgments

Claude Opus 4.7 (Anthropic). Claude Managed Agents platform. The paper's 18 cooperating model providers (Anthropic, OpenAI, Google, OpenRouter). The Cerebral Valley + Anthropic team for running the hackathon.
