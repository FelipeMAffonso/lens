# Lens

[![CI](https://github.com/FelipeMAffonso/lens/actions/workflows/ci.yml/badge.svg)](https://github.com/FelipeMAffonso/lens/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Lens is the consumer's independent agent across every point of every purchase.** It turns what you care about into a transparent ranking of real products, verifies every claim the platforms make, catches recommendation bias from AI shopping assistants, flags dark patterns at checkout, analyzes review authenticity, tracks welfare-delta across your history, and does all of this with no commission, no ad revenue, no partner relationships, and no catalog ownership that would compromise the answer.

Built with Claude Opus 4.7 for the *Built with Opus 4.7: a Claude Code Hackathon* (Apr 21-26, 2026). Track: **Build From What You Know**. Grounded in the *Nature*-submitted paper on AI shopping recommendation bias (Affonso et al., 2026 — 18 models, 382,000 trials).

Eleven consumer welfare workflows ship in this week's demo. Forty-one more live on the roadmap. See [`docs/CONSUMER_WORKFLOWS.md`](docs/CONSUMER_WORKFLOWS.md) for the full customer-journey surface and [`docs/VISION.md`](docs/VISION.md) for the product thesis.

## What's new in v2 (2026-04-22) — the data backbone

Every fact Lens shows is now **triangulated from ≥ 2 independent public sources**.

- **16 live ingester pipelines** pulling from FCC Equipment Authorization, EPA Energy Star, EPA fueleconomy.gov, CPSC / NHTSA / FDA recall databases, USDA Branded Foods, OpenFoodFacts, OpenBeautyFacts, Wikidata SPARQL, Federal Register, FTC enforcement actions, Have I Been Pwned, Keepa (price history), Reddit community signals, retailer sitemap.xml files (BestBuy / Walmart / Target / Costco / HomeDepot / Amazon), and 30 manufacturer sitemaps (Apple / Sony / Samsung / LG / Breville / Dyson / De'Longhi / Bose / etc.).
- **14 D1 tables + FTS5 fuzzy search** (`migrations/0010_ground_truth.sql`): `sku_catalog`, `sku_source_link`, `triangulated_price`, `price_history`, `discrepancy_log`, `recall`, `firmware_advisory`, `regulation_event`, `brand_index`, `category_taxonomy`, `data_source`, `ingestion_run`, `recall_affects_sku`, `sku_spec`. Target: **millions of SKUs** with continuous refresh.
- **Hourly triangulation engine** (`workers/api/src/triangulate/price.ts`): weighted median + p25/p75 across every active source; any two sources differing > 15% → `discrepancy_log` row.
- **Fast query layer**:
  - `GET /sku/search?q=&category=&brand=&limit=&includeSources=1` — FTS5 fuzzy over catalog, p99 < 50ms.
  - `GET /sku/:id` — full product detail with sources + recall history.
  - `GET /compare?skus=a,b,c` — side-by-side 2-6 SKU comparison with shared-spec matrix, triangulated price, sources, recalls, price history.
  - `GET /architecture/stats` — live counts for the landing page.
  - `GET /architecture/sources` — per-pipeline status + last run time.
- **Audit pipeline now catalog-first**: `search.ts` queries `sku_catalog` FTS5 BEFORE falling through to the slow live web_search. Audits of indexed categories drop from 20s+ to < 8s.
- **Landing page as architecture reveal** (`/`): 8 bands including live stat cards, data-spine source grid (green dot per healthy ingester), triangulation example, 5-stage pipeline, 8-agent scaffolding, 7 cron schedules, and trust posture. Self-updates every 60s.

See [`IMPROVEMENT_PLAN_V2.md`](IMPROVEMENT_PLAN_V2.md) for the full 4-day sprint plan, [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) for the ingester registry, and [`docs/PERSONAS.md`](docs/PERSONAS.md) for the named-person rubric answer (Sarah, Miguel, Dev, Priya).

## Why this exists

A peer-reviewed study of 18 frontier models across 382,000 shopping trials (Affonso et al., submitted to Nature, 2026) found AI shopping assistants recommend a non-optimal product 21% of the time and confabulate the reasons in 86% of cases. Lens is the welfare fix: a tool that audits any AI shopping answer in under 20 seconds with live product data.

## Two jobs, one tool

**Job 1 — "I want to buy X" (primary mode).** User types a shopping query. Lens derives weighted criteria from a **Knowledge Pack for that category** (52 packs live), searches real products, and ranks transparently with user-adjustable sliders. End-to-end in ~6 seconds. No AI assistant in the loop.

**Job 2 — "Audit this AI answer" (killer demo).** User pastes a ChatGPT / Claude / Gemini / Rufus recommendation. Lens does Job 1 *plus* extracts the AI's cited claims, verifies each against a catalog, flags confabulations using category-specific pattern packs, and runs the same question through other frontier models. End-to-end in ~18 seconds.

## Architecture at a glance

- **52 Knowledge Packs** across 5 types (`packs/`): 20 categories, 16 dark patterns (complete Brignull canonical set), 8 regulations (FTC, state, EU), 5 fee taxonomies, 3 interventions. Each pack is versioned, cryptographically attributable to its evidence sources, and retires cleanly when the underlying regulation/pattern changes. See `docs/KNOWLEDGE_ARCHITECTURE.md`.
- **Four pipeline stages**, all on a Cloudflare Worker calling Claude Opus 4.7:
  1. **Extract** — two-pass: first pass detects category, looks up the Category Pack, second pass re-runs with the pack's criteria template injected so the output aligns to pack semantics.
  2. **Search** — live web search via Opus 4.7's `web_search_20260209` tool; fixture-mode fallback for latency-sensitive demo.
  3. **Verify** — 1M context loads every candidate spec sheet alongside every claim. Category-specific confabulation patterns from the pack are injected into the system prompt. Verdicts carry pack evidence references (E1, E3…).
  4. **Rank** — deterministic `U = Σ wᵢ · sᵢ`, fully inspectable. Web UI exposes live sliders.
  5. **Cross-check** — parallel fan-out to GPT-4o + Gemini + Llama via `crossModel.ts` (Day 3: migrating to Claude Managed Agent for the $5k special prize).
- **Four pack-maintenance agent loops** keep packs current (`scripts/`, `docs/PACK_AGENTS.md`):
  1. **Validator** — LLM-as-judge checks every evidence entry against its cited source.
  2. **Enricher** — per-pack Opus agent uses `web_search` (4 queries) to propose additions.
  3. **Regulation watcher** — weekly check of every regulation's in-force status.
  4. **Product-page scraper** (roadmap) — samples live retailer pages for new patterns.

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
