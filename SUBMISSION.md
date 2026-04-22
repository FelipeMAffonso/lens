# Lens — Built with Opus 4.7 Hackathon Submission

## Written summary (100-200 words, for the CV platform)

Every commerce actor has an agent working for them — retailers have pricing algorithms, brands have SEO firms, platforms have ad auctions — except the consumer. **Lens is the consumer's independent agent across every point of every purchase.** Paste any AI shopping recommendation (ChatGPT, Claude, Gemini, Rufus, Perplexity) or just describe what you're looking for. Claude Opus 4.7 parses your stated criteria into a transparent weighted utility function (live sliders), verifies every AI claim against a live catalog, flags confabulations using 73 peer-reviewed Knowledge Packs (34 categories + the complete 16-pattern Brignull dark-pattern taxonomy + 9 regulations tracking FTC/CCPA/DSA status including vacated rules + 7 fee taxonomies + 4 interventions), and fans out to three other frontier models via a separate Claude Managed Agent Worker for a disagreement map. Grounded in a *Nature*-submitted paper (18 models, 382,000 trials) showing AI shopping assistants pick non-optimal products 21% of the time and confabulate reasons 86% of the time. Open-source MIT, fully working at [lens-b1h.pages.dev](https://lens-b1h.pages.dev). Four autonomous pack-maintenance agent loops (validator, enricher, regulation-watcher, product-scraper) keep the knowledge current.

## Required submission fields

- **Project name:** Lens
- **Track:** Build From What You Know
- **GitHub:** https://github.com/FelipeMAffonso/lens
- **Live demo:** https://lens-b1h.pages.dev
- **API:** https://lens-api.webmarinelli.workers.dev
- **Managed Agent Worker:** https://lens-cross-model.webmarinelli.workers.dev
- **License:** MIT
- **Demo video:** (recorded Sun Apr 26 AM; link filled in after upload)

## 3-minute demo video shot list

| t | Action | What's on screen | Voice-over |
|---|---|---|---|
| **0:00** | Open on real ChatGPT conversation | ChatGPT window with "recommend an espresso machine under $400, pressure + build + steam matter most" and its answer recommending De'Longhi Stilosa with three justifications | "I asked ChatGPT to help me buy an espresso machine. It recommended a De'Longhi Stilosa and gave me three reasons. My research paper — 18 AI models, 382,000 trials, submitted to Nature — shows these assistants pick non-optimal products 21% of the time and confabulate reasons 86% of the time. So I built Lens." |
| **0:20** | Cut to https://lens-b1h.pages.dev | Dark-themed Lens dashboard; pack stats ticker at top | "Open Lens. 73 versioned Knowledge Packs covering the full consumer journey." |
| **0:30** | Paste ChatGPT answer, Job 2 mode, click Audit | Stream log populates: extract, search, verify, rank, crossModel events | "I paste the ChatGPT answer. Lens routes through a Cloudflare Worker running Claude Opus 4.7 with adaptive thinking. It detects the category, loads the espresso-machines Knowledge Pack's criteria template, and runs the full pipeline." |
| **0:55** | Result card renders; scroll to Confabulated Claims | Red verdicts: "'stainless-steel build' → MISLEADING: Primary housing is plastic; only the boiler is stainless" and "'$249' → FALSE: Catalog lists at $119" | "Lens catches the confabulation. The pack's evidence references a primary source showing De'Longhi's housing is plastic with a stainless accent. And the $249 price is actually the Dedica Arte, a different model." |
| **1:15** | Drag pressure slider | Ranking re-sorts live; Presswell moves to top | "Every weight is a slider. Drag pressure higher and watch the ranking recompute. Transparent math — no hidden ranking logic." |
| **1:35** | Cross-Model panel | "openai/gpt-4o picked Breville Bambino Plus — agrees with Lens" + synthesis | "The cross-model check runs on a separate Claude Managed Agent Worker. GPT-4o also doesn't pick the Stilosa. The agent synthesizes where models converge and diverge." |
| **1:55** | Switch to Job 1 (query-only) | "office chair under $400, lumbar support + 3D arms" → Audit | "Job 1: no AI in the loop. I just say what I want. Lens derives criteria, ranks real products, shows the math. Most shoppers don't start from a ChatGPT answer — this is the welfare case." |
| **2:15** | Result in ~6 seconds | Spec-optimal + full breakdown | "Six seconds for Job 1. Eighteen seconds for the full audit with cross-model." |
| **2:25** | Extension on Amazon checkout | Inline red badge: "⚠ Lens · 2 patterns detected: hidden-costs, preselection" | "The extension runs a passive dark-pattern scan on any page. Seven pattern types mirrored from the Worker's packs. At checkout, it caught a hidden fee and a pre-checked subscription." |
| **2:40** | Repo shot: github.com/FelipeMAffonso/lens | 35+ commits, CI green | "Everything open source under MIT. 73 packs, each cryptographically attributed to evidence. Four autonomous pack-maintenance agents keep the knowledge current. The FTC vacated the Click-to-Cancel Rule in July 2025 — Lens's pack reflects that status, with California SB-313 still marked in-force." |
| **2:55** | Closing card | "lens-b1h.pages.dev · When the AI gives you a recommendation, Lens gives you the truth." | "Lens." |

## Hackathon rubric mapping

| Criterion | Weight | Lens's answer |
|---|---|---|
| **Impact** | 30% | Every online shopper. Peer-reviewed *Nature*-submitted paper. Regulatory-grade pack registry (FTC/CCPA/DSA) with status tracking. |
| **Demo** | 25% | Two live endpoints, both tested. 3-min video covers Job 1 + Job 2 + extension. 18s full audit, 6s Job 1. |
| **Opus 4.7 use** | 25% | Five capabilities load-bearing: adaptive thinking, web_search_20260209, 1M context, vision, Managed Agent. |
| **Depth & Execution** | 20% | 35+ atomic commits, CI green. 73 packs with primary-source evidence. Four autonomous pack-maintenance agent loops. 11 architecture docs. Two separate Workers + Pages. |

## Special prize targeting

- **Best use of Claude Managed Agents ($5K):** `workers/cross-model/` is a dedicated agent Worker. It owns rate-limit state per provider, runs multi-provider fan-out via `Promise.allSettled`, and produces an Opus 4.7 synthesis. Mirrors the "brain decoupled from hands" pattern from Anthropic's Managed Agents blog.

- **Keep Thinking Prize ($5K):** Lens generalized from "audit an AI answer" to "the consumer's independent agent across every point of every purchase" — 52 workflows × 9 journey stages. 73 packs cover need emergence through end-of-life disposal across jurisdictions: pet food (AAFCO), car seats (FMVSS 213), rental housing (CFPB junk fees), VPN services (audit rigor).

- **Most Creative Opus 4.7 Exploration ($5K):** Pack-maintenance agent loops. Knowledge lives in versioned, cryptographically-attributed JSON packs that *Opus 4.7 agents themselves* maintain on weekly crons. The system improves autonomously.

## Links

- [github.com/FelipeMAffonso/lens](https://github.com/FelipeMAffonso/lens)
- [lens-b1h.pages.dev](https://lens-b1h.pages.dev) — live web dashboard
- `docs/VISION.md`, `docs/COMPETITIVE_POSITIONING.md`, `docs/CONSUMER_WORKFLOWS.md`, `docs/PREFERENCE_INFERENCE.md`, `docs/DELIVERY_ARCHITECTURE.md`, `docs/KNOWLEDGE_ARCHITECTURE.md`, `docs/PACK_AGENTS.md`, `docs/JOURNEY_INTEGRATION.md`, `docs/ARCHITECTURE.md`
