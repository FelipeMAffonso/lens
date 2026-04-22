# Delivery architecture — how each workflow actually runs

`CONSUMER_WORKFLOWS.md` enumerates what Lens does. This document addresses how each workflow is delivered — where the AI lives, what it parses, what data it touches, when it runs, and what the user has to consent to. The 52 workflows are not homogeneous; they vary along at least six axes that determine their delivery mechanism.

## The six axes of delivery variation

Every workflow in Lens can be described by its position on six axes.

### Axis 1 — Agent role

Lens's underlying AI plays one of eight roles per workflow. Most workflows combine two or three:

- **Interpreter** — converts ambiguous human or web input into structured data (preference inference, receipt parsing, screenshot understanding)
- **Researcher** — goes out to the live web for facts (web search, spec sheets, price history, review corpora)
- **Auditor** — evaluates claims against gathered facts (verify, review authenticity, dark pattern detection, counterfeit check)
- **Ranker** — applies transparent deterministic math to produce an ordering (spec-optimal, alternative tiers, welfare delta)
- **Watcher** — persistent background monitoring with alerting (recalls, price drops, subscription renewal, firmware updates)
- **Advocate** — drafts or executes action on the user's behalf (return requests, price-match claims, subscription cancellations)
- **Historian** — logs and aggregates across time (purchase history, welfare delta, preference updating)
- **Translator** — rephrases between registers (legal rights → plain English, manufacturer spec → criterion score)

### Axis 2 — Activation mode

- **User-triggered synchronous.** The user explicitly initiates; Lens responds in one request-cycle within seconds. Example: paste an AI answer, click Audit.
- **User-triggered asynchronous.** The user initiates; Lens responds later via notification. Example: "watch for price drops on this product."
- **Passive embedded.** Extension runs quietly on pages the user visits and surfaces badges or warnings without disrupting browsing. Example: dark-pattern detector highlighting manipulative UI on a checkout page.
- **Autonomous scheduled.** Lens runs on a clock with no user initiation per cycle. Example: daily CPSC recall polling over the user's product history.
- **Autonomous delegated.** Lens acts on the user's behalf under a standing consent. Example: automatically file price-match claims for all purchases within retailer windows.
- **Conversational.** Lens asks questions and the user answers. Example: adaptive preference clarification.

### Axis 3 — Surface

- **Web app** (`apps/web`) — primary UI for user-triggered full flows, preference profiles, welfare-delta dashboard
- **Chrome extension** (`apps/extension`) — in-browser passive scanning + overlays + one-click triggers
- **Worker API** (`workers/api`) — orchestration layer called by web + extension
- **Managed Agents** (`workers/cross-model` + roadmap) — long-running multi-provider fan-outs and scheduled polling
- **Background Cron** (Cloudflare Cron Triggers) — scheduled jobs
- **Email ingestion** (v0.3 — forward receipts to an inbox address)
- **Mobile app** (v0.4 — share-sheet, voice, camera, push)
- **Public API** (v0.5 — Lens Score embeddable endpoint)

### Axis 4 — Parsing strategy

Lens encounters wildly different content types across workflows. Parsing is the second-largest engineering surface after preference inference.

- **Lightweight DOM (known sites).** Predefined selectors for Amazon, ChatGPT, Claude, Gemini, Rufus, Perplexity, common retailers. Fast, reliable, breaks when sites redesign. This is how the extension reads AI chat answers today.
- **Heavyweight semantic (unknown sites).** Full-page DOM or screenshot captured and sent to Opus 4.7 for structured extraction. Slower, robust to layout changes, uses vision for image-heavy pages.
- **PDF / document.** Manufacturer manuals, warranty PDFs, receipts. Use PyMuPDF-equivalent server-side extraction or Opus 4.7 vision on page images.
- **Structured feed.** CPSC, NHTSA, FDA recall feeds; iFixit repairability API; Keepa / CamelCamelCamel price history API. Typed JSON, easy to consume.
- **Image / screenshot.** User-provided via drop, paste, or mobile camera. Opus 4.7 vision (3.75 MP max resolution supported in 4.7).
- **Voice / audio.** User-provided via mic. Transcribed then fed to goal-based preference parsing.
- **Transactional data.** Bank/card feed (via Plaid or similar, v0.5), email receipts (via OAuth, v0.3). Tabular, structured.

Each workflow specifies which parser(s) it needs. Most production workflows combine a lightweight path for common sites and a heavyweight semantic fallback.

### Axis 5 — Data tier (privacy sensitivity)

Every byte Lens processes falls into one of five tiers. Workflows declare which tiers they touch, which determines what consent is required and where the data can live.

- **Tier 0 — In-flight only.** Query text, pasted AI answer, ephemeral extraction output. Processed by the LLM, never persisted. Logged only for audit-trace debugging, scrubbed after 24 hours.
- **Tier 1 — Local-only, device-held.** Preference profile, equipment inventory, recent audit history. Stored in browser localStorage / IndexedDB and/or the extension's storage. Never leaves the device unless the user explicitly exports.
- **Tier 2 — Server-stored, user-keyed.** Opt-in persistent history, watcher subscriptions, welfare-delta aggregation. Stored on the Worker in D1 or KV, encrypted at rest, keyed to a user identifier the user controls. User can delete at any time.
- **Tier 3 — User-provided sensitive.** Forwarded receipts, email-connected account metadata, bank-connected transaction data, medical/dietary preference inputs. Stored only with explicit per-source consent. Ephemeral processing preferred where possible; persistent storage requires an explicit data-retention opt-in with a visible retention window.
- **Tier 4 — Cross-user anonymized.** Aggregate disagreement-ticker data, aggregated welfare-delta statistics by category, AI-lab recommendation accuracy metrics. Only contributed after explicit opt-in, only after k-anonymity buckets reach k ≥ 50 participants.

### Axis 6 — Consent level required

- **Implicit per-session.** User action implies consent for the immediate workflow. Pasting an AI answer is consent to process that text. No persistent consent record required.
- **Explicit one-time.** User saves a preference profile or installs the extension. Consent to the stated scope, no automatic renewal, revocable at any time.
- **Explicit durable.** Email forwarding inbox, bank account connection. Scoped, with a documented retention window and revocation path.
- **Explicit per-action autonomous.** User authorizes a specific automated action ("file a price-match claim for this purchase"). Single-use, specific-scope.
- **Explicit delegated autonomous.** User authorizes a standing automation ("auto-file all price-match claims for me"). Ongoing, revocable, bounded by an explicit policy (e.g. "never file more than $500 per quarter without re-asking").
- **Explicit data-contribution.** User opts in to anonymized aggregation for public datasets (the disagreement ticker, welfare-delta-by-category). Revocable with prospective effect only (past contributions cannot be un-aggregated from k-anonymous buckets).

## Workflow delivery matrix

For each of the 52 workflows in `CONSUMER_WORKFLOWS.md`, this section specifies the position on all six axes. The matrix is read left to right; columns map to the six axes.

### Stage 0 — Need emergence

| W# | Workflow | Agent role | Activation | Surface | Parsing | Data tier | Consent |
|----|----------|------------|------------|---------|---------|-----------|---------|
| 1 | Ad-influence traceback | Interpreter + Historian | Passive embedded | Extension | Lightweight DOM + referrer chain | 1 (local) | Explicit one-time |
| 2 | Scheduled-replacement reminders | Watcher | Autonomous scheduled | Background Cron + Worker | Historian — reads purchase log | 2 (server) | Explicit durable |
| 3 | Trigger-based purchase alerts | Watcher + Researcher | Autonomous scheduled | Managed Agent + Worker | Structured feed + live web search | 2 (server) | Explicit durable |
| 4 | Pre-need category onboarding | Interpreter + Ranker | User-triggered sync | Web app + Worker | Heavyweight semantic on suggested products | 1 (local) | Implicit |
| 5 | Subscription discovery | Historian + Auditor | User-triggered async | Email ingestion + Worker | Receipt parsing (PDF/email) | 3 (sensitive) | Explicit durable |

### Stage 1 — Discovery

| W# | Workflow | Agent role | Activation | Surface | Parsing | Data tier | Consent |
|----|----------|------------|------------|---------|---------|-----------|---------|
| 6 | Category exploration | Researcher + Ranker | User-triggered sync | Web app + Worker | Heavyweight semantic | 1 (local) | Implicit |
| 7 | Lifestyle bundles | Researcher + Ranker | User-triggered sync | Web app + Worker | Heavyweight semantic | 1 (local) | Implicit |
| 8 | Preference elicitation ★ | Interpreter | User-triggered sync (+ Conversational on ambiguity) | Web app + Worker | N/A (natural language) | 1 (local profile) | Implicit for query, Explicit one-time for profile save |
| 9 | Comparative framing help | Interpreter + Researcher | User-triggered sync | Web app + Worker | Heavyweight semantic | 1 (local) | Implicit |

### Stage 2 — Research

| W# | Workflow | Agent role | Activation | Surface | Parsing | Data tier | Consent |
|----|----------|------------|------------|---------|---------|-----------|---------|
| 10 | Spec-optimal discovery ★ | Researcher + Ranker | User-triggered sync | Web app + Worker | Lightweight DOM (known retailers) + heavyweight fallback | 1 (local) | Implicit |
| 11 | Alternative surfacing | Ranker | Derived from W10 | Web app | N/A (derived) | 1 (local) | Implicit |
| 12 | Cross-assistant disagreement ★ | Researcher (multi-provider) | User-triggered sync | Managed Agent | Structured JSON from 3 providers | 0 (in-flight) | Implicit |
| 13 | Vendor vs independent source weighting | Auditor + Translator | Settings-level | Web app | N/A (applies to all workflows) | 1 (local) | Explicit one-time |

### Stage 3 — Evaluation

| W# | Workflow | Agent role | Activation | Surface | Parsing | Data tier | Consent |
|----|----------|------------|------------|---------|---------|-----------|---------|
| 14 | AI recommendation audit ★ | Interpreter + Researcher + Auditor + Ranker | User-triggered sync OR Passive extension | Web app + Extension + Worker | Lightweight DOM (ChatGPT/Claude/Gemini/Rufus) OR image (screenshot) | 0 in-flight | Implicit |
| 15 | Single-URL evaluation | Interpreter + Researcher + Ranker | User-triggered sync | Web app + Worker | Lightweight DOM (known retailer) + heavyweight semantic fallback | 0 in-flight | Implicit |
| 16 | Source provenance | Auditor + Researcher | User-triggered sync | Worker | Heavyweight semantic on cited URLs | 0 in-flight | Implicit |
| 17 | Review authenticity | Auditor | User-triggered sync | Web app + Extension + Worker | Lightweight DOM (Amazon reviews) + heavyweight | 0 in-flight | Implicit |
| 18 | Counterfeit check | Auditor | Passive embedded on marketplace pages | Extension | Lightweight DOM + image search | 0 in-flight | Explicit one-time (for extension install) |
| 19 | Sponsorship scanner | Auditor + Translator | Passive embedded | Extension | Lightweight DOM (blog/YouTube) + semantic | 0 in-flight | Explicit one-time |
| 20 | Claim verification ★ | Auditor | User-triggered sync (within W14/15) | Worker | N/A (uses spec sheets already loaded) | 0 in-flight | Implicit |

### Stage 4 — Decision & purchase

| W# | Workflow | Agent role | Activation | Surface | Parsing | Data tier | Consent |
|----|----------|------------|------------|---------|---------|-----------|---------|
| 21 | Price history + sale-legit | Researcher + Auditor | Passive embedded on product pages | Extension + Worker | Structured feed (Keepa/Camel API) | 0 in-flight | Explicit one-time |
| 22 | Dark-pattern checkout scan | Auditor | Passive embedded on checkout | Extension | Lightweight DOM + CSS heuristics + LLM-on-suspicious | 0 in-flight | Explicit one-time |
| 23 | Compatibility check | Interpreter + Auditor | User-triggered sync | Web app + Worker | Heavyweight semantic on target product + profile | 1 (local equipment profile) | Implicit |
| 24 | True-total-cost reveal | Researcher + Auditor + Translator | User-triggered sync OR passive embedded | Web app + Extension + Worker | Lightweight DOM (cart page) + heavyweight for hidden fees | 0 in-flight | Implicit |
| 25 | Data-disclosure audit | Interpreter + Translator | User-triggered sync | Web app + Worker | Heavyweight semantic on privacy policy | 0 in-flight | Implicit |
| 26 | Breach-history on seller | Researcher | User-triggered sync | Worker | Structured feed (HIBP, state AG data) | 0 in-flight | Implicit |
| 27 | Scam / fraud detection | Auditor | Passive embedded OR user-triggered sync | Extension + Worker | Heavyweight semantic + reverse image search + WHOIS lookup | 0 in-flight | Explicit one-time |
| 28 | Checkout-readiness summary | Auditor + Ranker + Translator | User-triggered sync | Extension overlay | Aggregation of W14-W27 outputs | 0 in-flight | Implicit |

### Stage 5 — Delivery & setup

| W# | Workflow | Agent role | Activation | Surface | Parsing | Data tier | Consent |
|----|----------|------------|------------|---------|---------|-----------|---------|
| 29 | Unboxing / DOA verification | Interpreter + Auditor | User-triggered sync | Mobile app (v0.4) / Web upload | Image (screenshot/photo) | 0 in-flight | Implicit |
| 30 | Setup instruction aggregation | Researcher + Translator | User-triggered sync | Web app + Worker | Heavyweight semantic + structured feeds (iFixit) | 0 in-flight | Implicit |
| 31 | Warranty reality check | Researcher + Auditor | User-triggered sync | Web app + Worker | Heavyweight semantic + structured (BBB, Reddit) | 0 in-flight | Implicit |

### Stage 6 — Post-purchase validation

| W# | Workflow | Agent role | Activation | Surface | Parsing | Data tier | Consent |
|----|----------|------------|------------|---------|---------|-----------|---------|
| 32 | Welfare-delta analytic | Historian + Ranker | Autonomous derived | Web app + Worker | N/A (aggregation of audit history) | 2 (server) | Explicit durable |
| 33 | Recall monitoring | Watcher | Autonomous scheduled | Managed Agent + Cron | Structured feed (CPSC/NHTSA/FDA) | 2 (server) | Explicit durable |
| 34 | Price-drop refund triggering | Watcher + Advocate | Autonomous delegated | Managed Agent + Cron | Structured feed + retailer APIs | 2 (server) | Explicit delegated autonomous |
| 35 | Returns / warranty assistance | Advocate + Translator | User-triggered sync | Web app + Worker | User input + legal-rights knowledge | 3 (sensitive) | Explicit per-action |
| 36 | Subscription audit & cancellation | Auditor + Advocate | User-triggered async | Web app + Email + Worker | Email receipt parsing | 3 (sensitive) | Explicit durable |
| 37 | Product-performance tracking | Historian | User-triggered | Web app | User input | 2 (server) | Explicit one-time |

### Stage 7 — Ongoing use

| W# | Workflow | Agent role | Activation | Surface | Parsing | Data tier | Consent |
|----|----------|------------|------------|---------|---------|-----------|---------|
| 38 | Firmware monitoring | Watcher | Autonomous scheduled | Managed Agent + Cron | Structured feed + vendor sites | 2 (server) | Explicit durable |
| 39 | Compatible-accessory discovery | Interpreter + Researcher + Ranker | User-triggered sync | Web app + Worker | Heavyweight semantic | 1 (local profile) | Implicit |
| 40 | Lock-in cost tracking | Historian | Autonomous derived | Web app + Worker | Aggregation | 2 (server) | Explicit durable |
| 41 | Repairability tracking | Researcher | User-triggered sync | Web app + Worker | Structured feed (iFixit API) | 0 in-flight | Implicit |

### Stage 8 — End of life

| W# | Workflow | Agent role | Activation | Surface | Parsing | Data tier | Consent |
|----|----------|------------|------------|---------|---------|-----------|---------|
| 42 | Resale-value estimation | Researcher | User-triggered sync | Web app + Worker | Structured (eBay sold / Swappa / Back Market) | 0 in-flight | Implicit |
| 43 | Recycling / disposal routing | Researcher | User-triggered sync | Web app + Worker | Structured feed (EPA, municipal) | 0 in-flight | Implicit |
| 44 | Trade-in optimization | Researcher + Ranker | User-triggered sync | Web app + Worker | Heavyweight semantic (retailer trade-in pages) | 0 in-flight | Implicit |
| 45 | Upgrade-timing analysis | Researcher + Ranker + Historian | User-triggered sync | Web app + Worker | Heavyweight semantic + history | 1 (local) + 2 (server) | Explicit durable |

### Cross-journey

| W# | Workflow | Agent role | Activation | Surface | Parsing | Data tier | Consent |
|----|----------|------------|------------|---------|---------|-----------|---------|
| 46 | Values overlay | Interpreter + Researcher | Settings-level | Web app | N/A | 1 (local) | Explicit one-time |
| 47 | Family / household profiles | Historian | Settings-level | Web app + Worker | N/A | 2 (server) | Explicit durable |
| 48 | Gift-buying mode | Interpreter | User-triggered sync | Web app + Worker | Shared link input | 1 (local) | Implicit |
| 49 | Group-buy pooling | Advocate | User-triggered async | Web app + Worker | User input + coordination | 2 (server) | Explicit per-action |
| 50 | Profile portability | Historian | User-triggered sync | Web app + export file | Signed JSON | 1 (local) | Implicit |
| 51 | Public disagreement ticker | Historian | Autonomous derived | Public dashboard + Worker | Aggregation of audit history | 4 (anonymized) | Explicit data-contribution |
| 52 | Lens Score API | Ranker + Researcher | Public API | Public endpoint | N/A (takes product URL, returns score) | 0 in-flight | Publisher's consent (implicit per-request) |

## Parsing strategies per content type — the deep engineering

The parser layer is where the 52 workflows meet the messy reality of the web. Per content type:

### AI chat UIs (ChatGPT, Claude, Gemini, Rufus, Perplexity)

Each assistant ships a different DOM structure. The extension ships hardcoded lightweight selectors today (`apps/extension/content.ts`) and falls back to Opus 4.7 vision when the DOM parse fails or returns implausibly short content. The fallback is important because these UIs change frequently; relying only on DOM selectors breaks in production.

### Product pages

Amazon, Best Buy, Target, Walmart, manufacturer stores, Shopify merchants — each has site-specific structure. The extension ships a growing set of per-site selectors and falls back to heavyweight semantic extraction for unknown sites. The fallback is Opus 4.7 reading the page DOM (or a screenshot) with a structured-output prompt that asks for `{name, brand, price, currency, specs, reviews_summary, warranty, url}`.

### Review corpora

Review authenticity analysis (W17) needs the full review list, not just the summary. On Amazon this means paginating through reviews; on smaller sites it is often all inline. The Worker handles pagination and sends consolidated review text to Opus 4.7 with a 1M-context prompt that looks at all reviews simultaneously for the temporal-cluster, language-homogeneity, and verified-purchase-ratio signals.

### Privacy policies, terms of service, warranty text

Long unstructured documents. Opus 4.7's 1M context handles these directly. Output is a structured summary with specific flags: does this policy allow data resale, are there dark-pattern consent traps, what is the actual warranty scope vs. the marketed scope.

### PDFs (manuals, warranty cards, receipts)

Server-side extraction via PyMuPDF-equivalent + vision for page images. Receipts especially are often images, so the vision path is primary.

### Dark-pattern detection

Two-stage pipeline drawn from the current research literature: a lightweight CSS/DOM classifier identifies suspicious UI elements (countdown timers, pre-checked boxes, roach-motel opt-outs), and flagged elements are then confirmed by Opus 4.7 with a brief classification prompt. This mirrors the two-stage pipeline used by existing research tools like UC Berkeley's Deceptive Pattern Detector and the Dapde Pattern Highlighter, which run a MiniLM + XGBoost classifier first and escalate only suspect matches ([arxiv 2411.07441](https://arxiv.org/html/2411.07441v1); [Deceptive Pattern Detector, UC Berkeley](https://www.ischool.berkeley.edu/projects/2026/deceptive-pattern-detector); [Dapde Pattern Highlighter](https://github.com/Dapde/Pattern-Highlighter)). This two-stage pattern matters because running a full LLM call on every page element would be prohibitive on cost and latency; a cheap classifier gates the expensive call.

### Structured feeds

CPSC, NHTSA, FDA recall APIs; iFixit repairability scores; Keepa / CamelCamelCamel price history; Have I Been Pwned breach API; BBB complaint data where public. These are straight JSON consumption, cached in KV with short TTL.

### Images and screenshots

Opus 4.7 vision (3.75 MP max resolution). Used for screenshot input (mobile users audit AI chats from their phone), for unboxing/DOA verification (user photographs received product), and for reverse-image search in counterfeit detection.

### Voice (v0.3 and later)

User dictates preferences on mobile. Transcribed (via OpenAI Whisper or equivalent) then fed to the goal-based parsing pipeline.

## The agent-type-to-workflow map

Having established axes and workflows, the following summary makes clear that Lens is not one agent — it is a family of specialized agents, each tuned to a specific role and data profile.

- **The Preference Interpreter.** Lives in the Worker. Called by every user-triggered workflow at the entry point. Uses Opus 4.7 adaptive thinking. Uses Tier 0 and Tier 1 data only.
- **The Product Researcher.** Lives in the Worker. Called by Researcher workflows (spec-optimal, alternatives, single-URL, price history). Uses Opus 4.7 web_search + 1M context. Tier 0 data.
- **The Claim Auditor.** Lives in the Worker. Called inside every audit and by passive-embedded workflows (review authenticity, source provenance, dark patterns). Opus 4.7 + 1M context. Tier 0.
- **The Cross-Model Agent.** Lives as a Claude Managed Agent. Called by workflow 12. Fans out to GPT-5, Gemini 3, Kimi K2 (or substitutes). Long-running, rate-limited, retryable. Tier 0.
- **The Watchers.** Live as scheduled Cloudflare Cron Triggers. Poll CPSC, NHTSA, FDA, Keepa, HIBP, iFixit, vendor firmware feeds. Tier 2 data (need to know what the user owns). Explicit durable consent.
- **The Advocates.** Live as Worker endpoints triggered by the user or by Watcher alerts. Draft returns, file price-match claims, cancel subscriptions. Tier 3 data where sensitive. Explicit per-action or delegated-autonomous consent.
- **The Historian.** Lives in D1 + Worker. Aggregates audit history, computes welfare-delta, maintains preference-profile longitudinal state. Tier 2 primary, Tier 4 when aggregated.
- **The Extension.** Passive embedded agent. Runs scanners on every page the user visits (with permission), triggers the heavier Workers only when a user-actionable signal fires. Keeps itself cheap by doing CSS and simple heuristics locally before escalating to LLM calls.

This breakdown is what makes the 52-workflow scope tractable: not 52 separate agents, but eight agent types that each cover 3-10 workflows through configuration and prompting.

## What ships in the hackathon

The demo exercises five of the eight agent types end-to-end:

- **Preference Interpreter** — already live in `workers/api/src/extract.ts`.
- **Product Researcher** — live in `workers/api/src/search.ts` (fixture mode and real-web mode both implemented).
- **Claim Auditor** — live in `workers/api/src/verify.ts`.
- **Cross-Model Agent** — Day 3 refactor from direct fanout to Claude Managed Agent.
- **The Extension** — Day 4, MVP with ChatGPT/Claude/Gemini/Rufus selectors + one-click audit.

Watchers, Advocates, and the Historian are roadmap v0.2-v0.5. The delivery matrix above documents every one of their workflows so the scope is explicit.

## References

- [Eliciting Human Preferences with Language Models (OpenReview)](https://openreview.net/forum?id=LvDwwAgMEW)
- [Automatically Detecting Online Deceptive Patterns in Real-time (arxiv 2411.07441)](https://arxiv.org/html/2411.07441v1)
- [Deceptive Pattern Detector — UC Berkeley School of Information](https://www.ischool.berkeley.edu/projects/2026/deceptive-pattern-detector)
- [Dapde Pattern Highlighter (GitHub)](https://github.com/Dapde/Pattern-Highlighter)
- [FTC, ICPEN, GPEN 2024 dark-patterns review: 76% of 642 sites use at least one dark pattern](https://www.ftc.gov/news-events/news/press-releases/2024/07/ftc-icpen-gpen-announce-results-review-use-dark-patterns-affecting-subscription-services-privacy)
- [The effect of preference elicitation methods on user experience in CRS (ScienceDirect)](https://www.sciencedirect.com/science/article/pii/S0885230824000792)
