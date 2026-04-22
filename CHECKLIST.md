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
| F2 | Persistence: D1 + KV + R2 | ⬜ | `BLOCKS/F2-persistence.md` | |
| F3 | Workflow engine (DAG + bus + DO) | ✅ | `BLOCKS/F3-workflow-engine.md` | `2a96393` |
| F4 | Cron + scheduler primitives | ✅ | `BLOCKS/F4-cron.md` | `8ab4ab3` |
| F5 | Event bus + webhook surface | ✅ | `BLOCKS/F5-events-webhooks.md` | `7939873` |
| F6 | Extension inline sidebar infra | ✅ | `BLOCKS/F6-extension-sidebar.md` | `653e7ce` |
| F7 | Extension overlay + badge system | ⬜ | 🔬 | |
| F8 | Extension content-script router | ⬜ | 🔬 | |
| F9 | PWA web + mobile layout | ✅ | `BLOCKS/F9-pwa.md` | `7939873` |
| F10 | Mobile share-sheet ingestion | 🟡 | `BLOCKS/F9-pwa.md` | `7939873` (manifest share_target shipped; /share route pending) |
| F11 | Voice input | ⬜ | 🔬 | |
| F12 | Email inbox ingestion (Gmail OAuth) | ⬜ | 🔬 | |
| F13 | Plaid bank connection (stretch) | ⬜ | 🔬 | |
| F14 | MCP server | ⬜ | 🔬 | |
| F15 | Public Lens Score API | ⬜ | 🔬 | |
| F16 | Public disagreement ticker | ⬜ | 🔬 | |
| F17 | Observability (logs + traces) | ✅ | `BLOCKS/F17-observability.md` | `8ab4ab3` |
| F18 | Authenticated rate limiting | ⬜ | 🔬 | |
| F19 | Secrets + env parity | ⬜ | 🔬 | |
| F20 | Testing infrastructure | ✅ | `BLOCKS/F20-testing-infra.md` | `d6569a5` |

## Part B — Workflows by stage

### Stage 0 — Need emergence

| # | Workflow | Status | File | Commit |
|---|---|---|---|---|
| S0-W1 | Ad-influence traceback | ⬜ | 🔬 | |
| S0-W2 | Scheduled replacement reminders | ⬜ | 🔬 | |
| S0-W3 | Trigger-based purchase alerts | ⬜ | 🔬 | |
| S0-W4 | Pre-need category onboarding | ⬜ | 🔬 | |
| S0-W5 | Subscription discovery | ⬜ | 🔬 | |

### Stage 1 — Discovery

| # | Workflow | Status | File | Commit |
|---|---|---|---|---|
| S1-W6 | Category exploration | ⬜ | 🔬 | |
| S1-W7 | Lifestyle bundles | ⬜ | 🔬 | |
| S1-W8 | Preference elicitation (extend live) | 🟡 | 🔬 | |
| S1-W9 | Comparative framing help | ⬜ | 🔬 | |

### Stage 2 — Research

| # | Workflow | Status | File | Commit |
|---|---|---|---|---|
| S2-W10 | Spec-optimal (deepen live) | 🟡 | 🔬 | |
| S2-W11 | Alternatives at tiers (deepen live) | 🟡 | 🔬 | |
| S2-W12 | Cross-assistant (migrate to Managed Agent) | 🟡 | 🔬 | |
| S2-W13 | Vendor vs independent weighting | ⬜ | 🔬 | |

### Stage 3 — Evaluation

| # | Workflow | Status | File | Commit |
|---|---|---|---|---|
| S3-W14 | AI recommendation audit (expand surfaces) | 🟡 | 🔬 | |
| S3-W15 | URL evaluation (deepen parser) | 🟡 | 🔬 | |
| S3-W16 | Source provenance | ⬜ | 🔬 | |
| S3-W17 | Review authenticity (add LLM layer) | 🟡 | 🔬 | |
| S3-W18 | Counterfeit / grey-market | ⬜ | 🔬 | |
| S3-W19 | Sponsorship scanner | ⬜ | 🔬 | |
| S3-W20 | Claim verification (reuse) | ✅ | 🔬 | |

### Stage 4 — Decision & purchase

| # | Workflow | Status | File | Commit |
|---|---|---|---|---|
| S4-W21 | Price history + sale legitimacy | ⬜ | 🔬 | |
| S4-W22 | Dark-pattern checkout scan (wire /passive-scan) | 🟡 | 🔬 | |
| S4-W23 | Compatibility check | ⬜ | 🔬 | |
| S4-W24 | True-total-cost reveal | ⬜ | 🔬 | |
| S4-W25 | Data-disclosure audit | ⬜ | 🔬 | |
| S4-W26 | Breach history | ⬜ | 🔬 | |
| S4-W27 | Scam / fraud detection | ⬜ | 🔬 | |
| S4-W28 | Checkout-readiness summary | ⬜ | 🔬 | |

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
| S6-W33 | Recall monitoring | ⬜ | 🔬 | |
| S6-W34 | Price-drop refund trigger | ⬜ | 🔬 | |
| S6-W35 | Returns / warranty assistance | ⬜ | 🔬 | |
| S6-W36 | Subscription audit & cancel | ⬜ | 🔬 | |
| S6-W37 | Performance tracking | ⬜ | 🔬 | |

### Stage 7 — Ongoing use

| # | Workflow | Status | File | Commit |
|---|---|---|---|---|
| S7-W38 | Firmware monitoring | ⬜ | 🔬 | |
| S7-W39 | Accessory discovery | ⬜ | 🔬 | |
| S7-W40 | Lock-in cost tracking | ⬜ | 🔬 | |
| S7-W41 | Repairability tracking | ⬜ | 🔬 | |

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
| CJ-W46 | Values overlay | ⬜ | 🔬 | |
| CJ-W47 | Family / household profiles | ⬜ | 🔬 | |
| CJ-W48 | Gift-buying mode | ⬜ | 🔬 | |
| CJ-W49 | Group-buy pooling | ⬜ | 🔬 | |
| CJ-W50 | Profile portability (server sync) | 🟡 | 🔬 | |
| CJ-W51 | Public disagreement ticker | ⬜ | 🔬 | |
| CJ-W52 | Lens Score API | ⬜ | 🔬 | |

## Part C — Delivery surface variants

| # | Variant | Status | File | Commit |
|---|---|---|---|---|
| V-EXT-INLINE-a | Sidebar on ChatGPT | ⬜ | 🔬 | |
| V-EXT-INLINE-b | Sidebar on Claude.ai | ⬜ | 🔬 | |
| V-EXT-INLINE-c | Sidebar on Gemini | ⬜ | 🔬 | |
| V-EXT-INLINE-d | Sidebar on Rufus/Amazon | ⬜ | 🔬 | |
| V-EXT-INLINE-e | Sidebar on Perplexity | ⬜ | 🔬 | |
| V-EXT-INLINE-f | Inline on cart pages | ⬜ | 🔬 | |
| V-EXT-INLINE-g | Inline on product pages (price history) | ⬜ | 🔬 | |
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
