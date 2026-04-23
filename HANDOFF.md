# Lens — Handoff (2026-04-23, T-2d19h to submission)

This is a full picture of what exists, what's running, what's deployed, and what still needs doing before the 2026-04-26 8PM EDT hackathon deadline.

---

## 1. The one-line

**Lens is the consumer's independent AI-shopping agent** — grounded in a Nature-submitted paper (18 models × 382K trials: AI shopping assistants pick non-optimal products 21% of the time, confabulate reasons 86%). Every answer triangulates across ≥2 public sources with confidence + timestamp. **No affiliate links. Ever.** Transparent utility math `U = Σ wᵢ · sᵢ`. MIT-licensed.

Source-of-truth docs (read in this order): `LOOP_DISCIPLINE.md` → `VISION_COMPLETE.md` → `IMPROVEMENT_PLAN_V2.md` → `CHECKLIST.md`.

---

## 2. Live deployments

| Surface | URL | Owner | Notes |
|---|---|---|---|
| API worker | `https://lens-api.webmarinelli.workers.dev` | Cloudflare Workers | 7 cron schedules wired (`*/15`, `17 */2`, `13 6 * * 1`, `7 9`, `23 10`, `31 7 * * 1`, `41 *`). Bindings: D1 `lens-production`, KV `LENS_KV`, R2 `lens-blobs`, DO `RateLimitCounter`. |
| Web (production) | `https://lens-b1h.pages.dev` | Cloudflare Pages (project `lens`) | **Git-autodeploy is OFF** — every change needs a manual `wrangler pages deploy`. Last known-good production bundle: `index-CCOZaxnd.js`. Latest commits (provenance card, sku.html warranty surface) are built + uploaded to the preview URL `https://01e6f496.lens-b1h.pages.dev` and need to be promoted. |
| MCP worker | scaffolded in `workers/mcp/` | — | 13 tools, JSON-RPC 2.0; deploy via `cd workers/mcp && npx wrangler deploy`. |
| Docs (OpenAPI) | `/docs` on the API worker | — | Scalar-rendered OpenAPI 3.1 with 32 paths. |
| Extension | `apps/extension/` | — | MV3 Chrome extension; download zip at `/downloads/lens-extension.zip`. |

### Repo
- GitHub: `https://github.com/FelipeMAffonso/lens.git` (branch `main`)
- Local: `C:\Users\natal\Dropbox\Felipe\CLAUDE CODE\academic-research\projects\claude-opus-4-7-hackaton\lens`
- npm workspaces (`apps/*`, `packages/*`, `workers/*`)

### Pages deploy recipe (the one you'll use)
```bash
cd apps/web
npx vite build
npx wrangler pages deploy dist --project-name=lens --branch=main --commit-dirty=true
# Note the preview URL printed; production alias updates automatically only
# if CF Pages project settings have "main" as the production branch.
# If not, promote manually in the CF dashboard under Pages → lens → Deployments.
```

---

## 3. Current spine (live pull 2026-04-23 19:00 UTC)

```
skus_active:            85,918
categories_total:        5,326
sources_contributing:       24 (rows > 0)
sources_configured:         52 total
sources_healthy:            29 (recently-ran without failing)
recalls_total:           9,518
firmware_advisories:     2,059
regulations_in_force:   18,806
brands_known:            8,862
discrepancies_open:          0
packs:                     120 (59 category, 24 dark-pattern, 15 reg, 14 fee, 8 intervention)
```

Top data contributors (rows):
```
wikidata                 692K    (SPARQL, 106 classes)
nvd-cve                   82K
ifixit                    49K
fda-recalls               49K
federal-register          49K
musicbrainz               45K
usda-foods                37K
openlibrary               26K
epa-fueleconomy           19K
openfoodfacts             14K
google-product-taxonomy    6K
gs1-origin                 5K
```

---

## 4. What I shipped in this final burst (6 commits)

1. `3231550` — **Opus 4.7 structured extraction on Jina markdown** (`resolve-url.ts`). Regex extractor falls through to an Opus 4.7 call when the page looks weak. Writes title/brand/priceCents/rating/bullets/specs/**warranty**/**country**/model/UPC/EAN. Verified on Soundcore P20i: `extractor: "regex+opus"`, 6 structured specs. $0.003/call, KV-cached 24h.
2. `e50a039` — **`/sku.html` provenance card** — warranty / country / materials / certifications / energy rating / repairability pulled above raw specs. Honest null handling.
3. `d4b451e` — **upcitemdb FK fix** (synthetic `upcitemdb:<merchant>` data_source rows pre-batched) + **slickdeals** 18→32 keywords, empty-firehose removed.
4. `3608895` — **retailer-sitemaps**: advance cursor past Amazon-500, `DecompressionStream` for `.xml.gz` children, Best Buy regex widened to `/site/.../NNNNNNN.p`. First proof: 2,000 Best Buy SKUs landed in 4 manual triggers.
5. `a263ca0` — **round-robin cursor across retailers** with per-retailer `childIndexes` map. Without this, the cursor would iterate every Best Buy child (~50 files, ~days) before reaching Walmart/Target/HomeDepot/Costco.
6. `dbf30de` — **audit noise filter + provenance card**. Catalog FTS uses category tokens only (not criterion names); hard-excludes `ol:`/`mb:`/`ifixit:`/`fda510k:` etc. on non-media intents. `/audit` on "ANC headphones" now returns 5 real picks (Jabra/Sennheiser/B&W/Bose/Sony), was 5 real + 7 books/albums/guides. New `provenanceCard` in `main.ts` + CSS shows indexed-SKU count, sources contributing/configured, recalls, regs, brands, crons, and 6-stage pipeline timing strip.

---

## 5. Architecture — code map

```
apps/
  web/                 # Cloudflare Pages — vanilla-TS + Vite
    src/main.ts        # 1,400+ LoC — entire audit UI + renderResult DAG
    src/chat/          # ChatView, ConversationStore, composer
    public/sku.html    # per-SKU detail page (warranty/country/materials surface)
    public/architecture.html  # live architecture / sources directory
  extension/           # MV3 Chrome extension (content scripts + background)

workers/
  api/src/             # Hono HTTP router, Cloudflare Worker
    index.ts           # route table — 32 public paths
    anthropic.ts       # opusExtendedThinking() helper; OPUS_4_7='claude-opus-4-7'
    search.ts          # catalogSearch() + web-search fallback + mergeCandidates
    rank.ts            # U = Σ wᵢ · sᵢ deterministic ranker (no LLM)
    verify/            # claim verification + self-verify pass
    sku/               # /sku/:id, /sku/search (FTS5), /resolve-url (Opus extract)
    cron/jobs.ts       # 12 cron jobs wired to 7 CF schedules
    workflow/          # DAG engine + per-workflow specs (audit, gmail, triangulate…)
    ingest/
      framework.ts     # DatasetIngester + markFinished + cursor_json
      dispatcher.ts    # every-15min picks 2 due ingesters, runs in parallel
      sources/         # 30+ ingester files (one per source)
    triangulate/
      price.ts         # hourly consensus → triangulated_price + discrepancy_log
      specs.ts         # hourly spec consensus → sku_spec
    chat/prompts.ts    # STAGE1/3/4 system prompts + LENS_VOICE_COVENANT
    openapi/           # OpenAPI 3.1 spec + Scalar docs
  mcp/                 # MCP JSON-RPC server (13 tools)

packages/
  shared/              # Shared types (Candidate, AuditResult, Intent…)
  sdk/                 # @lens/sdk — JS/TS thin wrapper
  sdk-py/              # lens-sdk — Python parallel
  cli/                 # @lens/cli — 11 commands
```

### State storage (tier 0-4 per VISION §7)
- **Tier 0** in-flight: query text, scan excerpts (per-request).
- **Tier 1** localStorage / chrome.storage.local: anon preferences, dismissed badges, per-host consent.
- **Tier 2** D1 + KV + R2: signed-in users, purchases, interventions, welfare delta. D1 db `lens-production` (`a88ccf86-…`).
- **Tier 3** OAuth-scoped: Gmail token, Plaid link (scaffolded, not live).
- **Tier 4** anonymized aggregates: ticker (k ≥ 5). Hourly aggregator cron.

---

## 6. Cron catalog

All 7 CF schedules. Each fires one or more workflow handlers.

| Schedule | Workflow(s) | Purpose |
|---|---|---|
| `*/15 * * * *` | `email.poll`, `ingest.dispatch` | Every 15 min: Gmail poller placeholder + pick 2 due ingesters and run parallel. |
| `17 */2 * * *` | `gmail.poll`, `price.poll` | Every 2h: Gmail receipts (OAuth), retailer-price poll for tracked purchases. |
| `13 6 * * 1` | `pack.maintenance` | Weekly Mon 6:13 UTC: pack validator + enricher + reg-watcher. |
| `7 9 * * *` | `recall.watch` | Daily 9:07 UTC: CPSC/NHTSA/FDA recall scan × user purchases. |
| `23 10 * * *` | `subs.renewal-watch` | Daily 10:23 UTC: subscription 7-day pre-charge warning. |
| `31 7 * * 1` | `firmware.watch` | Weekly Mon 7:31 UTC: CVE feed × connected-device purchases. |
| `41 * * * *` | `ticker.aggregate`, `triangulate.price`, `triangulate.specs`, `digest.send` | Hourly :41: disagreement ticker, price/spec consensus, weekly digest dispatch. |

Cron config: `workers/api/src/cron/jobs.ts`. Schedule list lives also in `workers/api/wrangler.toml` and is echoed on every `wrangler deploy` output.

---

## 7. Data-source ingesters (52 configured, 24 contributing, 29 healthy)

Each file in `workers/api/src/ingest/sources/*.ts` implements `DatasetIngester` and is registered in `dispatcher.ts` → `INGESTERS` map. Cursor state lives in `data_source.cursor_json` (**not** `last_error` — framework wipes that).

### Contributing (rows > 0)
government, open data, retail, third-party — row counts as of 19:00 UTC:

```
wikidata (SPARQL, 106 classes)         692,500
nvd-cve                                  82,018
ifixit                                   48,896
fda-recalls                              48,820
federal-register                         48,767
musicbrainz                              44,762
usda-foods                               37,200
openlibrary                              26,200
epa-fueleconomy                          18,754
openfoodfacts                            14,182
google-product-taxonomy                   5,595
gs1-origin                                4,915
fda-510k                                  2,800
category-classify                         2,600
retailer-sitemaps                         2,000+  (BestBuy via gzip children)
cpsc-recalls                              1,789
cisa-kev                                  1,578
hibp                                        974
dealnews (RSS)                              412
openbeautyfacts                             ~200
steam-store                                 174
fda-drug-events                             173
cfpb-complaints                             132
gottadeal (RSS)                             102
slickdeals (RSS)                            75-300 per run (32 keywords)
nhtsa-recalls                                19
mybargainbuddy (RSS)                         28
upcitemdb                                     4/run (cross-retailer triangulation seed)
bensbargains                                 59
bls-cpi                                      11
unspsc                                       55
```

### Healthy-but-zero (need a small fix)
- `eu-eprel` — HTTP 403 (user-agent / header issue).
- `ftc-enforcement` — HTTP 403 (blocked; needs UA swap or Jina pipe).
- `manufacturer-sitemaps` — empty-error, probably same gzip issue as retailer-sitemaps was.
- `openbeautyfacts` — HTTP 525 (origin SSL flap; transient).

### Never-ran (intentional — require paid API keys)
`apify-amazon-price`, `serpapi-shopping`, `priceapi`, `brightdata`, `keepa`, `reddit`. Scaffolding in place, swap in keys → live.

### Key fixes that unlocked growth
1. **Migration 0020** added `data_source.cursor_json` column. Every ingester's cursor was being stored in `last_error` and wiped by `markFinished`. Dozens of zero-row ingesters came alive the moment the cursor was persisted.
2. **Opus 4.7 extractor on Jina markdown** hydrates warranty/country/model/UPC/EAN fields that regex can't cleanly pull.
3. **upcitemdb FK** — synthetic `upcitemdb:<merchant>` pseudo-sources pre-seeded into `data_source` before batched sku_source_link inserts. Unlocks real cross-retailer price triangulation.

---

## 8. Triangulation engine

Runs hourly at :41 via `triangulate.price` and `triangulate.specs` workflows.

- **price.ts** — reads `sku_source_link` rows per SKU, computes median + p25/p75 + n_sources, upserts `triangulated_price`. Confidence scales with source count. Discrepancies > 15% delta logged to `discrepancy_log`.
- **specs.ts** — per spec key: numeric keys use median consensus; categorical use majority vote. Writes to `sku_spec` with `source_id='triangulated:N'`. Discrepancies logged.
- **discrepancies_open** is 0 right now because most SKUs have 1 source (in-flight — see "Path to multi-source" below).

Key to making triangulation visible: **upcitemdb-enrich** writes per-merchant `sku_source_link` rows for UPC'd SKUs → those SKUs get n_sources ≥ 2 and show in `triangulated_price` with a real p25-p75 range.

---

## 9. Audit pipeline (the ACTIVE mode)

User enters query / URL / text → `POST /audit`:
1. **extract** — Opus 4.7 extracts intent (category + criteria + budget).
2. **search** — parallel: `catalogSearch()` (spine FTS5) + Claude web-search. Noise filter drops ol:/mb:/fda510k:/etc. id-prefixes on non-media intents.
3. **verify** — each AI claim → `workers/api/src/verify/` pipeline. Self-verification pass wired in.
4. **rank** — `rank.ts` deterministic `U = Σ wᵢ · sᵢ`. No LLM.
5. **cross-model** — Claude Managed Agent fans out to GPT-4o / Gemini / Llama. Panel hidden when providers unavailable (D4).
6. **enrich** — B5 signals: scam / breach / price-history / provenance / sponsorship.

Response shape: `AuditResult` in `packages/shared/src/types.ts`. `Candidate` includes `priceSources` / `priceMin` / `priceMax` / `skuId` for the price-story strip.

### UI render order (`apps/web/src/main.ts → renderResult`)
```
headerCard                      # "Lens audit · Category: …"
provenanceCard                  # "How we got this answer" — 6 spine tiles + 6-stage timing
verdictBanner                   # when claims ≠ 0
heroPickCard                    # top pick with price + retailer link
enrichmentsCard                 # scam / breach / price-history / provenance / sponsorship
repairabilityCard               # async iFixit fetch
criteriaCard                    # each criterion with draggable weight
claimsCard                      # every AI claim annotated
alternativesCard                # tier splits
rankedCard                      # full ranking table with "all sources →" link
crossModelCard                  # what GPT/Gemini picked
welfareDeltaCard                # $/utility delta vs AI
profileCard                     # saved category preferences with weight bars
elapsedFooter                   # total ms
```

---

## 10. Surfaces (VISION §4 — 35 touchpoints)

### Live
- Web dashboard (Pages).
- MV3 extension (content-script sidebars on ChatGPT / Claude / Gemini / Rufus / Perplexity — scaffolding shipped; inline pill + sidebar iframe; last harness-verify was before the provenance-card work).
- MCP server (13 tools, JSON-RPC 2.0).
- Public REST API (32 paths; `/openapi.json` + `/docs`).
- Lens Score embed (`<script src="embed.js">`).
- Public disagreement ticker (`/ticker`).
- Weekly digest email (Resend; hourly cron dispatches for users whose preferred day/hour matches).
- Push notifications (Web Push VAPID; subscribe endpoint live).

### PWA
- Manifest + service worker + share_target + camera capture are wired in `apps/web/public/manifest.webmanifest` + `apps/web/src/sw.ts`. iOS AHS path documented; no native wrapper yet.

### Not demo-verified this burst
- Mobile PWA on real phone.
- Extension content-script on live retailer pages (harness-verify was blocked on Windows CDP all session — see §13).

---

## 11. Pack system

`packs/` has 120 files, 59 category + 24 dark-pattern + 15 regulation + 14 fee + 8 intervention.

`pack.maintenance` cron runs weekly, rotating:
- **validator** — schema check, every pack must parse against `packs/schema/*.json`.
- **enricher** — Opus 4.7 writes missing `aliases_json` / `summary` / `category_parent_code`.
- **reg-watcher** — scans `regulation_events` for new rules, drafts pack updates.

Zero affiliate-tagging enforced by CI grep rule (per VISION §13).

---

## 12. Opus 4.7 capability usage (rubric 25%)

| Capability | Location | How it's used |
|---|---|---|
| Adaptive extended thinking | `workers/api/src/anthropic.ts → opusExtendedThinking()` | Every Opus call in audit, extractor, pack enricher, self-verify. |
| Server-side web search | `workers/api/src/search.ts` | Researcher node fans out live product search. |
| 1M context | Auditor step | All candidates + all claims + all pack content in one prompt. |
| Vision (3.75MP) | `/visual-audit` endpoint | Parses uploaded product photos / screenshots. |
| Claude Managed Agents | Cross-model fan-out; long-running pack maintenance | GPT / Gemini / Llama called through managed agent. |
| **Opus 4.7 structured JSON extraction (new)** | `resolve-url.ts → extractViaOpus()` | Replaces regex when parsing Jina-markdown from retailer pages. 20KB body in, 1500-tok structured JSON out (warranty/country/UPC/EAN/specs/…). KV-cached 24h. |

---

## 13. Known gaps — honest list

### Blocked on tooling
- **Harness-verify on `lens-b1h.pages.dev`** — blocked by Windows CDP / browser-harness singleton issues all session. Every visible change went out unverified visually. **Recommend**: do a manual pass in Chrome DevTools (mobile viewport too) on the preview URL `https://01e6f496.lens-b1h.pages.dev` before promoting to production.

### Needs small follow-up
- **CF Pages production alias** — `git-provider: No`. Pushes to `main` don't auto-deploy. Either connect the repo to the Pages project in the CF dashboard, or accept `wrangler pages deploy dist` after every web change. The unique preview URL from the last deploy is `https://01e6f496.lens-b1h.pages.dev`; confirm + promote in the dashboard.
- **Best Buy sitemap URL→name quality** — `humanizeFromUrl` picks long URL slugs, which sometimes match marketing pages ("All Members", "20th Anniversary") rather than product titles. The enricher cron (fetch each URL + Opus-extract) is the intended hydration path but hasn't been scheduled for live-sitemap-inserted rows yet. Recommend: schedule a per-SKU hydration cron pointed at new BestBuy URLs.
- **Audit returns web-search-only candidates** when the spine has no matching SKUs for the category. Shows up as price-story "one source so far" or "triangulated across N retailers" absent. Fix path: get more BestBuy / retailer sitemap rows into `sku_catalog` so catalog search matches. In flight — rotate round-robin a few more hours.
- **Healthy-but-zero ingesters** (see §7): eu-eprel, ftc-enforcement, manufacturer-sitemaps, openbeautyfacts — each is a small UA / gzip / transient-SSL fix.

### Not started
- **Demo video** (hackathon rubric 25% — the biggest single deliverable left). 8 recorded beats per VISION §10:
  1. Inline on ChatGPT with the ◉ Lens pill unfurling a sidebar.
  2. Dark-pattern hotel catch (marriott.com resort fee → FTC Junk Fees Rule).
  3. Recall push notification (CPSC Roborock recall + Magnuson-Moss letter).
  4. Welfare-delta money shot ("Lens picks +$312, +0.15 utility over AIs").
  5. Cross-model disagreement panel.
  6. Mobile PWA voice / camera.
  7. MCP tool call from external Claude.
  8. Public disagreement ticker (ProPublica-style query).
  Hard 3:00 cut. Record in OBS / Screen Studio; upload to YouTube unlisted.
- **Submission form** — DevPost (or wherever the hackathon submission lives): title, tagline, description, video link, GitHub URL, team members, Opus-4.7-feature list.

---

## 14. Runbook (daily operations)

### Deploy API worker
```bash
cd workers/api && npx wrangler deploy
```

### Deploy Pages (manual!)
```bash
cd apps/web && npx vite build
npx wrangler pages deploy dist --project-name=lens --branch=main --commit-dirty=true
```

### Check spine live
```bash
curl -s https://lens-api.webmarinelli.workers.dev/architecture/stats | python -m json.tool
curl -s https://lens-api.webmarinelli.workers.dev/architecture/sources | python -m json.tool
```

### Manually trigger an ingester
```bash
curl -sS -X POST https://lens-api.webmarinelli.workers.dev/architecture/trigger/<ingester-id> | python -m json.tool
```
Replace `<ingester-id>` with any row from `/architecture/sources`. Examples: `slickdeals`, `upcitemdb`, `retailer-sitemaps`, `wikidata`.

### Run an audit from CLI
```bash
curl -sS -X POST https://lens-api.webmarinelli.workers.dev/audit \
  -H 'content-type: application/json' \
  -d '{"kind":"query","text":"recommend ANC headphones under $200","userPrompt":"recommend ANC headphones under $200"}' \
  | python -m json.tool
```

### Resolve a retailer URL (Opus-extraction path)
```bash
curl -sS -X POST https://lens-api.webmarinelli.workers.dev/resolve-url \
  -H 'content-type: application/json' \
  -d '{"url":"https://www.amazon.com/dp/B0BTYCRJSS"}' \
  | python -m json.tool
```
Watch for `extractor: "regex+opus"` and a populated `specs` object.

### SKU detail
```bash
# JSON API
curl -s https://lens-api.webmarinelli.workers.dev/sku/amazon:B0BTYCRJSS | python -m json.tool
# Human UI
open https://lens-b1h.pages.dev/sku.html?id=amazon:B0BTYCRJSS
```

---

## 15. Final status line

- **Spine:** 85,918 SKUs · 24 contributing sources (goal was 15, exceeded) · 9,518 recalls · 18,806 regulations · 8,862 brands · 120 packs.
- **Code:** 6 new commits today on top of the improve-D17 / A24 / A12b base.
- **Deployed:** API worker is on `95553a07-…` / `2580eb00-…` / `49c0bada-…` / `bc57c6f6-…` / `c7bb45b9-…` chain (latest version ID in `wrangler deploy` output). Pages production alias **needs manual promotion** from preview `01e6f496.lens-b1h.pages.dev`.
- **Loops:** all stopped. No cron jobs in the session's scheduler. Monitor task stopped.
- **Remaining before submission (26 Apr 8PM EDT):** demo video, manual harness pass on Pages, Pages production alias promotion, DevPost submission form.

— end of handoff
