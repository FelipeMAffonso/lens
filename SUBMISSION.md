# Lens — Built with Opus 4.7 Hackathon Submission

## Written summary (100-200 words)

Every commerce actor has an agent working for them — retailers have pricing algorithms, brands have SEO firms, platforms have ad auctions — except the consumer. **Lens is the consumer's AI shopping companion across every point of every purchase: before you buy, while you shop, and long after.**

Tell Lens what you want, paste what another AI told you, drop any product URL, or attach a photo. Claude Opus 4.7 runs a 5-stage pipeline — extract, search (real catalog + live web), verify, rank with transparent `U = Σ wᵢ·sᵢ` math, cross-check against GPT-4o / Gemini / Llama via a Claude Managed Agent — and returns one answer. No sliders: tell Lens "make it quieter" or "budget tight at $300" in plain language; Opus parses the change into weight deltas and the ranking re-computes live.

Lens ships across four surfaces: a web chat companion (lens-b1h.pages.dev), a Chrome extension that silently catches dark patterns, hidden fees, fake sales, counterfeits, and fake reviews at retailer checkouts, a mobile PWA, and background watchers (7 Cloudflare crons) that cross-match your purchases against CPSC / NHTSA / FDA recalls, price-drop refund windows, firmware CVEs, and subscription renewals. Every fact is triangulated from ≥ 2 independent public sources (85,918 SKUs · 24 contributing sources · 9,518 recalls · 18,806 regulations · 120 packs). Grounded in a *Nature*-submitted paper (Affonso et al., 2026 — 18 models, 382K trials) showing AI shopping assistants pick non-optimal products 21% of the time and confabulate reasons 86% of the time. Open-source MIT. No affiliate links. Ever.

## Required submission fields

- **Project name:** Lens
- **Track:** Build From What You Know / Build A Tool That Should Exist
- **GitHub:** https://github.com/FelipeMAffonso/lens
- **Live web:** https://lens-b1h.pages.dev
- **API:** https://lens-api.webmarinelli.workers.dev
- **OpenAPI docs:** https://lens-api.webmarinelli.workers.dev/docs
- **MCP server:** `workers/mcp/` (13 tools exposed)
- **License:** MIT
- **Demo video:** (recorded Sat Apr 26; link filled in after upload)

## 3-minute demo video script — Sarah's Monday

The video follows the canonical VISION §3 narrative: one user, one companion, four touchpoints.

| t | Action | On screen | Voice-over |
|---|---|---|---|
| **0:00–0:10** | Open on https://lens-b1h.pages.dev | "Meet Lens." hero + centred chat input + 4 soft example chips (☕ Espresso, 💻 Laptop, 🎧 ANC, 🪑 Chair) | "Every online shopper has a half-dozen agents working against them — retailers, brands, platforms. Lens is the one working for you." |
| **0:10–0:30** | Type "I need an espresso machine under $400, build quality and pressure matter most" → Enter | Chat bubble appears; Lens replies in Oracle voice: "I'll consult every frontier model plus real product data"; rotating status appears below: "Understanding what you need (espresso-machines) → Looking at 47 real products across retailers → Double-checking 0 AI claims → Best match so far: Breville Bambino → Other frontier models: 2 of 3 agree with Lens" | "Lens streams the pipeline. Each label is a real event from the Worker — extract, search, verify, rank, cross-check. No fake progress bars." |
| **0:30–1:00** | Audit card drops: hero pick = Breville Bambino with triangulation chip "◎ median $347 · 5 retailers · $329–$362"; trust signals chips (scam safe / breach low / price-history genuine); cross-model card "✓ GPT agrees · Claude picks differently" | Zoom into the chip + retailer link with no `?tag=` / `?ref=` params | "Triangulated across five retailers. No affiliate links, ever. This retailer URL is scrubbed of every tracking parameter in code — any commit that adds one fails the project rule." |
| **1:00–1:25** | Type in the criteria card: "make it quieter" → Enter | Status line: "Lens is parsing your change" → 2s later: "added noise_cancellation criterion to prioritise quieter espresso. Changed: build_quality ↓ 40→33%, price ↓ 30→25%, noise ↑ 0→17%" + chip grid animates + hero pick may swap | "No sliders. I just say what matters more. Opus parses it, re-normalises the weights to sum 1, the rank re-computes with the new criterion — even new criteria I didn't mention, if Lens thinks they fit." |
| **1:25–1:55** | Scroll to Sarah's-day narrative; click "Install the Chrome extension" CTA | Download chrome://extensions install flow (load-unpacked) + visit marriott.com booking page; extension pins a small amber badge: "⚠ Hidden cost: $49/night resort fee. Covered by FTC Junk Fees Rule (16 CFR Part 464). Draft a complaint?" | "Lens isn't just the chat. The extension sits on every retailer page silently. On Marriott's checkout it caught a $49/night destination amenity fee that wasn't on the product page — a pattern covered by the FTC Junk Fees Rule. Tap draft and Lens pre-fills reportfraud.ftc.gov with the booking details." |
| **1:55–2:20** | Click "Your Shelf ↗" in the nav | `/shelf` page loads with 6 cards. Focus on the Roborock S8 card (alert state): "CPSC recall #24-189 · Magnuson-Moss letter drafted" with "Send the return letter" primary button | "Your Shelf is the after-you-buy surface. Lens cross-matches your purchases against daily CPSC / NHTSA / FDA recall feeds, 8-retailer price-match windows, firmware CVE feeds, and auto-renewal calendars. On Sarah's shelf: a recalled Roborock, a $47 price-drop refund at Best Buy, a Netflix renewal she'd forgotten. Every intervention pre-drafted." |
| **2:20–2:45** | Cut to /architecture.html | Live stat block: "85,918 indexed SKUs · 24 contributing sources · 120 packs · 9,518 recalls · 18,806 regulations"; the 8-agent grid; the 7-cron schedule | "The receipts. 24 public data sources contributing triangulated facts. 7 Cloudflare crons. 8 agents, each with a runtime location and Opus 4.7 capability it uses. Every line of this page fetches from a live endpoint — you're seeing production state." |
| **2:45–3:00** | Closing card with logo | "Lens · Your AI shopping companion · lens-b1h.pages.dev · MIT · No affiliate links, ever." | "Open-source MIT. Grounded in a *Nature*-submitted paper on AI recommendation bias. Every Lens hand is live today." |

Tooling: OBS Studio (Windows) or Screen Studio (macOS). 1080p, 30fps, system-audio + mic. Upload to YouTube unlisted. Link added to README.md + this file after upload.

## Hackathon rubric mapping

| Criterion | Weight | Lens's answer |
|---|---|---|
| **Impact** | 30% | Every online shopper. Peer-reviewed *Nature*-submitted paper (Affonso et al., 2026 — 18 models × 382K trials). Regulatory-grade pack registry (16 US + EU regulations, current status including vacated rules). |
| **Demo** | 25% | 4 surfaces in one 3-minute arc (chat → extension → shelf → architecture). Real pipeline narration via SSE. Every Lens hand shown is installable today. |
| **Opus 4.7 use** | 25% | 6 capabilities load-bearing: adaptive thinking (extract + clarifier + NL preference parser), 1M context (verify pass loads every candidate + every claim), server-side web search (live product discovery), vision 3.75 MP (photo-of-product mode + /visual-audit), Managed Agents (cross-model fan-out), structured JSON extraction (Opus + Jina markdown replaces regex on hard retailer pages). |
| **Depth & Execution** | 20% | 245+ atomic commits. 28 D1 migrations. 120 packs (59 category + 24 dark-pattern + 16 regulation + 14 fee + 8 intervention). 39 ingester files pulling from 24+ live public APIs. 9 workflow specs. 7 cron schedules. 112 HTTP routes. 13 MCP tools. 4 surfaces (web chat, Chrome extension, mobile PWA, MCP). 1000+ tests. |

## Special prize targeting

- **Best use of Claude Managed Agents ($5K):** `workers/cross-model/` runs multi-provider fan-out via `Promise.allSettled`. Each audit's cross-model panel is a managed-agent orchestration — the brain (Opus 4.7) decoupled from the hands (GPT-4o / Gemini / Llama calls). The agent owns rate-limit state per provider and produces an Opus synthesis of where frontier models agree and diverge.

- **Keep Thinking Prize ($5K):** Lens generalised from "audit an AI answer" to "your AI shopping companion across every touchpoint." One backend powers 4 surfaces — chat, passive extension, post-purchase watchers, developer MCP. 85,918 SKUs, 24 data sources, 120 packs span pet food (AAFCO), car seats (FMVSS 213), short-term lodging (FTC Junk Fees Rule), firmware CVEs (CISA KEV + NVD), subscription-cancellation law (state-by-state).

- **Most Creative Opus 4.7 Exploration ($5K):** Natural-language preference adjustment replaces sliders entirely. User types "make it quieter" or "budget tight at $300", Opus 4.7 adaptive-thinking parses the change into per-criterion weight deltas (capped at ±0.30), can introduce new criteria on the fly, renormalises sum=1, the deterministic rank engine re-runs client-side. The UI has no range inputs. The math is still inspectable — the entire chip grid animates with the new weights — but the control surface is language.

## Sarah's Monday — the scenario behind the demo

One user, one companion, four touchpoints (all four wired, all four live):

1. **9:14 AM — ChatGPT.** Sarah asks ChatGPT for an espresso machine under $400. It recommends a De'Longhi with three reasons. The Lens extension pill appears in the corner of the response bubble. One click opens Lens inline showing the spec-optimal Breville Bambino plus the "stainless-steel" claim flagged as misleading, plus cross-model dissent.
2. **2:41 PM — Marriott.com.** Sarah books a hotel. At checkout a $49/night resort fee that wasn't on the product page appears. The Lens extension catches it silently, pins a badge citing the FTC Junk Fees Rule (16 CFR Part 464), drafts the reportfraud.ftc.gov complaint.
3. **7:00 PM Friday — Inbox.** Sarah's weekly Lens digest: "Across your last 10 AI-assisted audits, Lens picked +$312 / +0.15 utility over the AIs. 3 subscriptions auto-renew next week — want drafts for the ones you'd cancel?"
4. **Two months later — Push.** CPSC recalls the Roborock Sarah bought in February. Lens drafts a Magnuson-Moss return letter filled in with the purchase details. One tap sends.

## Links

- **Repo:** https://github.com/FelipeMAffonso/lens
- **Live chat + shelf:** https://lens-b1h.pages.dev
- **Shelf preview (Sarah scenario):** https://lens-b1h.pages.dev/shelf
- **Architecture appendix:** https://lens-b1h.pages.dev/architecture.html
- **OpenAPI / Scalar docs:** https://lens-api.webmarinelli.workers.dev/docs
- **Chrome extension .zip:** https://lens-b1h.pages.dev/downloads/lens-extension.zip

## Design docs (in repo)

- `VISION_COMPLETE.md` — canonical vision
- `AMBIENT_MODEL.md` — two-stage passive model
- `LOOP_DISCIPLINE.md` — anti-drift contract + Apple-product bar
- `IMPROVEMENT_PLAN_V2.md` — 4-day sprint plan
- `docs/VISION.md`, `docs/COMPETITIVE_POSITIONING.md`, `docs/DELIVERY_ARCHITECTURE.md`, `docs/KNOWLEDGE_ARCHITECTURE.md`, `docs/DATA_SOURCES.md`
