# Lens — Handoff (2026-04-24, T-49h to submission)

Full picture of the Lens hackathon project after the 18-commit UX revamp session on 2026-04-23 → 2026-04-24. Previous handoff (`eb86c3e`, Apr 23 19:00 UTC) is preserved in git history but fully superseded by this document.

Submission deadline: **2026-04-26 8PM EDT** (~49 hours from this handoff).

---

## 1. The one-line

**Lens is your AI shopping companion.** One agent that works for you, before / during / after every purchase. You tell Lens what you need, paste what another AI told you, drop any product URL, or attach a photo. Lens consults every frontier model + every retailer + every public dataset and gives you the one answer that actually fits. No sliders (plain-language re-rank). No affiliate links. Ever. Open source MIT.

Source-of-truth docs, in the order a fresh session should read them: `COMPACTION_PROTOCOL.md` -> `LOOP_DISCIPLINE.md` -> `VISION_COMPLETE.md` -> `docs/VISION.md` -> `docs/PREFERENCE_INFERENCE.md` -> `docs/TOUCHPOINT_PLAN.md` -> `IMPROVEMENT_PLAN.md` -> `IMPROVEMENT_PLAN_V2.md` -> `GAP_ANALYSIS.md` -> `AMBIENT_MODEL.md` -> `CHECKLIST.md` -> this file.

Compaction rule: after a compressed/resumed context, do not rely on this handoff alone. Run the repo inventory in `COMPACTION_PROTOCOL.md`, re-open the implementation files/tests for the touched surfaces, then continue from the newest user instruction.

Current user mandate to preserve after compaction: Lens is not a narrow hackathon paste-box. Treat it as the public-release, paper-grade consumer-welfare defense layer across the whole customer journey: derive an editable utility function before recommendations; infer preferences from stated intent, adaptive clarification, explicit edits, category priors, saved profiles, revealed choices, purchase history, and cross-category meta-preferences with uncertainty visible; make the browser extension first-class for dark patterns, hidden fees, review manipulation, counterfeit/grey-market risk, surveillance-pricing clues, and checkout traps; support price comparison, push notifications, purchase/receipt/recall/subscription monitoring, Amazon/Best Buy/Walmart/Target/Costco/Home Depot/Temu-style comparison, optional Plaid-style financial signals, and full privacy/encryption/user-control transparency from the first screen.

---

## 2. Live deployments

| Surface | URL | Notes |
|---|---|---|
| Web chat | https://lens-b1h.pages.dev | Chat-first home with hero above. Bundle `index-C0GTq19L.js` confirmed live 2026-04-24 ~12:00 UTC. |
| API worker | https://lens-api.webmarinelli.workers.dev | Worker version `9a20fae7-50e2-4d20-998f-f033b68b12ab` with budget-respect + `/rank/nl-adjust` + `/audit/stream` result event. |
| OpenAPI docs | https://lens-api.webmarinelli.workers.dev/docs | Scalar-rendered. |
| Your Shelf | https://lens-b1h.pages.dev/shelf | Static preview with 6 canonical-Sarah-scenario cards. |
| Architecture | https://lens-b1h.pages.dev/architecture.html | Live stats band + source grid + agent grid + cron list. |
| Chrome extension | https://lens-b1h.pages.dev/downloads/lens-extension.zip | MV3 load-unpacked. |
| MCP worker | `workers/mcp/` | 13 tools JSON-RPC 2.0. |

### Repo
- GitHub: `https://github.com/FelipeMAffonso/lens.git` (branch `main`)
- Local: `C:\Users\natal\Dropbox\Felipe\CLAUDE CODE\academic-research\projects\claude-opus-4-7-hackaton\lens`
- npm workspaces (`apps/*`, `packages/*`, `workers/*`)

### Deploy recipes (both verified in-session)
```bash
# Web pages
cd apps/web && npx vite build
npx wrangler pages deploy dist --project-name=lens --branch=main --commit-dirty=true

# API worker
cd workers/api && npx wrangler deploy
```

Note: wrangler pages-deploy inside a loop-session Bash is flaky; some deploys have died between turns. If live bundle hash doesn't match expected, re-fire the deploy command. Worker deploy is reliable (~90s).

---

## 3. The session arc — what shipped, why, when

Start state (inherited from `eb86c3e`): 85,918 SKUs on the spine, 24 contributing data sources, worker + pages live with a paste-box UI + 3-mode tab bar + slider-driven criteria editor. The user critiqued the product as "clunky, not fluid, difficult, unclear" and asked for a full UX revamp: Lens should feel like "the AI Shopping Companion" that "lives with everything the person purchases," with "very smart preference derivation" in natural language, "no sliders," and UX that feels like an Apple product.

The 4-phase plan was locked in turn 1:
1. Identity + chat-first home + kill slider UI
2. Sarah's-day narrative + triangulation chip + NL parser + workflow coverage (photo / any-URL)
3. Your Shelf + judge pass + streaming narration
4. Demo video + DevPost

**All of phases 1-3 + two formal judge passes shipped. Phase 4 (demo video recording + DevPost form) is user-driven and still pending at the time of this handoff.**

### 18 commits, latest first

| Commit | Scope | What shipped |
|---|---|---|
| `fdc42bb` | judge-pass-2 | 2 P1s + 2 P2s from the 2nd formal judge pass: em-dash scrub on new polish copy (voice covenant), strip `lens-api.webmarinelli.workers.dev` from user-facing 5xx error copy, guard preset-click during in-flight NL-adjust, guard seed-chip click during chat generation. |
| `076adc0` | polish-error-specificity | `diagnoseAuditError` helper maps raw error messages to specific recovery copy per failure mode (timeout / stream cutoff / 5xx / 4xx / network / unknown). Replaces the generic "I ran into a problem" catch-all. |
| `d3ed7fe` | polish-nl-adjust-presets | Preset chip row under the NL input: `or try: [make it quieter] [make it cheaper] [more durable] [better battery] [easier to repair]`. Click fills + auto-submits. |
| `cd69a11` | polish-about-this-pick | 1-sentence plain-English summary on the hero pick card, computed deterministically from `utilityBreakdown` (top 2 contributors). Zero extra Opus calls. |
| `0918035` | polish-hero-flash | 900ms pumpkin-accent ring flash on the hero card when NL-adjust changes the top pick name. Respects `prefers-reduced-motion`. |
| `fd40ce7` | rank-budget-respect | Pre-rank filter drops candidates priced above `intent.budget.max * 1.10` (10% grace). Falls back to unfiltered set if filter empties. 4 new tests; 21/21 green. |
| `2834bab` | phase3-polish | Seed chips auto-submit on click (shift-click preserves old fill-only path). One-click demo start. |
| `250bad7` | docs(readme) | Full README rewrite: 4 surfaces table, Your Shelf section, refreshed data-backbone stats (85,918 SKUs · 24 contributing sources · 120 packs · 28 migrations), 5-stage pipeline with `/rank/nl-adjust` call-out, no-affiliate policy section. |
| `7dfffb1` | docs(submission) | `SUBMISSION.md` rewritten end-to-end: new 3:00 demo script follows Sarah's Monday arc across 4 surfaces (chat → extension → shelf → architecture). Rubric mapping updated (245+ commits, 28 migrations, 120 packs, 9 workflows, 7 crons, 112 routes, 13 MCP tools). |
| `1b39b59` | phase3-streaming-narration | `/audit/stream` emits a final `result` event with the full `AuditResult`. Chat-mode runs `streamAudit` instead of a concurrent `/audit` POST (was a double pipeline charge). Rotator gains `setPhrase` for caller-driven labels. Paste-box also de-duped. |
| `68cf6d3` | phase3-judge-fixes | 2 P0s + 4 P1s from the first formal judge pass: photo MIME plumbing (schema `imageMime`, composer HEIC reject, extract.ts drives media_type), hero visible in chat mode (was hidden), NL-adjust `AbortSignal` 20s timeout, URL short-circuit on any turn (not just first), chipsHost re-attach on detached node, "slider-tunable" → "plain-language tunable" (2 spots), shelf FTC case-# reframed as drafted. |
| `a7cc356` | phase3-your-shelf | New `apps/web/public/shelf.html` with 6 canonical-Sarah cards (Breville clean · Roborock RECALL · Sony $47 price-drop · ThinkPad firmware current · Marriott FTC complaint · Netflix auto-renew). Top-nav link + Sarah beat-4 secondary CTA. |
| `70e2d60` | brand-unify | Dropped the "Oracle" secondary brand introduced earlier in the session per user correction ("oracle is an established brand people will get confused"). 8 files touched; all user-facing strings unified as Lens. |
| `f44c188` | phase2-workflow-coverage | Chat composer gains 📎 photo-attach button (png/jpeg/webp, HEIC rejected with iPhone-setting hint). URL detection widened from ~50 hardcoded retailers to any http(s) URL except search engines / social / AI chat / docs / github / etc. Per user mandate that Lens must work for "photo / URL / description / AI paste" equally. |
| `3e510bc` | phase2-sarahs-day | 4-beat day-in-life narrative section between audit result and architecture reveal. Morning ChatGPT / afternoon Marriott resort fee / Friday weekly digest / two-months-later CPSC recall. Inline install CTAs at each beat (Chrome ext, dark-pattern anchor, Gmail OAuth, PWA). |
| `71612ff` | phase1-nl-adjust | Killed the slider UI. New backend `POST /rank/nl-adjust` (Opus parses "make it quieter" → weight deltas, renormalises sum=1). New frontend: chip grid + single NL input. `reRankFromCriteria` replaces `reRank` (no slider DOM reads). 15 tests. |
| `b2581ec` | phase1-triangulation | Flipped `LENS_DISABLE_CROSS_MODEL` to `"0"`. Triangulation chip on `heroPickCard` shows median + N retailers + p25-p75 range when `priceSources ≥ 2`. Dot glyphs `◎` (triangulated) vs `◌` (single source). Oracle voice on top-pick / cross-model / welfare-delta copy (reverted in `70e2d60`). |
| `b276180` | phase1-identity | Hero rewrite, chat greeting, slider-referencing copy → NL-adjust framing, `.hero-kicker` styles. (Initially locked "Oracle" as the product voice; reverted in `70e2d60`.) |

---

## 4. Live verifications (2026-04-24)

All four input kinds confirmed end-to-end:

| Kind | Test | Result |
|---|---|---|
| `query` | `POST /audit/stream {kind:"query", userPrompt:"espresso machine under $300, build quality"}` | Top pick De'Longhi Stilosa EC260BK $119 (under budget). Full event chain: extract:start → extract:done → search → crossModel:done (GPT picked Breville Infuser, Llama picked Intel CPU) → verify → rank:done → enrich:done → result → done. |
| `url` | `POST /audit {kind:"url", url:"https://www.wayfair.com/outdoor/pdp/zipcode-design-donatella-4-piece-sofa-…"}` | Non-hardcoded retailer. Returned category "outdoor furniture", product name + brand (Zipcode Design) + 4 specs inferred from URL slug. Price $0 (not extracted) — acceptable fallback. |
| `text` | `POST /audit {kind:"text", source:"chatgpt", raw:"I recommend the De'Longhi Stilosa EC260BK…"}` | 4 claims extracted (pressure, housing material, price, build quality). Candidates include Breville Bambino Plus as spec-optimal alternative. Job-2 confabulation-catch flow. |
| `photo` | Plumbing verified (schema `imageMime` · composer rejects HEIC with specific iPhone-setting hint · extract.ts drives `media_type` from input). Live base64-upload test requires a browser. |

Backend smoke tests:
```bash
# NL preference adjust — verified 1.9s to 2.5s
curl -sS -X POST https://lens-api.webmarinelli.workers.dev/rank/nl-adjust \
  -H 'content-type: application/json' \
  -d '{"criteria":[{"name":"price","weight":0.5},{"name":"quality","weight":0.5}],
       "nlChange":"care more about price"}'
# → {"ok":true,"source":"opus","criteria":[{"price":0.58},{"quality":0.42}], ...}

# Audit stream — confirms final result event emitted
curl -sS -N -X POST https://lens-api.webmarinelli.workers.dev/audit/stream \
  -H 'content-type: application/json' \
  -d '{"kind":"query","userPrompt":"espresso machine under $400"}' \
  | grep -oE '^event: .*' | sort -u
# → event: crossModel:*, event: done, event: enrich:*, event: extract:*,
#   event: rank:*, event: result, event: search:*, event: verify:*
```

---

## 5. Architecture — current code map

```
apps/
  web/
    index.html                # hero + chat-view mount + Sarah's-day + architecture-reveal
    public/
      shelf.html              # Your Shelf preview (6 canonical Sarah cards)
      architecture.html       # full architecture appendix
      downloads/lens-extension.zip
    src/
      main.ts                 # renderResult pipeline. heroPickCard, criteriaCard,
                              # reRankFromCriteria, wireNlAdjustForm, hero-flash,
                              # buildAboutThisPick, preset-chip wiring, runStream
                              # (paste-box), diagnoseAuditError callers
      styles.css              # design tokens, .tri-chip, .criterion-chip,
                              # .nl-adjust-preset, .pick-about, .hero-flash @keyframes
      chat/
        ChatView.ts           # chat orchestrator: composer onSubmit + onImageSubmit,
                              # any-URL short-circuit, streamAudit helper,
                              # diagnoseAuditError, seed chips + in-flight guards
        composer.ts           # textarea + 📎 attach button + file-input (HEIC reject)
        stages.ts             # looksLikeAnyProductUrl, looksLikeAIRecommendation
        rotatingStatus.ts     # setPhrase() method for SSE-driven narration
        bubbleRenderer.ts, ConversationStore.ts, composer tests
  extension/                  # MV3 extension; content/retail, content/hosts
workers/
  api/src/
    index.ts                  # 112 routes incl. /audit, /audit/stream, /rank/nl-adjust
    rank.ts                   # budget-respect filter pre-rank
    rank.test.ts              # 21 tests (including 4 new for budget)
    rank-adjust/handler.ts    # NL preference parser (Opus 4.7 → weight deltas)
    pipeline.ts               # 5-stage DAG
    extract.ts                # kind-dispatch; photo uses input.imageMime
    chat/{clarify,followup,stops,prompts}.ts
    triangulate/{price,specs}.ts
    workflow/specs/           # 9 registered workflows
    openapi/{spec,docs}.ts
  mcp/src/                    # 13 MCP tools
packages/
  shared/src/schemas.ts       # AuditInputSchema with imageMime enum on photo/image
  sdk/, sdk-py/, cli/
```

Live stats (from `/architecture/stats`):
- 85,918 indexed SKUs
- 5,326 categories
- 24 contributing / 52 configured / 29 healthy sources
- 9,518 recalls · 18,806 regulations · 8,862 brands
- 120 packs (59 category + 24 dark-pattern + 16 regulation + 14 fee + 8 intervention)

---

## 6. What works on the live product — narrative

1. User lands on `lens-b1h.pages.dev`. Hero: "Meet Lens. One agent that works for you, before, during, and after every purchase." Chat greeting below.
2. User clicks a seed chip (e.g. ☕ espresso machine under $400) → one-click auto-submit.
3. Chat fires `/chat/clarify`; fast-path `userGaveEverything` detects budget + tradeoff keywords → returns `{kind:"ready"}`.
4. Chat then runs `streamAudit` against `/audit/stream`. SSE events drive the rotator with real progress ("Understanding what you need · espresso machine" → "Looking at 47 real products across retailers" → "Best match so far: Breville Bambino" → "Other frontier models: 2 of 3 agree with Lens"). Final `result` event carries the full `AuditResult`.
5. Audit card renders: `headerCard` · `provenanceCard` · `heroPickCard` (with tri-chip + retailer link + "About this pick" plain-English summary) · `enrichmentsCard` · `repairabilityCard` · `criteriaCard` (chip grid + NL input + preset row) · `claimsCard` · `alternativesCard` · `rankedCard` · `crossModelCard` · `welfareDeltaCard` · `profileCard` · `elapsedFooter`.
6. User types `make it quieter` (or clicks the preset chip). `POST /rank/nl-adjust` → Opus parses ≤20s (AbortSignal). If top pick changes, the hero card plays the pumpkin-ring flash; the "About this pick" summary updates; ranked list reorders with chip-bar animations.
7. User scrolls past the audit card. Sarah's Monday narrative tells the four-touchpoint story with install CTAs inline. Your Shelf link in the top nav; `/shelf` shows 6 preview cards including a CPSC-recall card on a Roborock with Magnuson-Moss letter drafted.
8. User scrolls further: full architecture reveal (live stats, source grid with status dots, 5-stage pipeline, 8 agents, 7 crons, triangulation example, trust posture).

---

## 7. Known gaps and honest limitations

### Deferred from the 2nd judge pass (all cosmetic)
- **P3-5 dead-code regex alternation** in `diagnoseAuditError` (`\baudit\/stream 5\d\d` is redundant with the `(500|502|503|504)` branch that was already removed).
- **P3-7 British "finalise"** at one site in ChatView (codebase otherwise American "finalize").
- **P3-8 timeout copy** says "30 seconds" but the NL-adjust AbortSignal is 20s and the audit stream has no explicit frontend timeout — align numbers or drop.

### Larger items not in scope this session
- **Demo video** (25% rubric weight). 3:00 script is written in `SUBMISSION.md` following Sarah's Monday arc. Recording is user-driven (OBS Studio / Screen Studio, 1080p, 30fps). Upload to YouTube unlisted, then patch `README.md` + `SUBMISSION.md` with the URL.
- **DevPost submission form** — fill from `SUBMISSION.md`: title "Lens — your AI shopping companion", track "Build From What You Know / Build A Tool That Should Exist", GitHub URL, live URL, video URL, team. Opus 4.7 load-bearing features list: adaptive thinking, server-side web search, 1M context, vision 3.75MP, Managed Agents, structured JSON extraction.
- **Pre-warm canary** — no mechanism fires a canonical audit on worker startup. Cold first request can feel slow. Could add a new cron (`*/5 * * * *`) that POSTs to `/audit/stream` with a trivial query. Not in scope this session.
- **Wikidata book-matching for bad queries** — "TV under $100" can return "Encyclopedia of Television" because Wikidata books slip through the `search.ts` noise filter (which excludes `ol:`/`mb:`/`fda510k:`/… prefixes for non-media intents but not `wd:`). Widening the filter risks dropping legit Wikidata product rows (692K source). Not blocking for canonical demo queries.
- **`/shelf` 360px responsive check** — not visually verified at mobile width. CSS has a `@media (max-width:560px)` breakpoint but no in-session visual test.
- **Healthy-but-zero ingesters** from the prior handoff: `eu-eprel`, `ftc-enforcement`, `manufacturer-sitemaps`, `openbeautyfacts`. Each is a small UA / gzip / SSL fix, deferred.

### Deploy flakiness
`wrangler pages deploy` within this loop-session's Bash tool has been flaky — several deploys have been killed between turns. Eventually the current live bundle did roll forward to `index-C0GTq19L.js` (commit 18). If a subsequent deploy needs to land, run the command interactively rather than relying on bg continuation across turns.

---

## 8. Runbook (daily ops)

```bash
# Deploy API worker
cd workers/api && npx wrangler deploy

# Deploy Pages
cd apps/web && npx vite build && npx wrangler pages deploy dist --project-name=lens --branch=main --commit-dirty=true

# Check spine live
curl -s https://lens-api.webmarinelli.workers.dev/architecture/stats | python -m json.tool

# Manually trigger an ingester
curl -sS -X POST https://lens-api.webmarinelli.workers.dev/architecture/trigger/<ingester-id>

# Run an audit from CLI
curl -sS -X POST https://lens-api.webmarinelli.workers.dev/audit \
  -H 'content-type: application/json' \
  -d '{"kind":"query","userPrompt":"recommend ANC headphones under $200"}'

# SKU detail
curl -s https://lens-api.webmarinelli.workers.dev/sku/amazon:B0BTYCRJSS | python -m json.tool
open https://lens-b1h.pages.dev/sku.html?id=amazon:B0BTYCRJSS
```

---

## 9. Next actions, in priority order

1. **Record the 3:00 demo video.** Script: `SUBMISSION.md` — Sarah's Monday arc (0:00 hero → 0:30 streaming audit → 1:00 tri-chip + cross-model → 1:25 NL re-rank "make it quieter" + hero flash → 1:55 extension + Marriott FTC beat → 2:20 `/shelf` Roborock recall → 2:45 architecture receipts → 3:00 closing). Tooling: OBS Studio or Screen Studio, 1080p/30fps. Upload YouTube unlisted.
2. **Update `README.md` + `SUBMISSION.md`** with the video URL. Commit as `docs(demo-video): link uploaded 3:00 walkthrough`. Deploy pages.
3. **Submit DevPost.** Title · tagline · description · video URL · GitHub URL · team. Copy-paste from `SUBMISSION.md`'s "Required submission fields" section.
4. **Optional before T-24h freeze (2026-04-25 20:00 EDT):** pre-warm canary cron, `/shelf` mobile responsive check, Wikidata noise filter for non-media intents.
5. **After T-24h freeze:** only docs + bugfix commits. No new features.

---

## 10. Final status line

- Spine: 85,918 SKUs · 24 contributing sources · 9,518 recalls · 18,806 regulations · 120 packs · 28 migrations · 9 workflow specs · 7 cron schedules · 112 HTTP routes · 13 MCP tools.
- Code: 18 new commits in this session on top of the prior `eb86c3e` baseline (263 total commits on main).
- Deployed: API worker `9a20fae7` LIVE · Pages bundle `index-C0GTq19L.js` LIVE.
- Tests: 21/21 rank tests (4 new for budget-respect), 15/15 rank-adjust tests. Other workspace tests last confirmed green at `d6569a5` (F20 baseline, 301/301 earlier this month).
- Remaining before submission (2026-04-26 20:00 EDT): demo video recording + upload · DevPost form · final live smoke test.

— end of handoff (2026-04-24)
