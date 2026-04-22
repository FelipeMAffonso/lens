# Lens — Gap Analysis

**Written:** 2026-04-21, after a deep read of every md file + every source file in the repo.

**Purpose:** Catalogue exactly what was promised in `docs/VISION.md` + `docs/CONSUMER_WORKFLOWS.md` + `docs/DELIVERY_ARCHITECTURE.md` + `docs/JOURNEY_INTEGRATION.md`, what is actually shipped in code, and why the gap exists. Companion to `BLOCK_PLAN.md`, which closes the gap block-by-block.

---

## 1. What the docs promised

Per `docs/VISION.md`:
- **"The consumer's independent agent across every point of every purchase."**
- Six load-bearing Opus 4.7 capabilities (adaptive thinking, web_search_20260209, 1M context, vision, Managed Agents).

Per `docs/CONSUMER_WORKFLOWS.md`:
- **52 workflows across 9 journey stages** (need emergence → discovery → research → evaluation → decision → delivery → post-purchase → ongoing use → end of life → cross-journey).

Per `docs/DELIVERY_ARCHITECTURE.md`:
- **8 agent types** (Interpreter, Researcher, Auditor, Ranker, Watcher, Advocate, Historian, Translator).
- **6 delivery axes** (Agent role, Activation, Surface, Parsing, Data tier, Consent).
- 13 input modes (query, paste, screenshot, URL, receipt, voice, extension one-click, mobile share-sheet, email forward, native app, right-click context menu, bank-connected receipts, more).
- 5 data tiers with declared consent scope per tier (in-flight / local-only / server-keyed / sensitive-OAuth / cross-user-anonymized).

Per `docs/KNOWLEDGE_ARCHITECTURE.md`:
- Runtime pack composer that **selects applicable packs at request time** and splices prompt fragments into the active Opus call.
- Community pack contribution pipeline with cryptographic signing.

Per `docs/PACK_AGENTS.md`:
- Four autonomous pack-maintenance loops (Validator, Enricher, Regulation Watcher, Product-Page Scraper).

Per `docs/JOURNEY_INTEGRATION.md`:
- Concrete per-stage flows including email ingestion, scheduled cron, delivery verification, recall monitoring, firmware tracking.

Per `README.md` and `SUBMISSION.md`:
- Web dashboard + Chrome extension + API worker + Managed Agent worker as a **unified product**.
- "Every online shopper is in the market" — framing for judges.

---

## 2. What is actually shipped (grounded in file reads)

### 2.1 API surface
`workers/api/src/index.ts` exposes:
- `GET /health`
- `GET /packs/stats`, `GET /packs/:slug`
- `POST /audit` → `runAuditPipeline(input, env)` — a single linear 4-stage pipeline (extract → search‖crossModel → verify → rank).
- `POST /audit/stream` — SSE variant of the same pipeline.
- `POST /review-scan` — deterministic review-authenticity heuristic (no LLM).

That's the entire server contract. **There is no `/passive-scan` route** — the extension POSTs to it but the worker has no handler for it. There is no persistence route, no user route, no webhook, no scheduled-trigger endpoint, no MCP surface.

### 2.2 Web surface
`apps/web/` is a Vite SPA:
- Three paste modes (query / url / text) in a single `<main>` container.
- Photo upload file-input (routes through the same `/audit` call with `kind: "photo"`).
- Live utility sliders re-rank client-side (deterministic math).
- Welfare-delta card + profile export/import card — both read/write `localStorage` keys `lens.history.v1` and `lens.profiles.v1`.
- No auth, no account, no cross-device state, no mobile breakpoints tested beyond CSS media query for 720px.

### 2.3 Extension surface
`apps/extension/` is a Chrome MV3 extension:
- **`manifest.json`**: `host_permissions: ["<all_urls>"]`. Runs content script on every page.
- **`content.ts`**: passive DOM scan for 7 regex/selector families (`URGENCY_PATTERNS`, `SCARCITY_PATTERNS`, `CONFIRMSHAME_PATTERNS`, `HIDDEN_COST_KEYWORDS`, `FORCED_CONTINUITY_PATTERNS`, preselected checkboxes, sneak-into-basket). Renders a fixed-position overlay badge when hits fire.
- **`popup.js`**: two buttons. "Audit this page" either extracts last assistant message from ChatGPT/Claude/Gemini/Amazon DOM **and opens a new tab at lens-b1h.pages.dev with searchParams** (`?mode=text&source=...&raw=...`), or opens a new tab with the page URL if not an AI-chat host. "Re-scan for dark patterns" re-runs `scanDocument()`.
- **`background.ts`**: MV3 service worker that stashes per-tab hits in memory (`hitsByTab`) and can proxy an `/audit` call. Nothing persistent.

**Critical observation:** the extension is a launcher that opens lens-b1h.pages.dev with URL-encoded context. It does not render UI inline on the host page, it does not intercept AI responses, it does not keep session state.

### 2.4 Cross-model surface
`workers/cross-model/` is a second worker:
- `POST /fanout` fans out to `gpt-4o`, `gemini-2.5-flash`, `meta-llama/llama-3.3-70b-instruct` via `Promise.allSettled`.
- Opus 4.7 runs a 2-3 sentence synthesis on top of the results.
- Called from the main `/audit` pipeline via `CROSS_MODEL_AGENT_URL`.

### 2.5 Pack surface
- 116 JSON files in `packs/`.
- `scripts/bundle-packs.mjs` concatenates them into `workers/api/src/packs/all.generated.ts` at build time.
- `workers/api/src/packs/registry.ts` builds 5 indexed Maps at module load (`bySlug`, `categoriesByAlias`, `darkPatternsByPageType`, `regulationsByJurisdiction`, `feesByCategoryContext`).
- `workers/api/src/packs/prompter.ts` formats per-type prompt fragments (criteria, confabulation patterns, normalization rules, dark patterns, regulations, fees) with per-fragment token caps.

The pack registry works. The composition is real. But packs are immutable per build; runtime retrieval happens but there is no runtime mutation, no incremental enrichment, no per-request source refresh.

### 2.6 Storage surface
- **Server-side: nothing.** `workers/api/wrangler.toml` has `[[kv_namespaces]]` and `[[r2_buckets]]` commented out. No D1 binding. No secrets store beyond Anthropic/OpenAI/Google/OpenRouter API keys.
- **Client-side: `localStorage`.** Two keys: `lens.profiles.v1`, `lens.history.v1`. Capped at 50 history entries. Export/import via download JSON file.

### 2.7 Pack-maintenance surface
- `.github/workflows/pack-maintenance.yml` — weekly GitHub Action (Monday 06:13 UTC):
  - `schema-validate` — `scripts/validate-pack-schema.mjs` (no API key needed).
  - `llm-judge` — `scripts/validate-packs.mjs` (requires `ANTHROPIC_API_KEY` secret; LLM-as-judge on each evidence entry).
  - `regulation-watcher` — `scripts/check-regulation-status.mjs` (requires key; uses web_search to check status of each regulation pack).
- Optional: `scripts/enrich-pack.mjs` runs on-demand or via a cron not currently wired in CI.
- Product-page scraper (Agent 4 in the docs) is **not built.**

### 2.8 Demo fixtures
- 3 scenarios in `fixtures/scenarios/*.json` (espresso / laptop / headphones).
- `workers/api/src/fixtureCatalog.ts` has hand-crafted 5-product catalogs for 5 categories (espresso, laptops, headphones, coffee makers, robot vacuums).
- 21 category packs additionally carry `representativeSkus[]` arrays that `search.ts` reads in fixture mode.

---

## 3. Quantitative gap

| Dimension | Promised | Shipped | Gap |
|---|---|---|---|
| Workflows | 52 | ~9 (W8, W10, W11, W12, W14, W15, W20, W28 partial, W32 local-only, W50 local-only) | **83%** |
| Agent types | 8 | 3 (Interpreter, Researcher, Auditor — all in the Worker; Ranker is deterministic math) | **62%** |
| Journey stages covered | 9 | 3 (Stage 1 partial, Stage 2, Stage 3 partial) | **67%** |
| Input modes | 13 | 5 (query, text, image, url, photo — all via `/audit`) | **62%** |
| Data tiers | 5 | 2 (Tier 0 in-flight + Tier 1 localStorage; Tier 2/3/4 not shipped) | **60%** |
| Delivery surfaces | Web + extension + mobile + email + cron + public API + MCP | Web + extension-as-launcher + pack-maintenance cron | **~60%** |
| Scheduled workflows (Watchers) | Recall monitoring, price drop, firmware, subscription renewal, replacement reminder | **0** | **100%** |
| Autonomous actions (Advocates) | Price-match filing, subscription cancel, FTC complaint, return draft | **0** (templates exist in packs; no runtime) | **100%** |
| Longitudinal state (Historian) | Welfare delta, preference learning, purchase history | localStorage only, single device | **~80%** |
| Community features (Ticker, Score API, Family profiles) | Public dashboard + embeddable score | **0** | **100%** |
| Pack-maintenance agents | 4 | 3 (Validator, LLM-judge, Regulation-watcher; no Product-Page Scraper) | **25%** |

---

## 4. Architectural root causes

1. **No server-side user state.** No auth, no D1, no KV, no R2 bucket. Every workflow that needs "Lens knows who you are and what you own" is structurally blocked at the infrastructure level.
2. **Extension is a tab-launcher, not an inline agent.** The content script injects a *notification overlay* but not a *sidebar UI*. The popup opens lens-b1h.pages.dev in a new tab with URL params. That is a fundamentally different product shape from "ambient agent next to the AI answer."
3. **The audit pipeline is a single linear function.** `runAuditPipeline` takes one input, does four steps, returns one result. There is no DAG, no event bus, no scheduler, no cancellation. Adding a new workflow currently means adding code inside `pipeline.ts`.
4. **Packs are compile-time constants.** `ALL_PACKS` is baked into `all.generated.ts` at build. Packs cannot self-update at runtime, cannot pull live feeds, cannot mutate based on user state.
5. **No identity = no Historian.** Welfare-delta is computed client-side from 50 localStorage entries. There is no aggregate, no cross-device, no public ticker. The infrastructure for "show me my last 10 audits across my phone and my laptop" does not exist.
6. **No mobile surface.** No PWA manifest, no service worker, no mobile share-sheet integration, no native app. `styles.css` has one 720px breakpoint. Mobile was not scoped.
7. **No email, no bank, no voice.** Every Tier 3 consent surface (`docs/DELIVERY_ARCHITECTURE.md` Axis 5) is marked roadmap. None has been started.
8. **Passive-scan route is stubbed.** The extension POSTs to `/passive-scan`, `TRACKER.md` says `passive-scan shipped`, but `workers/api/src/index.ts` has no handler for it. This is a documentation-vs-reality gap inside the already-shipped scope.

---

## 5. Why the current artifact reads as "a paste-box website"

Because that is what the UI affords. Every action begins with the user copying or typing text into a `<textarea>` or `<input>`. The mode-switch pretends there are three shapes of input, but each shape still requires the user to *manually shuttle content into Lens*. The extension doesn't change this — its "Audit this page" button opens a new tab prefilled with the content, which is still copy-paste, just automated by the extension.

A real ambient agent would:
- Render inline inside ChatGPT/Claude/Gemini/Rufus conversations with its own response bubble.
- Sit in a browser-extension sidebar that stays open while you shop.
- Watch your email inbox for receipts without you forwarding them.
- Notify you on your phone when a product you own is recalled.
- File a price-match claim for you while you sleep.

None of those exist in the code.

---

## 6. What closing the gap requires

See `BLOCK_PLAN.md`. Foundation blocks (persistence, auth, workflow engine, event bus, extension sidebar infrastructure, PWA) unlock 80% of the remaining workflows. The remaining 20% are per-workflow integration blocks.

Total block count: ~120. Executed sequentially, block-by-block, each block is self-contained with explicit acceptance criteria and delivery-surface coverage.

This document is the baseline. Every block in `BLOCK_PLAN.md` moves a specific gap closer to zero.
