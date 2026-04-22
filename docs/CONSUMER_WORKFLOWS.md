# Consumer workflows — the complete customer journey surface

Lens is not a product feature, a browser extension, or an AI audit tool. It is the consumer's **independent agent across the entire customer journey**, from the moment a need first surfaces through every interaction with the product over its lifetime and the eventual disposal or replacement. The commerce stack has powerful agents working for retailers (ranking algorithms), manufacturers (marketing funnels), platforms (ad auctions), and sellers (pricing optimization). It has essentially no agent working only for the consumer. Lens is that agent.

The spec-resistance paper is evidence that one specific harm (AI shopping recommendation bias) is real and measurable. The product is much broader: a single unified pipeline that takes the consumer's stated preferences, applies deterministic transparent math, verifies every claim against independent sources, and does this at every touchpoint where the consumer's welfare is at stake.

This document maps every workflow Lens can credibly deliver, organized by the nine stages of a full purchase journey. Each workflow is tagged with its stage, the Claude Opus 4.7 capability that enables it, the consumer harm it addresses, and whether it ships in the hackathon demo or lives on the roadmap.

## The unifying principle

**Every commerce actor except the consumer has an agent. Lens is the consumer's agent.**

Retailers have pricing optimization software. Brands have SEO firms. Platforms have ad auctions. Manufacturers have influencer networks. Affiliates have tracking pixels. Reviewers have affiliate commissions. Analytics platforms have sponsor relationships. Even "consumer advocacy" media has advertising revenue tied to the products they evaluate.

The consumer alone walks into the transaction with no representation. Lens is the counter-party to every other agent in the commerce stack, structured so that nothing — no commission, no ad revenue, no partner relationship, no catalog ownership — can bias its answer. Because its only revenue model is serving the consumer, its only allegiance is to the consumer's welfare.

This framing is what makes the scope of Lens coherent despite its breadth. Every workflow below is the same three operations: **infer the consumer's preferences, apply transparent math, verify against independent sources.** The variety comes from the many touchpoints at which those three operations need to happen.

## Taxonomy of consumer harms Lens addresses

| # | Harm | Evidence | Workflows |
|---|---|---|---|
| H1 | AI recommendation bias | Affonso 2026 (18 models, 382K trials): 21% non-optimal, 86% confabulation | 12-16 |
| H2 | Opaque spec claims | Affonso 2026 + every product page | 14, 20 |
| H3 | Fake / incentivized reviews | FTC 2024 final rule on fake reviews; ~42% of Amazon reviews flagged "unreliable" | 17 |
| H4 | Dark patterns in checkout | FTC 2023 "Bringing Dark Patterns to Light" report | 22 |
| H5 | Surveillance / algorithmic pricing | FTC Jan 2025 findings: 2-5% margin boost; 72% of Americans oppose | 21 |
| H6 | Hidden fees | FTC Junk Fees rulemaking 2024 | 24 |
| H7 | Fake sales / price anchoring | CA AB-660, state AG actions | 21 |
| H8 | Lock-in / forced ecosystem captivity | Right-to-Repair movement; DOJ antitrust cases | 23, 40 |
| H9 | Undisclosed sponsorship / affiliate | FTC Endorsement Guide violations | 19 |
| H10 | Warranty gap (stated vs honored) | Magnuson-Moss Warranty Act enforcement gaps | 31 |
| H11 | Subscription trap / auto-renewal | CA SB-313, FTC Click-to-Cancel rulemaking | 36 |
| H12 | Recall non-notification | CPSC/NHTSA underreporting | 33 |
| H13 | Planned obsolescence | Right-to-Repair research | 41, 42 |
| H14 | Data-collection-by-purchase | GDPR/CCPA violations, data-broker resale | 25 |
| H15 | Identity-theft / breach exposure | Have I Been Pwned, FTC breach reporting | 26 |
| H16 | Scam / fraud / counterfeit product | BBB Scam Tracker, Amazon counterfeits | 18, 27 |
| H17 | Price-match / price-adjustment un-claimed | Retailer policies systematically underclaimed | 34 |

## Stage 0 — Need emergence (before shopping even starts)

**Workflow 1. Ad-influence traceback.** The user hovers over a product they're about to research and asks "why did this come up?" Lens traces the likely discovery path: which ad, which influencer mention, which algorithmic recommendation, which affiliate-driven blog post. Makes attention-manipulation visible.
- Opus capability: web search + adaptive thinking
- Ships: roadmap v0.4

**Workflow 2. Scheduled-replacement reminders.** The user's profile knows when they bought consumables (toothbrush heads, filters, shoes that are distance-rated). Lens reminds them before the seller does, so the reminder is tied to actual use rather than the seller's preferred re-engagement cadence.
- Opus capability: scheduled polling
- Ships: roadmap v0.3

**Workflow 3. Trigger-based purchase alerts.** User sets criteria and a budget; Lens watches the market and notifies when a product hits the utility-and-price threshold. Unlike keyword alerts, this uses the full preference profile.
- Opus capability: web search + Managed Agent scheduled polling
- Ships: roadmap v0.4

**Workflow 4. Pre-need category onboarding.** User says "I'm moving to SF, what do I need for the apartment?" or "I'm starting sourdough baking" — Lens produces a budget-partitioned essentials list with the reasoning visible.
- Opus capability: adaptive thinking + web search + 1M context
- Ships: roadmap v0.3

**Workflow 5. Subscription discovery.** User connects email or forwards receipts; Lens catalogs every active subscription with renewal dates, auto-renewal status, and cancellation URLs.
- Opus capability: vision + adaptive thinking
- Ships: roadmap v0.2

## Stage 1 — Discovery and inspiration (the user knows a need but not the options)

**Workflow 6. Category exploration.** Map the product space at the user's budget. At $400 for espresso, the frontier shows Stilosa-class (low pressure, plastic), Bambino-class (mid pressure, stainless), Classic-Evo-class (full steel, manual). The user sees the trade-offs laid out before consulting any assistant.
- Opus capability: web search + 1M context
- Ships: hackathon demo (within Workflow 11)

**Workflow 7. Lifestyle-driven bundles.** "I'm moving into an empty apartment on a $2000 furniture budget" — Lens proposes complete configurations with substitution alternatives at each price tier.
- Opus capability: adaptive thinking + web search
- Ships: roadmap v0.3

**Workflow 8. Preference elicitation.** The user types, dictates, or sketches roughly what they want. Lens parses into a weighted utility function, saves to the per-category profile, lets the user adjust or override.
- Opus capability: adaptive thinking (voice input via vision/audio in v0.3)
- Ships: hackathon demo

**Workflow 9. Comparative framing help.** User is choosing between two broad approaches (mirrorless vs DSLR; owned vs leased; new vs refurbished) and does not have priors. Lens structures the trade-space and suggests which criteria most discriminate between the approaches.
- Opus capability: adaptive thinking + web search
- Ships: roadmap v0.3

## Stage 2 — Research (actively evaluating options before picking)

**Workflow 10. Spec-optimal discovery.** Given the inferred utility function, Lens ranks real candidates with every weight and score inspectable; live sliders re-rank on the fly.
- Opus capability: web search + 1M context + deterministic utility math
- Ships: hackathon demo ★

**Workflow 11. Alternative surfacing at price tiers.** "Show me the spec-optimal at 75%, 50%, and 25% of this price point." Lens returns three Pareto-alternatives with the utility-gap-per-dollar visible.
- Opus capability: web search + 1M context
- Ships: hackathon demo

**Workflow 12. Cross-assistant disagreement map (standalone).** Same question, asked of three frontier models in parallel via a Claude Managed Agent. The user sees where labs agree and disagree *before* trusting any single answer.
- Opus capability: Claude Managed Agent fan-out
- Ships: hackathon demo ★

**Workflow 13. Vendor vs independent source weighting.** For every piece of information Lens uses to score a candidate, it distinguishes manufacturer-published (marketing) from independent third-party (reviews, teardown labs). The user can set weights for how much to trust each source category.
- Opus capability: adaptive thinking + web search
- Ships: roadmap v0.2

## Stage 3 — Evaluation (the user has a candidate recommendation or a specific product)

**Workflow 14. AI recommendation audit.** User pastes or screenshots an answer from ChatGPT / Claude / Gemini / Rufus / Perplexity. Lens extracts claims, verifies against live catalog, computes spec-optimal alternative, flags confabulations. The demo headliner.
- Opus capability: adaptive thinking + vision + web search + 1M context + Managed Agent
- Ships: hackathon demo ★

**Workflow 15. Single-product URL evaluation.** User pastes any product page URL. Lens scores it against the user's preference profile, verifies every spec on the page, compares against three spec-optimal alternatives at the same or lower price.
- Opus capability: web search + 1M context
- Ships: hackathon demo

**Workflow 16. Recommendation source provenance.** When an AI (or any source) cites a reference, Lens verifies the cited page exists, the cited claim is actually on it, whether the source is primary (manufacturer) or secondary (blog), and whether the page is affiliate-compensated. Makes "TechRadar says..." meaningful vs. decorative.
- Opus capability: web search + adaptive thinking
- Ships: hackathon demo (simplified)

**Workflow 17. Review authenticity analysis.** User drops a product URL or screenshot. Lens scores reviews for incentivization signals: burstiness (date clustering), demographic/language homogeneity, boilerplate phrasing, rating-distribution anomalies, verified-purchase ratios, seller-reply patterns. Returns a "reviews you can probably trust" count.
- Opus capability: vision + adaptive thinking + 1M context
- Ships: roadmap v0.2

**Workflow 18. Counterfeit / grey-market check.** For marketplace listings, Lens scores seller trustworthiness: account age, feedback distribution, product-image match to manufacturer reference images, price-too-low flag, warranty-honored-by-manufacturer check.
- Opus capability: vision + adaptive thinking + web search
- Ships: roadmap v0.3

**Workflow 19. Sponsorship and affiliate disclosure scanner.** User is reading a review article or watching a YouTube review. Lens flags paid placements, affiliate links, undisclosed sponsorship signals, and compares the reviewer's verdict against independent teardown labs.
- Opus capability: vision + web search + adaptive thinking
- Ships: roadmap v0.2

**Workflow 20. Claim verification against sources.** Every factual assertion a product page or AI makes — "15-bar pressure," "30 hours of battery," "stainless steel build" — gets a verdict with the cited primary source. If unverifiable, Lens says so explicitly rather than guessing.
- Opus capability: 1M context + web search
- Ships: hackathon demo ★

## Stage 4 — Decision and purchase (the moment of transaction)

**Workflow 21. Price-history and sale-legitimacy check.** Lens checks the 90-day historical price trajectory and flags whether "30% off" is genuine relative to the rolling median or a price-anchor pattern. Also flags individualized-pricing signals if the same product shows different prices across sessions or geographies.
- Opus capability: web search + adaptive thinking
- Ships: roadmap v0.2

**Workflow 22. Dark-pattern checkout scan.** User on a cart or checkout page. Lens scans for manipulative UI: countdown timers with no basis, manufactured scarcity ("3 people viewing"), default-opt-in subscriptions, confirmshaming, roach-motel cancellation flows. Returns a short "this page is using deceptive design" summary per the FTC's catalog.
- Opus capability: vision + adaptive thinking
- Ships: roadmap v0.2

**Workflow 23. Compatibility / ecosystem check.** Given the user's existing equipment profile (saved from past purchases or listed manually), Lens flags compatibility gaps. "Will this SSD work with your 2021 MacBook Pro? — yes, but you'll need the enclosure since it's Thunderbolt-4, not USB-C."
- Opus capability: adaptive thinking + web search + 1M context
- Ships: roadmap v0.3

**Workflow 24. True-total-cost reveal.** The sticker price is rarely the real price. Lens computes realistic total including shipping, tax, subscription commitments, warranty add-ons, required accessories, and first-year operating cost (filters, pods, ink, software licenses).
- Opus capability: web search + adaptive thinking
- Ships: roadmap v0.2

**Workflow 25. Data-disclosure audit.** What does buying this product opt you into? Lens surfaces the manufacturer's privacy policy summary (data collection, third-party sharing, deletion rights), the app permissions required, any required account creation, and the trail of consent the purchase triggers.
- Opus capability: adaptive thinking + web search + 1M context
- Ships: roadmap v0.3

**Workflow 26. Breach-history check on seller.** Before entering payment details, Lens checks the retailer's public breach history (Have I Been Pwned, DataBreaches.net, state AG notifications) and flags elevated-risk sellers.
- Opus capability: web search
- Ships: roadmap v0.4

**Workflow 27. Scam / fraud detection.** Does this look-and-feel like a real store, or a drop-shipped scam? Lens checks WHOIS age of domain, Trustpilot distribution, complaint patterns, and reverse-image-searches product photos.
- Opus capability: vision + web search
- Ships: roadmap v0.3

**Workflow 28. Checkout-readiness summary.** Final pre-purchase card before the user clicks buy: transparent utility score, verified claim count, price-legitimacy verdict, dark-pattern warnings, true-total-cost, compatibility status, and confidence-weighted "proceed / hesitate / rethink" recommendation.
- Opus capability: aggregation over above workflows
- Ships: hackathon (simplified version of the audit card)

## Stage 5 — Delivery and setup (the product has arrived)

**Workflow 29. Unboxing / DOA verification.** User photographs the unboxed product. Lens cross-references against the listing's product images, flags suspected substitutions or counterfeits, and drafts an "as-received doesn't match as-listed" dispute if indicated.
- Opus capability: vision + web search
- Ships: roadmap v0.3

**Workflow 30. Setup instruction aggregation.** Manufacturer manuals are frequently terse, outdated, or missing entirely. Lens aggregates setup guides from the manual, community sources (iFixit, Reddit, YouTube), and verified teardown-level documentation.
- Opus capability: web search + 1M context
- Ships: roadmap v0.3

**Workflow 31. Warranty and returns reality check.** Lens extracts the stated warranty from the included documentation and compares to the retailer's actual enforcement patterns (BBB complaints, Reddit threads, small-claims-court records if available). Flags known gotchas before the return window closes.
- Opus capability: web search + 1M context
- Ships: roadmap v0.3

## Stage 6 — Post-purchase validation (the user is now living with the product)

**Workflow 32. Welfare-delta analytic.** Across all the user's Lens-audited purchases, how much would they have saved (in dollars and in utility) if they had always picked Lens's top-ranked alternative? This is the retention engine. One-time seeing the number turns Lens into the mandatory last step before every future purchase.
- Opus capability: aggregation
- Ships: hackathon demo (simplified)

**Workflow 33. Recall monitoring.** Lens maintains a standing subscription to CPSC, NHTSA, FDA, and manufacturer recall feeds. Any product in the user's purchase history that gets recalled triggers an alert with the claim route and contact information.
- Opus capability: web search + Managed Agent scheduled polling
- Ships: roadmap v0.4

**Workflow 34. Price-drop refund triggering.** Many retailers have price-match / price-adjustment windows (Target 14 days, Best Buy 15 days, many others). Lens watches post-purchase prices and files adjustment claims automatically within the window.
- Opus capability: web search + Managed Agent + adaptive thinking
- Ships: roadmap v0.4

**Workflow 35. Returns and warranty assistance.** User has a defective product. Lens reads the receipt and warranty terms, drafts a return request with legal-rights citations (Magnuson-Moss, state lemon laws, EU 2-year directive for applicable users), and routes it to the right contact.
- Opus capability: adaptive thinking + web search
- Ships: roadmap v0.3

**Workflow 36. Subscription audit and cancellation drafting.** Lens catalogs every active subscription, flags auto-renewals, and drafts cancellation scripts when the user wants out. Per the FTC's Click-to-Cancel rulemaking and CA SB-313, many subscriptions are legally required to be cancellable in as few clicks as sign-up was — Lens enforces that.
- Opus capability: adaptive thinking + web search
- Ships: roadmap v0.3

**Workflow 37. Product-performance tracking.** User can optionally log post-purchase experience (did it meet expectations, how does it hold up). Lens feeds this back into the preference-inference model so next time's ranking is better calibrated.
- Opus capability: adaptive thinking
- Ships: roadmap v0.4

## Stage 7 — Ongoing use (product is in service, user has ongoing relationship)

**Workflow 38. Firmware / update monitoring.** For connected products, Lens watches for firmware updates and security patches. Flags vendors that stop shipping updates (the "smart device abandoned" problem).
- Opus capability: web search + Managed Agent
- Ships: roadmap v0.4

**Workflow 39. Compatible-accessory discovery.** User owns a given product; Lens surfaces accessories and consumables known to be compatible, scored against their preference profile. Filters out incompatible or counterfeit accessories.
- Opus capability: adaptive thinking + web search + 1M context
- Ships: roadmap v0.3

**Workflow 40. Lock-in cost tracking.** For ecosystem purchases (Apple, Amazon, Google, Tesla, printer-ink, subscription-bundle), Lens accumulates the running "lock-in cost": the dollar amount the user has invested in platform-specific accessories and content that would be forfeited if switching.
- Opus capability: aggregation
- Ships: roadmap v0.4

**Workflow 41. Repairability tracking.** Surfaces iFixit repairability scores, manufacturer-provided vs. community-discovered repair guides, and parts availability. Factors into the user's utility function for future purchases if they value repairability.
- Opus capability: web search
- Ships: roadmap v0.3

## Stage 8 — End of life (product is disposed, replaced, or sold)

**Workflow 42. Resale-value estimation.** Lens estimates current market value (eBay sold listings, Swappa, Back Market, manufacturer trade-in) and recommends the optimal time to sell.
- Opus capability: web search + adaptive thinking
- Ships: roadmap v0.4

**Workflow 43. Recycling and responsible disposal.** For electronics, batteries, appliances, furniture — Lens surfaces compliant recycling routes (EPA e-waste, manufacturer take-back, municipal hazmat days) and takedown fees.
- Opus capability: web search
- Ships: roadmap v0.4

**Workflow 44. Trade-in optimization.** Which retailer's trade-in offer is highest for the specific model and condition? Does trade-in plus upgrade beat sell-and-rebuy? Lens does the arithmetic.
- Opus capability: web search + adaptive thinking
- Ships: roadmap v0.4

**Workflow 45. Upgrade-timing analysis.** Given the user's observed usage pattern and the replacement market, is it worth upgrading now or waiting for the next cycle? Surfaces objective indicators vs. marketing-driven upgrade pressure.
- Opus capability: adaptive thinking + web search
- Ships: roadmap v0.5

## Cross-journey workflows (apply across every stage)

**Workflow 46. Values overlay.** Optional, user-chosen criteria that apply across every evaluation: country of manufacture, labor-practice certification, B-Corp status, carbon footprint estimate, animal-welfare claims, union-made, small-business. Sit next to price and quality as equally-weighted utility inputs if the user chooses.
- Opus capability: adaptive thinking + web search
- Ships: roadmap v0.3

**Workflow 47. Family / household profiles.** Multiple users in a household share a profile with per-person overrides for specific categories. "The household prefers X; Alice overrides to Y; Bob overrides to Z." Helps with shared purchases and gift-buying.
- Opus capability: profile model
- Ships: roadmap v0.4

**Workflow 48. Gift-buying mode.** User is shopping for someone else. Lens assembles a preference profile for the recipient from the user's description and optionally from a shared link the recipient fills. Removes the "I'm guessing at what they want" guesswork.
- Opus capability: adaptive thinking + shared state
- Ships: roadmap v0.3

**Workflow 49. Group-buy / cooperative pooling.** User wants to buy in bulk or coordinate with neighbors. Lens finds the bulk-threshold price break, proposes the group size, drafts the invitation, and manages the split.
- Opus capability: adaptive thinking
- Ships: roadmap v0.5

**Workflow 50. Preference-profile portability.** Profiles are exportable as signed JSON, transferable to any device, any tool, any retailer that supports the open schema. The user owns the profile; Lens just parses and applies it.
- Opus capability: n/a — data layer
- Ships: hackathon demo (localStorage) + v0.2 (export/import)

**Workflow 51. Public disagreement ticker.** Aggregate audits across all Lens users produce a statistical record: which AI assistants systematically under-recommend in which categories, at what rate, with what confidence. Public dashboard. Regulatory-grade dataset. Citable in FTC enforcement and journalism.
- Opus capability: aggregation
- Ships: roadmap v0.5

**Workflow 52. Lens Score API.** Publishers, retailers, and review sites can embed an independent Lens score next to any product — generated on demand, citing the live utility breakdown. Puts the transparency in every commerce surface, not just Lens's own.
- Opus capability: on-demand scoring
- Ships: roadmap v0.5

## Input modes (how the user interacts with each workflow)

| Mode | Workflows | Ships |
|---|---|---|
| Typed natural-language query | 4, 6-11, 47-49 | hackathon |
| Paste of AI chat text | 14, 16 | hackathon |
| Screenshot (mobile or desktop, any UI) | 14, 17-19, 22, 27, 29 | hackathon |
| Product URL | 15, 17, 20-22, 25, 27 | hackathon |
| Receipt (email / PDF / screenshot) | 5, 15, 32, 36 | v0.2 |
| Voice note / audio | 8, any query workflow | v0.3 |
| Chrome extension overlay | 14-22 one-click | hackathon (MVP), v0.2 (polished) |
| Mobile share-sheet | All | v0.3 |
| Email-forward to lens@... | 5, 15, 33 | v0.3 |
| Native iOS / Android apps | All | v0.4 |
| Browser right-click context menu | 15-22 | v0.3 |
| Opt-in transaction receipt via bank connection | 32-36 | v0.5 |

## Hackathon scope (what ships by Sun Apr 26, 8 PM EDT)

**Core pipeline (end-to-end, production-ready):**

1. Workflow 8 — preference elicitation (Job 1 primary input)
2. Workflow 10 — spec-optimal discovery with live utility sliders (★)
3. Workflow 11 — alternative surfacing at price tiers (inside the ranking UI)
4. Workflow 12 — cross-assistant disagreement via Managed Agent (★ targets the $5k special prize)
5. Workflow 14 — AI recommendation audit (★ headline demo moment)
6. Workflow 15 — single-product URL evaluation (third panel in the UI)
7. Workflow 16 — source provenance (simplified: yes/no "citation verified" per claim)
8. Workflow 20 — claim verification (already working as of Day 1)
9. Workflow 28 — checkout-readiness summary (the final audit card)
10. Workflow 32 — welfare-delta analytic (simplified, across the session's audits)
11. Workflow 50 — preference profile portability (localStorage in v0.1, export in v0.2)

**Visible-in-README-only (demonstrates the scope without shipping):**

The remaining ~40 workflows are documented in this file and linked from the README so that judges see the full addressable surface even though they are not demoable this week. This is the Elisa-style "scale flex" — Jon McBee's winning project did 76 commits, 39K LOC, 1500 tests in 30 hours. Lens's equivalent is showing that the product's scope maps every consumer-welfare harm and that the architecture supports every one of those workflows without re-architecture.

## Why this scope is coherent and not sprawl

A tool that promised 52 unrelated features would read as scope creep. Lens's claim is stronger: these 52 workflows all execute the same three-operation spine.

**Spine.** (1) Infer the consumer's preferences into a weighted utility function. (2) Apply transparent deterministic math to whatever question the user is asking. (3) Verify every factual claim against independent live sources.

Every workflow above is one application of that spine.

- Workflow 10 (spec-optimal discovery) applies the spine to "rank these candidates."
- Workflow 14 (AI audit) applies the spine to "is this AI's answer any good."
- Workflow 17 (review authenticity) applies the spine to "are these reviews trustworthy."
- Workflow 22 (dark patterns) applies the spine to "is this page deceiving me."
- Workflow 32 (welfare delta) applies the spine to "have my past choices been optimal."

Because the spine is unified, adding a new workflow is never architectural — it is a new prompt, a new data source, and a new UI panel sitting on the same Worker and the same preference profile. The hackathon demo ships 11 workflows that ride on the same pipeline, which is credible in six days. The remaining 41 workflows ride on the same pipeline too, which is credible over the twelve months that follow.

The coherence is the product. A consumer who uses Lens for Workflow 10 today gets Workflow 22 for free next month as soon as it ships, because the preference profile, the utility math, and the verification-against-live-sources are already running. Stickiness compounds. Every workflow reinforces every other workflow, because all 52 draw from and contribute to the same preference profile.

## What the demo shows

The 3-minute demo hits five workflows in a specific arc:

- **0:00-0:30** — **Workflow 14** cold open. A real ChatGPT espresso recommendation pasted into Lens. Lens catches the misleading "stainless-steel build" claim and the false "$249" price, picks the spec-optimal Presswell, shows GPT-4o agreeing with Lens.
- **0:30-1:15** — **Workflows 8 + 10 + 11** cold user query. No AI in the loop. User types "espresso under $400, pressure + build + steam." Lens derives weights, returns ranked candidates, drags the slider to show live re-ranking.
- **1:15-1:45** — **Workflow 15** single URL. User pastes an Amazon product page. Lens scores it against their preferences and shows three better alternatives.
- **1:45-2:15** — **Workflow 12** cross-assistant disagreement map over the same question, run as a Managed Agent.
- **2:15-2:45** — **Workflow 32** welfare-delta teaser. "Across this session, Lens would have saved you $47 and given you higher-utility picks 3 of 3 times."
- **2:45-3:00** — fast montage of the remaining workflows labeled "coming" so judges see scope without overclaiming.

## Concluding the framing

Lens is not the AI audit tool. That framing was too small. Lens is **the consumer's independent agent across every point of every purchase**, and the AI audit is just one of fifty-two applications of the same pipeline. The paper is evidence that one specific harm is measurable; the product is built to address every harm on the taxonomy, because the same three operations (infer, compute, verify) apply to every one of them.

When the user sees Lens catch an AI's confabulation, that is the hook. When the user sees Lens flag a dark pattern on the next checkout they hit, that is the retention. When the user sees Lens's welfare-delta analytic after their tenth audit, that is the religion.
