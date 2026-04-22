# Lens — The Complete Vision (canonical)

**What this file is:** the single canonical reference that consolidates every design decision, narrative, touchpoint, and architectural commitment made during the block-plan phase of the build. When any loop turn (or a fresh Claude session) needs the full picture, this is the first file to read alongside `GAP_ANALYSIS.md`, `BLOCK_PLAN.md`, `AMBIENT_MODEL.md`, `LOOP_DISCIPLINE.md`, and `CHECKLIST.md`.

**Status of preservation:** everything the user and Claude have agreed on, in user-facing conversations, is saved into one of:
- This file (VISION_COMPLETE.md) — narrative, touchpoints, iOS/mobile, worked example
- `AMBIENT_MODEL.md` — passive/active/background modes, two-stage dark-pattern pipeline, permission posture
- `LOOP_DISCIPLINE.md` — anti-drift contract + 10-point Apple-product quality bar
- `GAP_ANALYSIS.md` — diagnosed vision-vs-implementation gap
- `BLOCK_PLAN.md` — all ~200 blocks across foundation / workflows / surface variants / agent loops / polish / demo
- `CHECKLIST.md` — live status tracker with commit hashes
- `BLOCKS/F0-WINNER-CALIBRATION.md` — the CrossBeam/Elisa quality bar
- `BLOCKS/F1-auth-magic-link.md` through `BLOCKS/F20-testing-infra.md` — ultra-detailed per-block specs
- `docs/VISION.md`, `docs/CONSUMER_WORKFLOWS.md`, `docs/DELIVERY_ARCHITECTURE.md`, `docs/KNOWLEDGE_ARCHITECTURE.md`, etc. — the original architectural layer
- `memory/opus-4-7-hackathon.md` — cross-session context anchor

No insight from our conversations is lost. Every decision below is cross-referenced to where it lives in code + docs + block plan.

---

## 1. The one-line

**Lens is the consumer's independent agent at every touchpoint of every purchase — not a paste-box website, an ambient layer that appears next to every AI chat, every retailer page, every receipt, every recall.**

Cross-ref: `docs/VISION.md` §1 (the original one-line), `README.md` hero.

## 2. The core promise

Every commerce actor has an agent working for them. Retailers have pricing algorithms. Brands have SEO firms. Platforms have ad auctions. Manufacturers have influencer networks. Affiliates have tracking pixels. Even consumer-advocacy media has ad revenue tied to the products they evaluate. The consumer alone walks into the transaction with no representation.

**Lens is the counter-party — the one agent in the stack whose only allegiance is to the consumer's welfare.** Structured so no commission, no ad revenue, no partner relationship, no catalog ownership can bias the answer.

Cross-ref: `docs/VISION.md` §1, `docs/COMPETITIVE_POSITIONING.md`.

## 3. The day-in-Sarah's-life narrative (canonical)

**Morning, laptop, ChatGPT tab.** Sarah asks GPT for an espresso machine under $400. GPT recommends a De'Longhi with three reasons. A small **◉ Lens** pill slides into the corner of GPT's response bubble. She clicks — a sidebar unfolds beside the chat: *"Spec-optimal for your criteria is Breville Bambino Plus. The 'stainless-steel build' claim is misleading — the primary housing is plastic; only the boiler is stainless. 2 of 3 other frontier models disagree with GPT. Drag the pressure slider to re-rank →."* She drags. Ranking recomputes in the sidebar. She keeps GPT for checkout (convenience) but bought the Breville.

**Afternoon, phone, Amazon.** She's booking a hotel. The Lens mobile PWA's content script overlays a badge on the checkout page: *"$49/night resort fee added. Covered by FTC Junk Fees Rule (short-term lodging). Would you like to draft a complaint?"* She taps. Lens drafts a CFPB complaint pre-filled with her booking details.

**Evening, email.** Lens's weekly digest arrives: *"Across your last 10 AI-assisted audits, Lens picks averaged +$312 and +0.15 utility over the AIs'. 3 subscriptions auto-renew next week — draft cancellations?"*

**Two months later, push notification.** *"CPSC recalled the Roborock S8 you bought in February. Here's a Magnuson-Moss return letter ready to send."* One tap sends.

**Meanwhile, infrastructure.** ProPublica queries `api.lens.../ticker?category=espresso&geo=us&days=30` → *"ChatGPT picks non-optimal in 24% of espresso queries (n=14,782)."* A Wirecutter-style site embeds `<script src="lens-score.js" data-url="amazon.com/...">` and Lens renders an inline score. An indie Claude Code user adds `claude mcp add lens <url>` and their agent now calls `lens.audit({ai_response})` natively.

This narrative is the demo script, the user story, and the test of completeness. Every touchpoint below should map back to one moment in Sarah's day.

## 4. Every touchpoint — the canonical inventory

| # | Surface | Where it lives | Mode (per AMBIENT_MODEL) | Demo-critical? | Implementing block |
|---|---|---|---|---|---|
| 1 | Web dashboard | `lens-b1h.pages.dev` | Active | yes | F1, F2, P1, P2, P3 + every workflow |
| 2 | Inline extension sidebar (ChatGPT) | content-script iframe on `chatgpt.com` | Active (pill on bubble → click reveals) | **yes** | F6, V-EXT-INLINE-a |
| 3 | Inline extension sidebar (Claude) | content-script iframe on `claude.ai` | Active | yes | F6, V-EXT-INLINE-b |
| 4 | Inline extension sidebar (Gemini) | content-script iframe on `gemini.google.com` | Active | yes | F6, V-EXT-INLINE-c |
| 5 | Inline extension sidebar (Rufus / Amazon) | content-script iframe on `amazon.com` | Active | yes | F6, V-EXT-INLINE-d |
| 6 | Inline extension sidebar (Perplexity) | content-script iframe on `perplexity.ai` | Active | yes | F6, V-EXT-INLINE-e |
| 7 | Passive dark-pattern badge (checkout) | content script on retailer cart/checkout | **Passive** | **yes** | F7, F8, S4-W22 |
| 8 | Passive hidden-fee badge (cart) | content script on cart | Passive | yes | F7, S4-W24 |
| 9 | Passive price-history inline on product pages | content script | Passive | yes | F7, S4-W21 |
| 10 | Passive review-authenticity flag on Amazon | content script | Passive | yes | F7, S3-W17 |
| 11 | Passive counterfeit signal on marketplaces | content script | Passive | — | F7, S3-W18 |
| 12 | Passive sponsorship flag on review articles + YouTube | content script | Passive | — | F7, S3-W19 |
| 13 | Right-click "Audit with Lens" context menu | MV3 `contextMenus` API | Active | — | F8 |
| 14 | Mobile PWA (Android + iOS) | installable web app | Active + Passive on mobile browsers | yes | F9, F10 |
| 15 | Android share-sheet target | PWA `share_target` manifest | Active | yes | F10 |
| 16 | iOS Add-to-Home-Screen | PWA install banner | Active | yes | F9 |
| 17 | Push notifications (recall, price, renewal) | Web Push VAPID | **Background** | **yes** | F9, S6-W33, S6-W34, S6-W36 |
| 18 | Voice input (dictation) | `MediaRecorder` + Deepgram/Whisper | Active | stretch | F11 |
| 19 | Camera input (photo mode) | `getUserMedia` + Opus 4.7 vision | Active | yes | F9 |
| 20 | Gmail inbox ingestion | OAuth + Worker poll | **Background** | yes | F12, S0-W5 |
| 21 | Inbound receipt forwarder | `lens+receipts@...` | Background | — | F12 |
| 22 | Outbound weekly digest email | Resend | Background | yes | V-EMAIL-digest |
| 23 | Drafted-letter outbound | Gmail Send API + Resend | Background + Active confirm | yes | S6-W35, S6-W36 |
| 24 | Plaid bank link | Plaid Link + Transactions API | **Background** | stretch | F13 |
| 25 | Scheduled recall poller | Cloudflare Cron Trigger | Background | yes | F4, A-RECALL-FEED, S6-W33 |
| 26 | Scheduled price-drop poller | Cloudflare Cron Trigger | Background | — | F4, A-PRICE-POLL, S6-W34 |
| 27 | Scheduled subscription-renewal watcher | Cloudflare Cron Trigger | Background | — | F4, A-SUBS-RENEWAL, S6-W36 |
| 28 | Scheduled firmware/CVE watcher | Cloudflare Cron Trigger | Background | — | F4, A-FIRMWARE, S7-W38 |
| 29 | Durable Object workflow runner | long-running Agent SDK runs | Background | yes | F3 |
| 30 | MCP server | `workers/mcp` exposing `lens.audit` etc. | API | yes | F14, V-MCP-* |
| 31 | Public REST API | `api.lens.../v1/*` with OpenAPI | API | — | F15, V-API-* |
| 32 | Lens Score embed widget | `<script src="embed.js">` CDN | API for publishers | yes | F15, CJ-W52 |
| 33 | Public disagreement ticker | `/ticker` route | API + dashboard | yes | F16, CJ-W51 |
| 34 | CLI (stretch) | `npx @lens/cli` | Active | — | V-CLI |
| 35 | JS/TS + Python SDKs | `@lens/sdk` + `lens-sdk` | API | — | V-API-sdk-js, V-API-sdk-py |

**Every row above is in `BLOCK_PLAN.md` or `CHECKLIST.md`.** No touchpoint is unaccounted for.

## 5. The iOS / mobile strategy (full detail)

**Tier 1 — Progressive Web App (ships for hackathon).**

Installable on iOS + Android via "Add to Home Screen" / "Install app" prompts. One codebase (`apps/web`), responsive to 360px.

- **PWA manifest** (`apps/web/public/manifest.webmanifest`) — name, short_name, icons (192/512/maskable), theme color `#DA7756`, background `#fafbfc`, start_url `/`, display `standalone`, orientation `portrait`.
- **Service worker** (`apps/web/src/sw.ts`) — offline shell, cache-first for static assets, network-first for API calls, IndexedDB for queued intents when offline.
- **Share target** (`apps/web/public/manifest.webmanifest` + `/share` route) — on Android, Lens appears in the system share sheet. Any app (Chrome, Instagram, screenshot) → Share → Lens → audit.
- **Camera input** — `<input type="file" accept="image/*" capture="environment">` opens the rear camera on mobile. Photo mode already exists; this just adds the mobile-specific `capture` attribute.
- **Web Push (VAPID)** — generate VAPID keys server-side, expose `POST /push/subscribe` on the Worker, store the subscription in D1. Worker cron jobs push notifications through the Web Push protocol (works on Chrome/Android; Safari 16.4+ supports it on iOS for installed PWAs, but requires the user to install the PWA first).
- **iOS Safari Add-to-Home-Screen** — no install prompt API on iOS, but the `apple-touch-icon` + `apple-mobile-web-app-capable` meta tags make AHS work cleanly. For the hackathon: a small "Install on iOS: Share → Add to Home Screen" inline hint shows on iOS browsers.
- **Deep links** — `lens:` URL scheme registered via PWA so links from emails (e.g., "Click to confirm price-match claim") open the PWA directly.

Blocks: F9 (PWA), F10 (share target).

**Tier 2 — Native wrappers (stretch, post-hackathon).**

Not in scope for April 26. If pursued after, the path is:

- **Expo + React Native** — reuse the vanilla-TS logic by compiling the web app into a WebView-backed native app, plus native bridges for:
  - Siri Shortcuts (iOS) — "Hey Siri, audit this" → launch Lens with the current clipboard or share intent
  - Android App Actions — "Ok Google, audit the last ChatGPT I saw" → deep-link into Lens
  - Widgets — welfare-delta counter widget on iOS home screen
  - Native push notifications (APNs / FCM) — better delivery than Web Push
  - Background fetch / background processing — for the recall watcher on the device (fallback if Web Push blocked)
  - Face ID / Touch ID gating — for high-sensitivity interventions (FTC complaint filing)

Blocks: not in BLOCK_PLAN.md v1 — would be added as `V-NATIVE-ios`, `V-NATIVE-android` blocks post-hackathon.

**Tier 3 — The ambient iOS pattern (stretch).**

The true-ambient iOS posture is Shortcuts automations + Notification Service Extension:
- Shortcut: "When I receive email from amazon.com, run Lens's receipt-logger" — runs iOS automation at inbox level without any Lens app in the loop.
- Notification Service Extension: receive email push notifications, parse receipt content, call Lens API, log purchase.

Both require a native wrapper. Not in v1.

## 6. The hidden-costs end-to-end worked example (full detail)

This is THE load-bearing flow for the ambient/dark-patterns demo beat. Every block below must land for this scenario to work in the submission video.

### Setup
Sarah installs the Lens extension (one click from the Chrome Web Store or load-unpacked). She opts in to Amazon + Marriott host permissions during a first-run tour.

### Trigger
She books a hotel on marriott.com. Reaches the checkout page. Page loads with the price that was shown on the product page ($249/night), plus a new line item: `Destination Amenity Fee · $49/night`.

### Stage 1 (in content script, ~15ms, no network)
`apps/extension/content/darkPatterns.ts` runs on page load:
- CSS selector match: `.fee-line-item, [data-fee], .resort-fee-line` matches 1 element.
- Regex on visible text: `/resort fee|destination fee|amenity fee/i` matches within that element's innerText.
- URL classification: `location.href` contains `/checkout` or `/booking/confirm` → page type = "checkout".
- Cart-price-delta heuristic: compare shown total ($298) against product-page total cached by the content script when Sarah was browsing ($249). Delta > 10% + not explained by tax in tax-line-item → HIT.

**Local result:** `hits: [{ packSlug: "dark-pattern/hidden-costs", brignullId: "hidden-costs", severity: "deceptive", matchedElement: { tag: "DIV", text: "Destination Amenity Fee $49/night", selector: ".fee-line-item" } }]`

### Stage 2 gating (first time on marriott.com)
Because this is the first time Stage 1 fires on `marriott.com`, the extension shows the per-host consent modal (§3 AMBIENT_MODEL):
```
LENS SPOTTED SOMETHING

Lens found what looks like a hidden-costs pattern on this page.
To confirm, send a short excerpt (~200 chars) to Lens's API?

 [ x ] Remember for marriott.com
 ( o ) Always allow    ( ) Ask each time    ( ) Never on this host

[Send] [Don't send]
```

Sarah picks "Always allow, marriott.com". Consent stored in `chrome.storage.local` under `lens.consent.v1.marriott.com`.

### Stage 2 (Worker API call, ~800ms)
Extension posts to `POST /passive-scan`:
```json
{
  "host": "marriott.com",
  "pageType": "checkout",
  "hits": [{ "packSlug": "dark-pattern/hidden-costs", "excerpt": "Destination Amenity Fee $49/night ... Subtotal $249 ... Total $298", "url": "https://www.marriott.com/booking/confirm" }]
}
```

Worker runs:
1. Zod-validates the request.
2. Loads `packs/dark-pattern/hidden-costs.json` + `packs/regulation/us-federal-ftc-junk-fees.json` + `packs/fee/resort-fee.json` + `packs/intervention/file-ftc-complaint.json` from the registry.
3. Composes Opus 4.7 prompt via `packs/prompter.ts`: `darkPatternsPrompt([hidden-costs])` + `regulationsPrompt([ftc-junk-fees])` + `feesPrompt([resort-fee])` + the excerpt.
4. Opus 4.7 confirms + cites: *"This is a Class 1 hidden-costs pattern. The FTC Junk Fees Rule (effective May 12, 2025) covers short-term lodging; mandatory fees must be disclosed in the advertised total price from the outset. Resort fees disclosed only at checkout are non-compliant."*
5. Worker returns:
```json
{
  "confirmed": [{
    "packSlug": "dark-pattern/hidden-costs",
    "verdict": "deceptive",
    "regulatoryCitation": "16 CFR Part 464 (FTC Junk Fees Rule)",
    "suggestedIntervention": "intervention/file-ftc-complaint",
    "feeBreakdown": { "label": "Destination Amenity Fee", "amountUsd": 49, "frequency": "per-night" }
  }]
}
```

### Badge render (content script receives response, ~40ms to paint)
Extension renders a single badge pinned to the top-right of the cart region (not modal, not blocking):
```
⚠ Hidden cost · 1 pattern
$49/night resort fee. Covered by FTC Junk Fees Rule.
[See detail ▾] [Dismiss] [Don't flag on marriott.com]
```

Tap "See detail":
```
┌─ HIDDEN-COSTS PATTERN ─────────────────────┐
│ Destination Amenity Fee                     │
│ $49 per night • not on product page         │
│                                              │
│ Regulatory status                            │
│ FTC Junk Fees Rule (16 CFR Part 464)         │
│ effective 2025-05-12. Covers short-term      │
│ lodging. Mandatory fees must be in the       │
│ advertised total price.                      │
│                                              │
│ What you can do                              │
│ [Draft FTC complaint]   [Proceed anyway]     │
│ [Download itemized receipt for expense-      │
│  report / dispute]                           │
└──────────────────────────────────────────────┘
```

### Tap "Draft FTC complaint" → intervention flow
Worker pulls `packs/intervention/file-ftc-complaint.json` template, fills it from:
- User's purchase context (date, vendor, amount)
- The extracted fee breakdown
- User's name + contact (from profile)

Returns a pre-filled letter that opens in the dashboard for user review. User clicks Send → Worker POSTs to `reportfraud.ftc.gov` (or drafts the email if no API available).

Logged to `interventions` table in D1 as a tracked action.

### Post-action
- Dashboard shows "Interventions · 1 filed" with a status badge ("awaiting response, 7 days").
- If FTC responds or Marriott issues a refund, it's logged.
- Aggregated across consented users, this contributes to the public disagreement ticker (F16) as: "Marriott.com flagged for hidden-costs pattern by 847 Lens users in last 90 days."

### Blocks that must land for this scenario
- F1 ✅ (auth — user can consent, sign in)
- F2 (persistence — purchase record, consent record, intervention record)
- F3 (workflow engine — /passive-scan is a workflow node)
- F4 (cron — not required for this scenario, but related)
- F5 (event bus — intervention.filed event fires)
- F6 (extension sidebar — not required for this specific scenario, the overlay suffices)
- F7 (overlay + badge system — the badge render)
- F8 (content-script router — marriott.com adapter)
- F17 (observability — log the Stage-1 hit, the Stage-2 confirm, the intervention filing)
- S4-W22 (dark-pattern scan — the end-to-end wiring)
- S4-W24 (true-total-cost — optional deepen)
- Pack: `packs/dark-pattern/hidden-costs.json` ✅ (already shipped)
- Pack: `packs/regulation/us-federal-ftc-junk-fees.json` ✅ (already shipped)
- Pack: `packs/fee/resort-fee.json` ✅ (already shipped)
- Pack: `packs/intervention/file-ftc-complaint.json` ✅ (already shipped)

**Every link in the chain is mapped to a block. No handwaving. This is why the BLOCK_PLAN.md exists.**

## 7. The state architecture — where every byte lives

| Tier | Storage | What goes there | Consent | Example |
|---|---|---|---|---|
| 0 | In-flight only | query text, pasted AI answer, scan excerpt | implicit (per-request) | ChatGPT response being audited |
| 1 | `localStorage` / `chrome.storage.local` | anon preferences, dismissed badges, consent choices, audit history pre-signin | implicit (device-only) | per-host "always allow Stage 2" setting |
| 2 | Cloudflare D1 + KV + R2 | signed-in audits, purchases, watchers, interventions, welfare delta, sessions | explicit one-time on sign-in | Sarah's purchase history across devices |
| 3 | Sensitive, OAuth-scoped | Gmail messages, bank transactions | explicit durable, scoped | receipts from Gmail inbox |
| 4 | Cross-user anonymized | disagreement ticker aggregates, pattern-prevalence data | explicit data-contribution, k ≥ 5 | "marriott.com flagged 847 times" |

Cross-ref: `docs/DELIVERY_ARCHITECTURE.md` Axis 5, `BLOCKS/F2-persistence.md`.

## 8. The eight agent types (mapped to runtime locations)

From `docs/DELIVERY_ARCHITECTURE.md`, with runtime locations now concrete:

| Agent | Role | Runtime location | Blocks |
|---|---|---|---|
| Interpreter | intent extraction from text / voice / image | `workers/api/src/extract.ts` node in audit workflow | F3, S1-W8 |
| Researcher | live web search + spec retrieval | `workers/api/src/search.ts` node | F3, S2-W10, S2-W11 |
| Auditor | claim + dark-pattern + provenance verification | `workers/api/src/verify.ts` + `/passive-scan` handler | F3, S3-W20, S4-W22 |
| Ranker | deterministic utility math | `workers/api/src/rank.ts` node (no LLM) | F3, S2-W10 |
| Watcher | cron-driven polls — recalls, prices, firmware, renewals | Cloudflare Cron Trigger → `workers/api` cron dispatcher → `WorkflowRunnerDO` | F4, A-RECALL-FEED, A-PRICE-POLL, A-FIRMWARE, A-SUBS-RENEWAL |
| Advocate | drafts + sends letters (return, cancel, complaint) | `workers/api` intervention workflows + Resend / Gmail Send | S6-W35, S6-W36 |
| Historian | aggregates, welfare delta, ticker | D1 repos + hourly aggregator cron | F2, F16 |
| Translator | legal → plain, spec → criterion score | integrated into Interpreter / Auditor prompts | F3 |

## 9. Opus 4.7 capabilities — load-bearing per stage

| Capability | Used by | Demo moment |
|---|---|---|
| **Adaptive thinking** | Interpreter (preference extraction) | Clarification modal fires when confidence < 0.6 |
| **Server-side web search (2026)** | Researcher | 10-20 real products stream into audit card |
| **1M context** | Auditor (all candidates + all claims in one pass) | `misleading` verdict — requires seeing every alternative |
| **Vision (3.75MP)** | Interpreter (screenshots, photos) | Mobile: tap camera → audit card |
| **Claude Managed Agents** | Cross-model fanout, long-running intervention drafting | Cross-model panel + "Lens spent 18 min researching this recall" |

Cross-ref: `docs/VISION.md` §7, `BLOCKS/F0-WINNER-CALIBRATION.md`.

## 10. Hackathon rubric — where the blocks land points

| Criterion | Weight | Answer |
|---|---|---|
| Impact | 30% | Every online shopper. Peer-reviewed paper (Nature, 18 models × 382K trials). FTC AI-commerce deadline tailwind. Regulatory-grade public ticker as byproduct. |
| Demo | 25% | 8 recorded beats: inline on ChatGPT, dark-pattern hotel catch, recall push, welfare-delta money shot, cross-model disagreement, mobile PWA voice, MCP tool call from external Claude, ticker dashboard. 3:00 hard-cut. |
| Opus 4.7 use | 25% | Five capabilities visibly load-bearing + pack-maintenance loops as a fifth autonomous surface. |
| Depth | 20% | Target 60K+ LOC, 2000+ tests, 4 services (api + cross-model + mcp + pages), 10+ cron workflows, Durable Object runner, 116+ packs, 4 pack-maintenance loops, Playwright e2e against real retailer pages. |

Cross-ref: `BLOCK_PLAN.md` target by April 26.

## 11. What's explicitly NOT Lens (scope boundary)

- Not a recommendation engine trained on user behavior (no telemetry funnel, no personalized ranking drift).
- Not an editorial site (no human reviewers, no opinion content).
- Not a comparison table (projects the product space onto the specific criteria a user asked about, not every dimension).
- Not an ad network (no sponsored slots, no paid rankings).
- Not a Shopping-app competitor to Rufus or ChatGPT Shopping — **it audits them**. Perplexity is the closest market analog but still has conflicts (Pro subscription, partner feeds). Lens has no such conflicts.

Cross-ref: `docs/VISION.md` §7.

## 12. What the user can touch and what they can't

**User can touch (every turn, every day):**
- Every preference weight (sliders)
- Every values-overlay criterion (country of origin, B-Corp, union-made, etc.)
- Every per-host passive-scan consent
- Every background-workflow toggle (recall monitor on/off, price-drop auto-file on/off)
- Export their profile as signed JSON and migrate it to any device
- Delete all their server-side data
- Revoke Gmail OAuth, Plaid link, extension host permissions independently

**User cannot touch (by design):**
- The ranking math (transparent, but not editable — if they don't like the formula, they can re-weight with sliders instead of changing the algebra)
- The pack contents (community-contributable via PR, but not per-user)
- The regulation status flags (sourced from the regulation-watcher cron; user can dispute via GitHub issue)
- Other users' data (k-anonymity on every aggregate)

Cross-ref: `docs/KNOWLEDGE_ARCHITECTURE.md`, `docs/PREFERENCE_INFERENCE.md`.

## 13. The non-negotiables

Synthesizing from the user's instructions across this session:

1. **Apple-product feel.** If a reviewer's first reaction isn't "oh this is nice", the bar hasn't been hit. (`LOOP_DISCIPLINE.md` §Apple-product bar)
2. **Ambient by default.** Silent unless there's something worth interrupting for. (`AMBIENT_MODEL.md` §5 invariants)
3. **Deeply integrated across touchpoints.** Web + extension inline + PWA mobile + email + push + MCP + API. (This file §4)
4. **Full infrastructure now, API keys later.** Plaid scaffolding, Gmail OAuth scaffolding, Resend — everything wired so keys swap in without rework. (User mandate 2026-04-21)
5. **No superficial work.** Every block targets CrossBeam/Elisa scale (60K+ LOC, 2000+ tests). (`BLOCKS/F0-WINNER-CALIBRATION.md`)
6. **The loop must not drift.** Every turn reads `LOOP_DISCIPLINE.md`, `GAP_ANALYSIS.md`, `BLOCKS/F0-WINNER-CALIBRATION.md`, `BLOCK_PLAN.md`, `CHECKLIST.md` before executing. (`LOOP_DISCIPLINE.md`)
7. **Save everything.** Every design insight from every conversation lives in a markdown file in this repo. This file is the canonical index.
8. **Active mode searches, ranks, and answers — from math, not affiliation.** When a user types "espresso machine under $400, pressure matters most" or pastes any query, Lens performs a live product search across real retailers and returns the spec-optimal pick ranked by a transparent utility function `U = Σ wᵢ · sᵢ` the user can inspect in full, dial with sliders, and reproduce deterministically. Every weight, every score, every contribution is visible. **No affiliate links. Ever.** Every product-page URL in Lens's output points directly to the retailer's canonical product page with no `ref=`, no `tag=`, no `utm_`, no tracking pixel, no monetized redirect. If Lens cannot reach the retailer's canonical page without affiliate-tagging, Lens omits the link rather than compromise the principle. **Revenue model: none that biases ranking.** This is enforced in code (F2 persistence, S2-W10 spec-optimal, S2-W11 alternatives, S2-W13 vendor/independent weighting) and in policy (this file, `docs/VISION.md`, `AMBIENT_MODEL.md`, `LOOP_DISCIPLINE.md` off-limits). A commit that introduces affiliate tagging for revenue is a project-violation commit and must be reverted.

## 14. Cross-session continuity

- Durable cron `67e07cd9` fires every 2h while any Claude session is active, resuming the loop.
- `ScheduleWakeup` within the active session self-paces the loop.
- Memory anchor at `C:\Users\natal\.claude\projects\.../memory/opus-4-7-hackathon.md` reminds every future session of:
  - The deadline (Apr 26 8PM EDT)
  - The repo path + GitHub remote
  - The block-plan + checklist locations
  - The Apple-product bar
  - The 10-point AMBIENT_MODEL rules
  - This file as the canonical vision reference

## 15. Reading order for a fresh session

1. `LOOP_DISCIPLINE.md` — anti-drift + Apple bar
2. `GAP_ANALYSIS.md` — the diagnosed gap
3. `BLOCKS/F0-WINNER-CALIBRATION.md` — the quality bar
4. **`VISION_COMPLETE.md`** (this file) — the canonical reference
5. `AMBIENT_MODEL.md` — the ambient integration rules
6. `BLOCK_PLAN.md` — all blocks
7. `CHECKLIST.md` — state tracker
8. `BLOCKS/<next-id>.md` — the block to execute

Then, and only then, execute.
