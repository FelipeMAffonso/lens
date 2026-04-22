# Lens — Block Plan

**Mode:** tirelessly, block-by-block, no drift. Built to close 100% of the gap catalogued in `GAP_ANALYSIS.md`.

**Winner calibration** (from inspecting the actual shipped repos of Opus 4.6 hackathon winners):

| Repo | LOC (ts/tsx/py/md) | Files | Stack highlights |
|---|---|---|---|
| CrossBeam (1st) `mikeOnBreeze/cc-crossbeam` | **82,048** | 756 | Next.js 16 + Express 5 + Cloud Run + Vercel Sandbox + Supabase realtime + 28-file skill system + multi-phase agent runs (10-30 min) + voice logs + 13 design iterations |
| Elisa (2nd) `zoidbergclawd/elisa` | **17,690** | 713 | Electron desktop + Node backend (vitest) + React frontend + ESP32-S3-Box3 firmware + Heltec LoRa firmware + PRD + 20+ plan docs + block-based visual IDE |
| PostVisit (3rd) | 349 commits / 7 days | private | cardiologist, full-stack, deployed hospital-ready |

**Lens today:** ~3,500 LOC src + ~116 pack JSONs + 12 docs. One pipeline. One web SPA. One tab-launching extension. No persistence. No auth. No scheduler. No ambient integration. **This is ~5% of what's needed.**

**Target by Sun Apr 26 8PM EDT:**
- **≥ 60,000 LOC** of real src (not including packs, docs, fixtures).
- **52/52 workflows live in at least one delivery surface**; ambient surfaces (extension inline sidebar, email ingestion, mobile PWA, MCP) cover ≥ 20 workflows each.
- **Persistent server-side state** (D1 + KV + R2) keyed to per-user identity.
- **Runtime workflow graph** — DAG executor with pluggable workflows, event bus, scheduler, cancellation.
- **4 fully-operating agent loops** (Validator, Enricher, Regulation Watcher, Product Scraper) + **at least 8 Watcher workflows** firing on cron.
- **MCP server** so external AI agents can call Lens.
- **Public disagreement ticker** and **Lens Score API**.
- **Three demo scenarios** recorded live against real retailer + AI-chat pages.
- ≥ 2,000 automated tests (Vitest + Playwright).

This file enumerates every block required to reach that target. Execute in order. Mark each block ✅ in `CHECKLIST.md` on completion.

---

## Naming

Block IDs: `<GROUP>-<NUM>` where GROUP is `F` (foundation), `S0..S8` (stage-N), `CJ` (cross-journey), `V` (variant surfaces), `A` (agent loops), `P` (polish/ops), `DEMO` (demo build).

---

## Part A — Foundation (prereq for everything)

### F1 — Server-side identity & auth

**Scope:** Introduce a minimal per-user identity anchor. Magic-link email (Resend) + anonymous device-keyed fallback. JWT session cookie scoped to `.pages.dev` and `.workers.dev`.

**Files to create:**
- `workers/api/src/auth/session.ts` — JWT sign/verify, cookie helpers.
- `workers/api/src/auth/magic-link.ts` — `/auth/request`, `/auth/verify` endpoints, Resend integration.
- `workers/api/src/auth/anon.ts` — device-keyed opaque IDs for pre-auth state.
- `packages/shared/src/auth.ts` — session + user types.
- `apps/web/src/auth/` — sign-in modal, session provider, whoami hook.

**Acceptance:** user opens lens-b1h.pages.dev → optional "sign in to sync" banner → enters email → receives magic link → clicks → session cookie set → whoami returns `{userId, email, createdAt}`. Without sign-in, an anonymous `anonUserId` is minted and persisted in localStorage + sent as `x-lens-anon-id` header.

### F2 — Persistence: D1 + KV + R2

**Scope:** Bind `LENS_D1`, `LENS_KV`, `LENS_R2` in `wrangler.toml`. Write migration scripts. Create ORM layer.

**Files:**
- `workers/api/migrations/0001_init.sql` — `users`, `sessions`, `audits`, `preferences`, `watchers`, `purchases`, `interventions`, `welfare_deltas`, `ticker_events`.
- `workers/api/src/db/client.ts` — thin D1 wrapper with typed queries.
- `workers/api/src/db/repos/*.ts` — one repo per table.
- `workers/api/wrangler.toml` — uncomment + populate bindings with actual namespace IDs.

**Acceptance:** `wrangler d1 execute` applies migration; seed script creates one user + three audits; unit test round-trips each repo.

### F3 — Workflow engine (runtime DAG)

**Scope:** Replace single linear `runAuditPipeline` with a **workflow engine** that executes named DAGs.

**Files:**
- `workers/api/src/workflow/engine.ts` — `class WorkflowEngine`, executes a `WorkflowSpec` with nodes + edges + conditional branches + parallel groups.
- `workers/api/src/workflow/spec.ts` — `WorkflowSpec` type with `nodes`, `edges`, `input`, `output`, `retry`, `timeout`.
- `workers/api/src/workflow/context.ts` — per-run context object (emit events, read state, cancel).
- `workers/api/src/workflow/registry.ts` — workflow registration (`registerWorkflow(id, spec)`).
- `workers/api/src/workflow/runs.ts` — persisted run log in D1 with nodeId, status, startedAt, completedAt, output snapshot.
- `workers/api/src/workflow/events.ts` — event bus (pub/sub). Workflows can emit and subscribe.

**Acceptance:** three workflows registered (`audit.text`, `audit.query`, `audit.url`), each defined as a DAG of extract → {search ‖ crossModel} → verify → rank nodes, each run logged to D1, cancellation works end-to-end, SSE stream pulls events off the bus.

### F4 — Cron + scheduler primitives

**Scope:** Cloudflare Cron Triggers wired into `wrangler.toml` with a dispatcher that routes cron invocations to workflow engine runs.

**Files:**
- `workers/api/wrangler.toml` — `[triggers] crons = ["*/15 * * * *", "7 * * * *", "13 6 * * 1"]`.
- `workers/api/src/cron/dispatcher.ts` — maps each cron pattern to a workflow ID.
- `workers/api/src/cron/jobs/*.ts` — one file per scheduled workflow.

**Acceptance:** `wrangler tail` shows cron firings; each run is persisted.

### F5 — Event bus + webhook surface

**Scope:** In-worker pub/sub for cross-workflow events + public webhook registration so external services can trigger Lens workflows.

**Files:**
- `workers/api/src/events/bus.ts` — type-safe event bus.
- `workers/api/src/webhooks/*.ts` — `POST /webhook/:id` dispatches to workflow engine.

**Acceptance:** subscribing to `audit.completed` event inside the Historian workflow works; external webhook fires a `recall.published` event that enqueues recall-match runs.

### F6 — Extension inline sidebar infrastructure

**Scope:** Build a **content-script-injected sidebar** (iframe or Shadow-DOM panel) that renders alongside AI chat UIs and retailer pages. Sidebar is position-fixed right, toggleable, remembers open/closed per-origin.

**Files:**
- `apps/extension/sidebar/index.html` + `/sidebar/index.tsx` — the sidebar UI (Vite build).
- `apps/extension/sidebar/App.tsx` — routes: audit-inline, checkout-scan, price-history, welfare-snapshot.
- `apps/extension/content/injector.ts` — injects `<iframe src="chrome-extension://{id}/sidebar/index.html">` into host DOM.
- `apps/extension/content/bridge.ts` — `postMessage` bridge between host page + sidebar.

**Acceptance:** on chatgpt.com, a Lens pill button appears in the bottom-right of any AI response bubble. Click → sidebar slides in with the audit card. On amazon.com/cart, sidebar auto-opens with dark-pattern hits and true-total-cost breakdown.

### F7 — Extension overlay & badge system

**Scope:** Upgrade the existing `renderBadges()` overlay into a **toast + slot system** with slot-aware placement (bottom-right, top, next-to-element), animation, a11y-safe (`role=alert`), dismissible, stacking. Also inline badges that attach to specific DOM nodes (pre-selected checkbox: insert badge after node).

**Files:**
- `apps/extension/overlay/toast.ts`, `/overlay/inline-badge.ts`, `/overlay/snackbar.ts`.
- `apps/extension/overlay/styles.css` — shadow-DOM-scoped CSS.

**Acceptance:** ≥ 5 overlay shapes tested across 10 retailer page samples.

### F8 — Extension content-script router

**Scope:** Route scan logic based on host + page type. ChatGPT/Claude/Gemini/Rufus/Perplexity → AI-chat extractor. Amazon/BestBuy/Walmart/Target/Shopify-detected → retailer parser. Gmail/Outlook web → receipt detector.

**Files:** `apps/extension/content/router.ts`, `apps/extension/content/hosts/*.ts` (one file per host).

**Acceptance:** 12 host adapters (ChatGPT, Claude, Gemini, Rufus, Perplexity, Amazon, Best Buy, Walmart, Target, Costco, Home Depot, Shopify-generic).

### F9 — PWA web + mobile layout

**Scope:** Convert `apps/web` into a PWA with service worker, manifest, install prompt, offline shell, mobile-first layout.

**Files:** `apps/web/public/manifest.webmanifest`, `apps/web/src/sw.ts`, `apps/web/src/mobile/*.tsx` (responsive layout rework).

**Acceptance:** Lighthouse PWA score ≥ 95; install prompt surfaces on Chrome/Android and Safari/iOS Add-to-Home-Screen works; mobile layouts render cleanly at 360px width.

### F10 — Mobile share-sheet ingestion

**Scope:** Implement `share_target` manifest for PWA so the Android system share sheet routes into Lens with the shared text/image.

**Files:** manifest addition + `apps/web/src/routes/share.tsx` (destination page that parses the shared content and calls `/audit`).

**Acceptance:** screenshot ChatGPT on Android → share → Lens → audit renders.

### F11 — Voice input

**Scope:** Whisper-compatible transcription flow. Use Deepgram streaming API (or Groq Whisper fallback) for server-side transcription; browser WebAudio for capture.

**Files:** `apps/web/src/voice/recorder.tsx`, `workers/api/src/voice/transcribe.ts` (POST /voice/transcribe).

**Acceptance:** "press to talk" button in query mode; transcription populates the textarea.

### F12 — Email inbox ingestion (OAuth)

**Scope:** Gmail OAuth + inbox polling cron. On user consent, Lens reads inbox subject-line filtered for receipts, extracts structured purchase data via Opus 4.7.

**Files:**
- `workers/api/src/email/gmail-oauth.ts` — OAuth2 dance.
- `workers/api/src/email/poller.ts` — cron-driven poll.
- `workers/api/src/email/extractor.ts` — Opus 4.7 receipt parsing with vision fallback.
- `workers/api/src/workflow/email-ingest.ts` — workflow spec.

**Acceptance:** user OAuths Gmail → past 90 days of receipts parsed → `purchases` table populated with ≥ 100 rows in realistic test.

### F13 — Plaid bank connection (optional Tier 5)

**Scope:** Plaid Link component + Transactions endpoint for users who opt in. Map transactions to product purchases using merchant+amount heuristics.

**Files:** `apps/web/src/plaid/Link.tsx`, `workers/api/src/plaid/*.ts`.

**Acceptance:** link sandbox account → fetch 30 days transactions → auto-match to existing `purchases` rows + propose new matches.

### F14 — MCP server

**Scope:** Lens exposed as an MCP server so external agents (Claude Desktop, Claude Code itself, other agent frameworks) can call `lens.audit`, `lens.spec_optimal`, `lens.dark_pattern_scan`, `lens.regulation_lookup`, `lens.pack_get`, `lens.pack_list`.

**Files:** `workers/mcp/src/index.ts` + `wrangler.toml` + resource/tool manifest.

**Acceptance:** `claude mcp add lens <url>` → `claude` session can call `lens.audit` end-to-end.

### F15 — Public Lens Score API

**Scope:** Publishers embed a Lens-computed score next to any product via a script tag. Script calls `GET /score?url=...&criteria=...` returning `{score, breakdown, packVersion}`. Cached per-URL.

**Files:** `workers/api/src/public/score.ts`, `apps/embed/lens-score.js` (the CDN-hosted snippet).

**Acceptance:** test page embeds snippet → score renders client-side from API.

### F16 — Public disagreement ticker

**Scope:** Aggregate audits across consented users into a public dashboard showing per-model per-category agreement rates.

**Files:** `workers/api/src/ticker/aggregator.ts`, `apps/web/src/routes/ticker.tsx`.

**Acceptance:** dashboard shows `{ChatGPT vs Lens disagrees in 38% of espresso queries (n=41)}` with k-anonymity enforcement (k≥5 for any cell).

### F17 — Observability: structured logging + traces

**Scope:** Every workflow node emits structured log + OpenTelemetry-style span. Logs land in Cloudflare Logs (Workers Logs / Logpush) + aggregated into a Grafana-compatible endpoint.

**Files:** `workers/api/src/obs/log.ts`, `workers/api/src/obs/trace.ts`.

**Acceptance:** trace view for a single audit shows every node + duration + token usage + pack slugs hit.

### F18 — Authenticated rate limiting

**Scope:** Durable Objects counter per user/IP. Tier A (anon): 30 audits/day. Tier B (signed-in): 500/day.

**Files:** `workers/api/src/ratelimit/*.ts` + DO binding in `wrangler.toml`.

**Acceptance:** 31st anonymous audit returns 429.

### F19 — Secrets + env parity

**Scope:** `.dev.vars.example` updated for every new secret; wrangler secret set for prod. GitHub Actions secrets mirrored.

**Files:** `.dev.vars.example`, docs update.

**Acceptance:** fresh clone + `cp .dev.vars.example .dev.vars` + `wrangler dev` boots without manual discovery.

### F20 — Testing infrastructure

**Scope:** Vitest for workers + packages; Playwright for end-to-end (web + extension); Python for smoke tests against real hosts.

**Files:**
- `workers/api/src/**/*.test.ts` colocated.
- `apps/web/tests/e2e/*.spec.ts`.
- `apps/extension/tests/e2e/*.spec.ts`.
- `tools/smoke-test/run.mjs`.

**Acceptance:** `npm test --workspaces` runs ≥ 50 tests green on Day 2; target ≥ 2,000 tests total by submit.

---

## Part B — Per-workflow blocks

Each workflow listed in `docs/CONSUMER_WORKFLOWS.md` gets its own block. Each block specifies: the workflow spec (DAG), the data tier, the surfaces it must ship in, and test cases.

### Stage 0 — Need emergence (5)

#### S0-W1 — Ad-influence traceback
- **Workflow:** `ad-trace.lookup`. Input: product URL. Output: likely attribution chain (ad network, affiliate tag, influencer ID, ref= source).
- **Agents:** Researcher (WebSearch) + Auditor (claim verifier).
- **Surfaces:** extension inline badge on any product URL with referrer; web route `/trace?url=`.
- **Files:** `workers/api/src/workflows/ad-trace.ts`, `apps/extension/content/detect-referrer.ts`, `apps/web/src/routes/trace.tsx`.
- **Acceptance:** 10 test URLs → accurate attribution summary on ≥ 7.

#### S0-W2 — Scheduled replacement reminders
- **Workflow:** `replacement.watch`. Cron: daily. Scans `purchases` for rows with `category.replacementCycleDays` elapsed.
- **Agents:** Watcher + Historian.
- **Surfaces:** email digest + PWA push notification + dashboard card.
- **Files:** `workers/api/src/workflows/replacement-watch.ts`, `apps/web/src/routes/reminders.tsx`.
- **Acceptance:** seed 10 purchases with fake dates → cron fires → 3 reminders dispatched.

#### S0-W3 — Trigger-based purchase alerts
- **Workflow:** `alert.watch`. User sets criteria + budget threshold. Cron daily searches live web for matches.
- **Agents:** Watcher + Researcher + Ranker.
- **Surfaces:** dashboard card + email + PWA push.
- **Files:** `workers/api/src/workflows/alert-watch.ts`, `apps/web/src/routes/alerts/*`.
- **Acceptance:** set criteria (`espresso, price<$300, pressure>=15`) → next-day cron catches seeded fake match.

#### S0-W4 — Pre-need category onboarding
- **Workflow:** `onboard.category`. User types "I'm moving to SF, need apartment essentials" → tool produces budget-partitioned essentials list.
- **Agents:** Interpreter + Researcher + Ranker.
- **Surfaces:** web wizard.
- **Files:** `workers/api/src/workflows/onboard-category.ts`, `apps/web/src/routes/onboard.tsx`.
- **Acceptance:** 5 onboarding scenarios produce plausible essentials lists.

#### S0-W5 — Subscription discovery
- **Depends on:** F12.
- **Workflow:** `subs.discover`. Scans Gmail inbox for subscription confirmations/renewals.
- **Surfaces:** dashboard subscriptions pane + cancellation drafting drill-through.
- **Acceptance:** seed inbox fixture → extract ≥ 8 known subscriptions.

### Stage 1 — Discovery (4)

#### S1-W6 — Category exploration
- **Workflow:** `explore.category`. User types a category → tool maps frontier along criteria axes.
- **Surfaces:** web route `/explore/:category`.
- **Acceptance:** spec-space map for espresso, laptops, headphones returns ≥ 10 anchors.

#### S1-W7 — Lifestyle bundles
- **Workflow:** `bundle.propose`. "Empty apt, $2000" → proposes furniture bundle with substitution tiers.
- **Surfaces:** web wizard.
- **Acceptance:** 3 scenarios produce cohesive bundles + swap suggestions.

#### S1-W8 — Preference elicitation ★ (already live, expand)
- **Extension:** add adaptive Layer 2 clarification. When any weight has confidence < 0.6, fire 2-4 binary trade-off questions. UI: modal inline in the paste-box with radio choices. Re-run extract with answers fed in.
- **Files:** `workers/api/src/workflows/preference-elicit.ts`, `apps/web/src/components/ClarifyModal.tsx`.
- **Acceptance:** ambiguous query ("something fast for work") triggers 3 clarifying questions.

#### S1-W9 — Comparative framing help
- **Workflow:** `compare.framings`. "Mirrorless vs DSLR for a beginner" → Opus 4.7 produces trade-space table.
- **Surfaces:** web route.
- **Acceptance:** 6 comparison scenarios return structured trade-space.

### Stage 2 — Research (4)

#### S2-W10 — Spec-optimal ★ (live; deepen)
- **Add:** vendor vs independent weighting (W13 integration), per-source trust score per candidate row, sort-by-rank alternate orderings.
- **Acceptance:** hovering rank row surfaces "why #1 beats #2" delta explanation with per-criterion contribution.

#### S2-W11 — Alternatives at tiers (live; deepen)
- **Add:** budget-tier multi-scenario (50/75/100/150%) + trade-off-tier (different-criteria-winner) card.
- **Acceptance:** espresso query returns 4-tier grid.

#### S2-W12 — Cross-assistant ★ (live; migrate to Managed Agent)
- **Migrate:** `workers/cross-model` → Claude Managed Agent. Rewrite the fanout as a Managed Agent invocation with long-running handoff.
- **Acceptance:** same API response shape; agent ID returned; agent run visible in Anthropic console.

#### S2-W13 — Vendor vs independent source weighting
- **Workflow:** `source.weight`. Settings UI with slider for "trust manufacturer" vs "trust independent" (0-100%). Applied downstream in verify + rank.
- **Surfaces:** web settings panel + per-audit override.
- **Acceptance:** moving slider changes claim verdict probabilities visibly.

### Stage 3 — Evaluation (7)

#### S3-W14 — AI recommendation audit ★ (live; expand surfaces)
- **Add:** extension inline sidebar rendering (F6), full audit-card renders next to ChatGPT response bubble.
- **Acceptance:** real ChatGPT conversation → click pill → sidebar audit card renders in < 20s.

#### S3-W15 — Single-URL evaluation (live; deepen parser)
- **Replace:** cheap HTML stripper with **per-host DOM parsers** for Amazon, Best Buy, Walmart, Target, Home Depot, Shopify-detected, + heavyweight semantic fallback.
- **Files:** `workers/api/src/parsers/hosts/*.ts`.
- **Acceptance:** 50 real product pages across 8 retailers parse cleanly.

#### S3-W16 — Source provenance
- **Workflow:** `provenance.verify`. For every cited URL inside an AI recommendation: fetch, parse, verify the cited claim is actually on the page, flag if page is affiliate-compensated (detect via `rel=sponsored`, Amazon partner links, ShareASale tags).
- **Acceptance:** 20 test AI answers with cited URLs → correct provenance verdicts.

#### S3-W17 — Review authenticity (live heuristic; add LLM layer)
- **Extend:** add optional `?llm=1` switch that runs Opus 4.7 second stage to corroborate heuristic signals with actual review text.
- **Add:** per-review flagging in UI (red strikethrough on suspect reviews).
- **Acceptance:** Amazon review list (fixture) → flags 3/5 planted fakes.

#### S3-W18 — Counterfeit / grey-market check
- **Workflow:** `counterfeit.assess`. Product URL + seller → checks seller age, feedback distribution, image reverse-lookup, price-too-low threshold per category.
- **Agents:** Researcher + Auditor (vision for image lookup).
- **Surfaces:** extension inline badge on marketplace listings.
- **Acceptance:** 10 seeded grey-market listings flagged correctly.

#### S3-W19 — Sponsorship scanner
- **Workflow:** `sponsor.detect`. For any review article / YouTube video URL → detects affiliate links, sponsored disclosure, undisclosed partnerships.
- **Surfaces:** extension inline overlay on review sites.
- **Acceptance:** 20 tests across YouTube + Wirecutter + TechRadar.

#### S3-W20 — Claim verification ★ (live; no-op reuse)

### Stage 4 — Decision & purchase (8)

#### S4-W21 — Price history + sale legitimacy
- **Workflow:** `price.history`. Scrape or call Keepa / CamelCamelCamel for 90-day history. Flag "30% off" when rolling median is flat.
- **Surfaces:** extension inline overlay on product pages.
- **Files:** `workers/api/src/workflows/price-history.ts`, `apps/extension/content/hosts/amazon-price.ts`.
- **Acceptance:** 20 product samples; fake-sale rate matches Keepa.

#### S4-W22 — Dark-pattern checkout scan ★ (live first-stage; wire the `/passive-scan` endpoint + LLM second-stage)
- **Wire:** add `POST /passive-scan` route in `workers/api/src/index.ts` that runs LLM verification against matched packs + returns inline verdicts.
- **Add:** overlay badge per-pattern (not just single aggregated toast).
- **Add:** direct links from badges to remediation intervention packs.
- **Acceptance:** 15 known dark-pattern pages flag the right patterns + LLM confirms.

#### S4-W23 — Compatibility check
- **Workflow:** `compat.check`. User profile's equipment list + target product → compatibility verdict.
- **Surfaces:** extension inline badge.
- **Acceptance:** MacBook Pro + SSD compatibility tests pass.

#### S4-W24 — True-total-cost
- **Workflow:** `total-cost.compute`. Product URL + user jurisdiction → itemized total (shipping, tax, fees, 1-year operating cost using category pack's `typicalHiddenCosts`).
- **Surfaces:** extension inline card at top of cart page.
- **Acceptance:** espresso machine + Bay Area zip → true cost includes beans + filters + descaling.

#### S4-W25 — Data-disclosure audit
- **Workflow:** `privacy.audit`. For a product/app's privacy policy → Opus 4.7 summarizes data collection, sharing, retention, deletion rights; flags dark patterns in consent flows.
- **Surfaces:** web route + extension inline badge on product pages.
- **Acceptance:** 10 smart-device privacy policies audited.

#### S4-W26 — Breach history
- **Workflow:** `breach.lookup`. Have-I-Been-Pwned + state AG breach notifications → seller's breach history score.
- **Surfaces:** extension inline badge on checkout page.
- **Acceptance:** known-bad seller flagged.

#### S4-W27 — Scam / fraud detection
- **Workflow:** `fraud.assess`. Domain age (WHOIS) + Trustpilot + image reverse-lookup + price-too-low.
- **Surfaces:** extension overlay that blocks progression on suspected scam pages.
- **Acceptance:** 10 known scam sites flagged.

#### S4-W28 — Checkout-readiness summary (aggregation)
- **Workflow:** `checkout.summary`. Aggregates W21-W27 into a single "proceed / hesitate / rethink" verdict with a rationale list.
- **Surfaces:** extension inline card at final checkout step.
- **Acceptance:** matches human-evaluator verdict in 15/20 samples.

### Stage 5 — Delivery & setup (3)

#### S5-W29 — Unboxing / DOA verification
- **Workflow:** `doa.verify`. User uploads unbox photo → Opus 4.7 vision compares against the retailer's listing photos (stored during purchase) → flags substitution / damage → offers Magnuson-Moss return intervention.
- **Surfaces:** web + PWA camera.
- **Acceptance:** 3 test cases (wrong-item + damaged + correct).

#### S5-W30 — Setup instruction aggregation
- **Workflow:** `setup.aggregate`. Aggregates manufacturer manual + iFixit + verified YouTube how-tos.
- **Surfaces:** web route per-purchase card.
- **Acceptance:** 5 product samples return consolidated guide.

#### S5-W31 — Warranty reality check
- **Workflow:** `warranty.reality`. Stated warranty vs actual enforcement (BBB, Reddit, small-claims).
- **Acceptance:** 5 products with known warranty-gotchas flagged.

### Stage 6 — Post-purchase (6)

#### S6-W32 — Welfare-delta analytic (live localStorage; move to server)
- **Migrate:** localStorage → D1 + aggregate cross-device.
- **Add:** per-category breakdown, YoY trend, "if you'd listened to Lens" counterfactual total.
- **Acceptance:** aggregate across ≥ 10 audits renders cross-device.

#### S6-W33 — Recall monitoring
- **Workflow:** `recall.watch`. Cron daily. Polls CPSC, NHTSA, FDA recall RSS feeds. Cross-references against user's `purchases`.
- **Surfaces:** dashboard + email + PWA push + SMS (Twilio) if user opts in.
- **Files:** `workers/api/src/workflows/recall-watch.ts`, `workers/api/src/feeds/cpsc.ts`, `workers/api/src/feeds/nhtsa.ts`, `workers/api/src/feeds/fda.ts`.
- **Acceptance:** seeded user with known-recalled product → receives alert within 1 cron cycle.

#### S6-W34 — Price-drop refund triggering
- **Workflow:** `price-refund.watch`. Cron every 2h. Watches post-purchase prices within each retailer's price-match window. Drafts claim on trigger.
- **Surfaces:** email + dashboard + optional auto-file (delegated autonomous consent).
- **Acceptance:** seeded purchase at $299 → price drops to $259 → claim drafted.

#### S6-W35 — Returns / warranty assistance
- **Workflow:** `return.draft`. Uses `intervention/draft-magnuson-moss-return` pack template. Pre-fills from purchase row.
- **Surfaces:** dashboard + email sender integration.
- **Acceptance:** draft pre-filled + sendable via Gmail API with user consent.

#### S6-W36 — Subscription audit & cancel
- **Depends on:** F12 + S0-W5.
- **Workflow:** `subs.audit`. Lists active subs, flags auto-renew, drafts cancellation letter using `intervention/draft-cancel-subscription` pack.
- **Surfaces:** dashboard subscriptions pane.
- **Acceptance:** 5 seeded subs + 2 cancellation drafts generated.

#### S6-W37 — Performance tracking
- **Workflow:** `perf.log`. User logs post-purchase satisfaction. Feeds back into Layer 4 revealed-preference updating.
- **Surfaces:** dashboard + email follow-up 30 days post-purchase.
- **Acceptance:** satisfaction signal updates user's category weights.

### Stage 7 — Ongoing use (4)

#### S7-W38 — Firmware monitoring
- **Workflow:** `firmware.watch`. Cron weekly per connected-device purchase. Checks manufacturer security bulletins + CVE feeds.
- **Surfaces:** dashboard + email.
- **Acceptance:** test with a known-patched device → correct alert.

#### S7-W39 — Accessory discovery
- **Workflow:** `accessory.discover`. Given owned product + user criteria → compatible accessory ranking.
- **Surfaces:** web route per-product.
- **Acceptance:** 5 owned products → relevant accessory lists.

#### S7-W40 — Lock-in cost tracking
- **Workflow:** `lockin.track`. Aggregates per-ecosystem purchases (Apple App Store, Amazon Prime content, Tesla Supercharging credits) into a running switching-cost figure.
- **Surfaces:** dashboard card.
- **Acceptance:** seeded purchase history → correct ecosystem totals.

#### S7-W41 — Repairability tracking
- **Workflow:** `repair.lookup`. iFixit API + manufacturer parts availability.
- **Surfaces:** dashboard + product card.
- **Acceptance:** 10 products correctly scored.

### Stage 8 — End of life (4)

#### S8-W42 — Resale value estimation
- **Workflow:** `resale.estimate`. eBay sold-listings + Swappa + Back Market + manufacturer trade-in.
- **Acceptance:** 10 products priced within ±15% of actual sold-listings median.

#### S8-W43 — Recycling / disposal routing
- **Workflow:** `dispose.route`. EPA + municipal hazmat + manufacturer take-back programs by zip code.
- **Acceptance:** 10 scenarios across 5 zip codes return correct routes.

#### S8-W44 — Trade-in optimization
- **Workflow:** `tradein.optimize`. Compare retailer trade-in offers + "sell-and-rebuy" math.
- **Acceptance:** 10 products; best option matches manual calc.

#### S8-W45 — Upgrade timing
- **Workflow:** `upgrade.timing`. Usage pattern + replacement market → "upgrade now" / "wait" verdict.
- **Acceptance:** 5 scenarios.

### Cross-journey (7)

#### CJ-W46 — Values overlay
- **Workflow:** `values.weight`. Optional criteria: country-of-origin, union-made, carbon footprint, animal welfare, B-Corp, small-business.
- **Files:** `workers/api/src/workflows/values-overlay.ts`, `apps/web/src/settings/values.tsx`.
- **Acceptance:** 5 values toggled → affect ranking for 10 products.

#### CJ-W47 — Family / household profiles
- **Workflow:** `profile.household`. Multiple profiles per account with per-person overrides.
- **Acceptance:** 3-person household test; shared + overridden categories work.

#### CJ-W48 — Gift-buying mode
- **Workflow:** `gift.mode`. User + recipient link. Recipient fills constraints; giver gets audit-shaped output.
- **Acceptance:** shared-link flow works end-to-end.

#### CJ-W49 — Group-buy pooling
- **Workflow:** `groupbuy.coordinate`. Find bulk-price break, propose group size, draft invite.
- **Acceptance:** 3 scenarios produce actionable group-buy.

#### CJ-W50 — Profile portability (live localStorage; add server sync + signed JSON)
- **Extend:** server sync with D1 via F2 + signed JSON export with HMAC.
- **Acceptance:** export on laptop → import on phone → preferences match.

#### CJ-W51 — Public disagreement ticker (matches F16)
- **Acceptance:** ticker page renders category / model agreement stats with k-anonymity.

#### CJ-W52 — Lens Score API (matches F15)
- **Acceptance:** embed snippet on a test page returns inline score.

---

## Part C — Delivery-surface variant blocks

Each workflow above needs to work on multiple surfaces. These blocks ensure every surface implements every applicable workflow.

### V-EXT-INLINE — inline sidebar parity
Every workflow in S3-S4 must render inside the extension sidebar (F6). Subtasks:
- V-EXT-INLINE-a: S3-W14 (paste audit) inline on ChatGPT/Claude/Gemini/Rufus/Perplexity.
- V-EXT-INLINE-b: S4-W22 (dark patterns) inline on any checkout page.
- V-EXT-INLINE-c: S4-W24 (true-total-cost) inline on any cart page.
- V-EXT-INLINE-d: S4-W21 (price history) inline on any product page.
- V-EXT-INLINE-e: S3-W17 (review auth) inline on Amazon review list.
- V-EXT-INLINE-f: S3-W18 (counterfeit) inline on marketplace listings.

### V-MCP — MCP tool parity
Every public workflow exposed as an MCP tool (F14). Subtasks per workflow.

### V-API — public API parity
OpenAPI spec documented at `/api/docs` for every public workflow.

### V-EMAIL — email surface
Per-workflow outbound email templates + inbound receipt-forwarding address `lens+receipts@...`.

### V-PWA — mobile PWA parity
Every web route works at 360px; share-sheet ingestion handles text + image + URL.

### V-CLI — CLI client (stretch)
`npx @lens/cli audit <url>` invokes the API.

---

## Part D — Agent loops

### A-VALIDATE — pack schema + LLM-as-judge (live weekly; monitor)
### A-ENRICH — enrichment cron (scripts exist; wire in GH Actions to run daily rotation)
### A-REGWATCH — regulation watcher (live weekly; verify)
### A-SCRAPE — product-page scraper (NEW)
- **Scope:** Weekly sample of top-retailer product pages per category. Detect new marketing phrases not yet in confabulationPatterns. Propose additions.
- **Files:** `scripts/scrape-category-samples.mjs`.
- **Acceptance:** 5 category scrapes produce ≥ 3 proposals.
### A-TICKER — ticker aggregator (cron)
- **Scope:** Re-aggregate disagreement ticker every hour.
### A-NEWS — regulatory news agent
- **Scope:** Daily feed of FTC/FCC/CFPB/EU news → proposed new regulation packs.

---

## Part E — Polish + ops

### P1 — Design system
- Typography scale, spacing scale, color ramp, dark-mode tokens, component library (Radix + Tailwind). Match the Cognitive Traps Repository reference.

### P2 — Landing page redesign
- Hero + three-panel demo GIF auto-loop + problem statement + live-metrics counter ("Audits run today", "Confabulations caught", "Dollars saved").

### P3 — Onboarding flow
- First-run wizard: voice/text preference → sample audit → "see how it works" tour.

### P4 — Empty states + error states
- Friendly empty states for every dashboard card.

### P5 — Accessibility audit
- axe-core passes on every route; keyboard nav; screen-reader labels; color contrast ≥ 4.5.

### P6 — Performance budget
- TTI < 2.5s on 3G; Largest Contentful Paint < 2s.

### P7 — Docs site
- `/docs` route with auto-generated API ref + markdown guides + changelog + contributor handbook.

### P8 — Demo data seeder
- `npm run seed:demo` populates a demo user with 50 audits + 10 purchases + 5 subs + 3 recall watches.

### P9 — Chrome Web Store publishing prep
- Screenshots, copy, manifest tightened (`activeTab` + specific host permissions instead of `<all_urls>`), privacy disclosure.

### P10 — Submission hygiene
- README headline update, SUBMISSION.md refresh, 3-min demo video shotlist (already drafted), repo topic tags, CodeMeta.

---

## Part F — Demo

### DEMO-1 — 3 canonical scenarios (re-record after F6 ships)
- Espresso / Laptop / Headphones — each now inside the extension inline sidebar on the real ChatGPT / Claude / Gemini host.

### DEMO-2 — Dark-pattern catch
- Amazon hotel booking → sidebar shows hidden resort fee + flags FTC Junk Fees violation + one-click FTC complaint.

### DEMO-3 — Recall alert
- User has Roborock S8 in purchases → cron detects CPSC recall → dashboard pings.

### DEMO-4 — Welfare-delta money shot
- Across 10 recorded audits, dashboard card shows "+$312 / +0.15 utility vs the AIs' picks".

### DEMO-5 — Cross-assistant disagreement
- Live at submission: Lens pick vs GPT-4o vs Gemini-2.5 vs Llama-3.3 on the same espresso query.

### DEMO-6 — The 3-minute video
- Stitches above 5 beats into a recorded 2:55 video. Voice-over + cursor overlay + zoom cuts. Hard-cap 180s.

---

## Execution order (first 40 blocks, in order)

1. F20 testing infra (so everything else can be tested).
2. F1 auth + F2 persistence + F3 workflow engine (parallel).
3. F17 observability.
4. F6 extension sidebar infra.
5. F7 overlay + F8 router.
6. F9 PWA + mobile.
7. F4 cron.
8. F5 events + webhooks.
9. A-VALIDATE A-REGWATCH wired to cron dispatcher.
10. S3-W14 inline on ChatGPT (first demo beat).
11. S4-W22 `/passive-scan` wired end-to-end.
12. S4-W21 price history via Keepa.
13. S4-W24 true-total-cost.
14. S6-W33 recall watcher (second demo beat).
15. S6-W32 welfare-delta migrated to D1.
16. F12 Gmail OAuth + S0-W5 subscription discovery.
17. S6-W36 subscription audit + cancel drafting.
18. S2-W12 migrate cross-model to Managed Agent.
19. F14 MCP server.
20. F15 Lens Score API.
21-28. Remaining S3 workflows (W15, W16, W17, W18, W19, W20).
29-35. Remaining S4 workflows (W23, W25, W26, W27, W28).
36. F16 + CJ-W51 ticker.
37. F11 voice.
38. F10 share-sheet.
39-40. CJ-W46, CJ-W50 values + portability.

After that: remaining S5, S6, S7, S8, CJ blocks in that order; then A-SCRAPE and A-NEWS; then polish P1-P10; then DEMO-1 through DEMO-6 recorded Sat night.

---

## Checklist (live)

See `CHECKLIST.md` — single file tracking every block with ✅/⏳/❌ + last-commit-hash.

---

**No drift. Block by block. The gap closes.**
