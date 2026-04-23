# Lens — Improvement Plan (2026-04-22)

**Source of this plan:** live harness walkthrough on 2026-04-22, screenshots in `../_screenshots/audit-*` and `../_screenshots/edge-*`. User mandate: *"work on all of it, slowly, with loops and hooks, not efficient but good and amazing."* Plus a 17th scope item: **demonstrate the architecture on the landing page** so a first-time visitor beautifully sees everything Lens is.

**Execution contract (per LOOP_DISCIPLINE.md):**
1. One item at a time, start-to-finish.
2. For each item: implementation, tests, deploy if surface-facing, commit `lens(improve-NN): <summary>`, Opus 4.7 LLM-as-judge pass, P0/P1 fixes in-block, re-test, re-deploy, then mark done.
3. Live harness verification on `lens-b1h.pages.dev` for every user-facing item (coordinate clicks + screenshots, not programmatic asserts).
4. Never skip the judge pass.
5. Stop if stuck 3 turns on one item; open `## Blockers` under that item's section in this file.

**Status legend:** ⬜ pending · ⏳ in progress · 🧪 code done, verifying · 🧑‍⚖ judge pass running · ✅ shipped + verified · ❌ blocked

---

## Part A — P0 (demo-breakers, must-ship-first)

### 1. Job 2 detection — paste-of-AI-recommendation routes to audit, not clarifier

**Status:** ⬜
**Files likely touched:** `workers/api/src/chat/clarify.ts`, `workers/api/src/chat/stops.ts`, `apps/web/src/chat/ChatView.ts`, `apps/web/src/chat/stages.ts`, plus tests in both packages.
**The bug:** Pasting the exact De'Longhi Stilosa recommendation with explicit product, cited claims, explicit price, triggered `/chat/clarify` which asked "semi-automatic or fully automatic?" instead of running `/audit` with the paste. Marquee feature of the hackathon pitch — dead.
**The fix shape:**
- Add `looksLikeAIRecommendation(text)` pure function: detects cited-claim language ("reasons: (1)", "I recommend", "I'd suggest", "my pick is"), product-name-with-model-code patterns, explicit price sentinels ($NN or "priced at"), and conversational justification.
- In `ChatView.onSubmit`, call the detector on the FIRST user turn. If positive, skip Stage 1 entirely and route to `runAudit()` with `kind: "text"` (not `kind: "query"`). Keep the paste verbatim.
- In `clarify.ts`, mirror detection on the server so direct API callers get the same short-circuit via a `{ kind: "audit-now" }` response.
**Acceptance:**
- a. Pasting the De'Longhi Stilosa text produces the audit card in ≤25s without any clarifier turn.
- b. Pasting a short shopping query ("espresso under $400") still goes through the clarifier.
- c. Server unit tests: ≥8 positive detections (real ChatGPT, Claude, Gemini, Rufus style pastes) + ≥6 negatives (short queries, URL-only, questions).
- d. Harness walkthrough screenshot confirms audit card rendered from Job 2 paste.

### 2. URL ingestion — Amazon / Best Buy / Walmart / Target / Home Depot / Costco URLs hit real parsers, not the URL slug

**Status:** ⬜
**Files likely touched:** `workers/api/src/extract.ts` (already has `extractFromUrl`), `workers/api/src/chat/clarify.ts`, `workers/api/src/chat/stops.ts`, `apps/web/src/chat/ChatView.ts`.
**The bug:** `https://www.amazon.com/Anker-Charging-Foldable-Recognition-Non-Battery/dp/B0G1MRLXMV/` produced "Got it, looks like you're eyeing a foldable wireless charger" from the URL slug alone. Never fetched the page. The S3-W15 per-host parsers (amazon/bestbuy/walmart/target/homedepot) are already shipped and unused here.
**The fix shape:**
- Add `looksLikeProductUrl(text)` pure function: matches known retailer hosts.
- In `ChatView.onSubmit`, if first turn matches, fetch via `/audit` with `kind: "url"` and seed the clarifier with the ACTUAL product name + price returned by the server's `extractFromUrl` pipeline (which calls the host parsers).
- Display a bot bubble: "I pulled the product page — you're looking at **[real name]** at $[real price]. Any budget or priorities, or should I audit as-is?"
- If user says "audit as-is" or just hits send again → straight to audit. Otherwise one clarifier for priorities.
**Acceptance:**
- a. Pasting the Anker URL produces a bot bubble that contains the real product name (from the PDP, not the slug) within 6s.
- b. URL-paste never asks "what's your budget?" without first having fetched the page.
- c. Test coverage for 6 retailer hosts + 1 non-retailer URL (shows graceful fallback).
- d. Harness walkthrough confirms real title + price appears.

### 3. Don't render optimistic copy over empty data — `(no candidates available)` must not pose as a product

**Status:** ⬜
**Files likely touched:** `apps/web/src/main.ts` (card renderers), `apps/web/src/chat/ChatView.ts` (recap — partly done), `workers/api/src/workflow/specs/audit.ts` (source of placeholder name).
**The bug:** `audit-10-result-top.png` shows **"Lens's top pick / (no candidates available)"** as a heading followed by "Best fit for your stated priorities" — optimistic copy over empty data. Also `"It matches your top criterion (multi device charging) per the transparent utility math"` in the bot bubble.
**The fix shape:**
- Change `workflow/specs/audit.ts` to emit `specOptimal: null` (or `{ empty: true, reason: "no-candidates" | "search-failed" | "rate-limited" }`) instead of a sentinel Candidate with `name: "(no candidates available)"`.
- Update `AuditResult` schema in `packages/shared` to allow `specOptimal: Candidate | null`.
- `renderResult` in `main.ts` renders a proper empty state card:
  ```
  Lens searched but came back empty
  The live web search returned 0 candidates this run.
  Common causes: very niche query, live search rate-limited, or category
  without retail indexing. Try a narrower prompt or paste a specific URL.
  ```
- All downstream cards (Trust signals, Repairability, Your criteria, Full ranking, etc.) must hide gracefully when there's no pick.
- Update the recap `isEmpty` check to be the `specOptimal === null` path; remove the string-sniffing.
**Acceptance:**
- a. Zero-candidate run renders ONE empty-state card, NOT the template with placeholder strings.
- b. No text containing `(no candidates` ever appears in the UI (grep test).
- c. Unit test: audit pipeline returns `specOptimal: null` on empty search.
- d. Harness walkthrough on a query that's guaranteed empty shows the empty-state card.

### 4. Hide the cross-model panel when providers are unavailable

**Status:** ⬜
**Files likely touched:** `apps/web/src/main.ts` (crossModel panel), `packages/shared/src/types.ts` (signal).
**The bug:** `audit-12-result-mid2.png` shows public-facing copy: **"No other-model picks for this run — some provider keys may need refresh."** Judges read "broken infra." Also: the cross-model elapsed time was 77ms — it short-circuited.
**The fix shape:**
- `CrossModelCheck` gains a `status: "ran" | "skipped" | "unavailable"` field.
- When `unavailable` (no keys or all providers timed out), the panel is not rendered at all — replaced with a neutral line in the elapsedFooter: "Cross-model check skipped in this preview." No alarming copy.
- When `ran` with 0 successful picks → render a "Models disagree" empty-state (models responded but didn't name a product).
**Acceptance:**
- a. Default prod has no visible "provider keys may need refresh" text anywhere.
- b. Unit test on each status value.
- c. Harness walkthrough confirms.

---

## Part B — P1 (perception saves)

### 5. Restore the landing — classic page becomes the default, chat becomes a mode inside it

**Status:** ⬜
**Files likely touched:** `apps/web/index.html`, `apps/web/src/main.ts`, `apps/web/src/chat/ChatView.ts`, `apps/web/src/styles.css`.
**The bug:** Default `/` renders a chat bubble and an input with no H1, no explanation, no research anchor, no mode affordance. Classic landing (with H1, explanation, research, 3 mode tabs) lives behind `?chat=0`.
**The fix shape:**
- New layout: hero section at top (H1 + explainer + research anchor), then ARCHITECTURE DEMO band (item 17), then a 3-mode tab control with CHAT as the default mode ("I want to buy something"), URL mode, and PASTE mode. Each mode has its own input UI inside the tab body.
- `?chat=0` flag and "Switch to classic"/"Switch to chat" footer link retired. One page, three modes.
**Acceptance:**
- a. First-time viewer sees H1, explainer, and research anchor above the fold.
- b. Mode tabs visible and keyboard-navigable.
- c. No regression in chat flow.
- d. Harness screenshot confirms.

### 6. Audit-first CTA — explicit Job 2 entry point

**Status:** ⬜
**Files touched:** same as #5.
**The fix shape:** The PASTE mode tab is literally labelled *"Audit an AI's answer"* with a textarea placeholder that shows a one-line example. Entering this mode skips the Stage 1 clarifier entirely and goes straight to audit.
**Acceptance:** viewer can click "Audit an AI's answer" → paste → submit → audit card, with zero clarifier turns.

### 7. Stale pack count copy — read from `/packs/stats` at runtime

**Status:** ⬜
**Files touched:** `apps/web/src/main.ts`, landing copy, card 3 of "How Lens works".
**The bug:** Header says "120 knowledge packs", card 3 says "106 Knowledge Packs", README says "121 packs". Three numbers on one page.
**The fix shape:** On page load, fetch `${API_BASE}/packs/stats` and inject the real count into all copy spots (header ticker, "How it works" card 3, footer). Pre-render with the latest-build-time count as SSR-ish default; update on fetch.
**Acceptance:** one number, everywhere, live from server.

### 8. Honor the <20s claim or stop making it

**Status:** ⬜
**Files touched:** `workers/api/src/workflow/specs/audit.ts` (timeouts), `apps/web/src/main.ts` (footer CTA + tagline).
**The bug:** Observed audit took 30.9s. Tagline says "under 20 seconds."
**The fix shape:** Audit the per-node timeouts; if search already takes 27s in realistic scenarios, either (a) lower the search timeout to 15s and fall back to fixture-mode when exceeded, or (b) change the tagline to "in about 30 seconds" and stop overclaiming. Pick (a) for demo, (b) as fallback.
**Acceptance:** 3/3 runs on canonical demos complete in ≤25s OR the tagline reads conservative.

---

## Part C — P2 (Claude Design aesthetic refit)

### 9. Warm surface + pumpkin accent — ditch cool `#fafbfc`, ditch lightweight `#DA7756`, adopt `#FAF9F5` + `#CC785C`

**Status:** ⬜
**Files touched:** `apps/web/src/styles.css`, `apps/web/src/chat/chat.css`, any hardcoded colors in `.ts` files.

### 10. Serif display type — Source Serif 4 / Fraunces / Charter for H1 + card titles; system sans for everything else

**Status:** ⬜
**Files touched:** `apps/web/index.html` (`<link>` for a web-safe serif if needed), `styles.css`, `chat.css`.

### 11. Illustrations, not flat icons — the "Extract / Search / Verify / Rank" cards get a consistent iconography

**Status:** ⬜
**Files touched:** `apps/web/public/*.svg`, `apps/web/src/main.ts`, `styles.css`.

### 12. Voice audit — strip SaaS-polite copy for conversational specific copy

**Status:** ⬜
**Files touched:** grep sweep over `apps/web/src/*.ts`, copy constants in both frontends.

### 13. Explanatory structure — three-up band "What Lens does / Why it exists / How it's different"

**Status:** ⬜
**Files touched:** `apps/web/index.html`, `apps/web/src/main.ts`, `styles.css`. Includes the research-paper citation moved up from footer.

---

## Part D — P3 (scope-depth deferrables)

### 14. Off-topic refusal — "pizza in toronto" isn't shopping; refuse politely

**Status:** ⬜
**Files touched:** `workers/api/src/chat/clarify.ts` (prompts.ts — `STAGE1_ELICIT_SYSTEM`), `workers/api/src/chat/stops.ts`, unit tests.

### 15. Clarifier-happiness tuning — short-circuit to audit when user already gave ≥3 constraints

**Status:** ⬜
**Files touched:** `workers/api/src/chat/stops.ts` (`userGaveEverything` — extend the tradeoff vocabulary to 40+ terms, add a constraint-count short-circuit).

### 16. Empty-state grace on tier alternatives — "Not enough candidates across price tiers" needs a real empty state

**Status:** ⬜
**Files touched:** `apps/web/src/main.ts` (alternativesCard).

---

## Part E — New scope (2026-04-22 user mandate)

### 17. Architecture-on-landing — demonstrate everything Lens IS on the landing page

**Status:** ⬜
**Files touched:** `apps/web/index.html`, `apps/web/src/main.ts`, `styles.css`, new `apps/web/src/architecture-demo/` module.

**The ask:** "demonstrate the architecture in the landing page too so consumers would beautifully see everything that is."

**The fix shape (rough — to be expanded when we get there):**
- **Hero band** — H1, research anchor, one CTA.
- **Two Jobs band** — visual side-by-side: "I want to buy X" (Job 1, ~6s) vs. "Audit this AI answer" (Job 2, ~18s). Each with a mini visual of the pipeline stages.
- **Pipeline band** — five stages (Extract / Search / Verify / Rank / Cross-check) rendered as a flowing diagram, each stage annotated with the Opus 4.7 capability it exercises (adaptive thinking, web search, 1M context, deterministic math, Managed Agent).
- **Knowledge band** — live counts of packs by type (category / dark-pattern / regulation / fee / intervention) with a one-line description each and a "see the pack registry" link.
- **Surfaces band** — a row showing: web dashboard · Chrome extension · mobile PWA · MCP server · public API · weekly digest · push notifications. Each with a one-line status ("live", "demo", "API-only", "roadmap").
- **Workflows band** — the 52 workflows across 9 stages, showing which are live, which are partial, which are roadmap. This is what the user means by "everything that IS."
- **Research anchor band** — the paper, the numbers (18 models, 382K trials, 21%, 86%), the link.
- **Trust band** — open source, no affiliate links, no ranking bias, privacy.
- **CTA band** — "Start your first audit" → scrolls back up into the tabs.

**Acceptance:**
- a. A first-time viewer who scrolls the landing understands, in order: what Lens is, how it works under the hood, what surfaces it ships on, what knowledge it carries, what research it's grounded in, what makes it trustworthy.
- b. Every live-count number (packs, workflows) is fetched live from `/packs/stats` + a new `/architecture/stats` endpoint.
- c. No copy lies — a roadmap row is clearly labelled roadmap, not "coming soon" or "live."
- d. Harness walkthrough at 1920x855 and at 390x844 (mobile).

---

## Part F — Cross-cutting ops

### XC-1 — CHECKLIST + progress log discipline

Every completed item here ALSO gets a CHECKLIST.md row under a new `## Part G — Improvement sprint 2026-04-22` section, plus a progress-log line at the bottom of CHECKLIST.md.

### XC-2 — Deploy cadence

Every P0 item deploys immediately. P1 items batch up to daily. P2/P3 can batch until the full aesthetic refit lands together.

### XC-3 — LLM-as-judge gate per item

Spawn an Opus 4.7 Agent subagent per completed item with the prompt from LOOP_DISCIPLINE.md §LLM-as-judge. Apply P0+P1 fixes in-block. Append the punch list to the item's section here under `## Judge pass <date>`.

### XC-4 — Harness verification per user-facing item

Screenshots land in `../_screenshots/improvement-NN-*.png` for each item. Never mark ✅ without a verifying screenshot.

### XC-5 — Commit discipline

Format: `lens(improve-NN): <one-line summary>` + co-author footer + push to main before next item starts. Never `--no-verify`.

---

## Part G — Progress log (append-only)

- 2026-04-22: IMPROVEMENT_PLAN.md written. 17-item sprint queued. Starting item 1 next.
