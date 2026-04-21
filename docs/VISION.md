# Lens — Vision

## One sentence

**Lens turns what you care about into a transparent ranking of real products — and catches any AI shopping assistant that got it wrong.**

## The real user problem

Consumers delegate shopping decisions to recommendation systems every day: Amazon's ranking algorithm, Google Shopping, Wirecutter editors, Rufus, ChatGPT, Claude. Every one of these systems is a black box. The user cannot see which factors were weighted, how heavily, or why Product A appeared above Product B. In the AI-assistant case specifically, a peer-reviewed study of 18 frontier models across 382,000 trials (Affonso et al., submitted to *Nature*, 2026) showed these assistants pick a non-optimal product 21% of the time and confabulate attribute-based justifications 86% of the time — consumers are systematically steered toward familiar brands by models that then invent reasons.

Lens is built on the premise that the fix is not smarter AI but **transparent math**. If the user's priorities are visible, the weights are visible, and the scoring is visible, the user stays in control and can verify any recommendation — AI-generated or not.

## Two jobs, one tool

**Job 1 — "I want to buy X" (primary).** The user describes what they want in natural language. Claude Opus 4.7 parses those words into a weighted utility function, searches the real web for matching products, ranks them with `U = Σ wᵢ · sᵢ`, and displays the result with every weight and score inspectable on hover. Sliders let the user tune weights; the ranking updates live. This is the welfare case — most shoppers never talked to ChatGPT.

**Job 2 — "I already got an AI recommendation, is it any good?" (secondary, but the killer demo).** The user pastes or screenshots an answer from ChatGPT / Claude / Gemini / Rufus. Lens does Job 1 *plus* extracts the AI's cited claims, verifies each one against the live catalog, and runs the same question through three other frontier models via a Claude Managed Agent to surface where labs disagree. This is where the confabulation evidence lands.

Both jobs produce the same result format: a spec-optimal pick with full utility breakdown. Job 2 adds an "AI pick + verified claims + cross-model verdicts" overlay.

## What Lens is NOT

- **Not a recommendation engine trained on user behavior.** No telemetry, no A/B tests, no personalized-to-you ranking that degrades over time. The ranking is a pure function of the user's stated criteria and the product specs.
- **Not an editorial site.** No human reviewers, no opinion. Just a transparent optimization.
- **Not a shopping comparison table.** Comparison tables show every attribute; Lens projects the product space onto the user's specific priorities and ranks along that projection.
- **Not an ad network.** No paid placement, no sponsored rows, no affiliate-driven ranking. Affiliate links (if any) are labeled and do not affect the rank.

## Why this is a welfare win

Every assumption baked into the ranking is exposed. If Lens gets the answer wrong, the user can see exactly which criterion or weight caused it and adjust. If a new AI shopping assistant gets popular next year, Lens is the independent layer that checks whether its recommendations are any good — no matter what vendor built it.

## Why Claude Opus 4.7 is load-bearing

- **Adaptive thinking** decomposes ambiguous natural-language preferences into explicit weighted criteria. This is the turning-words-into-a-utility-function step.
- **Server-side web search** (2026 edition, with dynamic filtering) pulls live product listings without a scraping stack.
- **1M context** holds every product's full spec sheet alongside every cited claim, so verification is "look at both at once," not "RAG and hope."
- **Vision** accepts a screenshot of any AI chat — mobile, desktop, any assistant — removing the friction of copy-paste.
- **Claude Managed Agents** own the three-other-models fan-out as a long-running hand-off, which is what the $5K "Best Managed Agents" prize is asking for.

## Scoring against the hackathon rubric

| Criterion (weight) | Lens's edge |
|---|---|
| Impact (30%) | Every online shopper, not just AI users. Welfare layer on top of opaque recommendation systems. |
| Demo (25%) | Paste a ChatGPT espresso answer; watch Lens catch a bad recommendation in one screen. Then a second cut: no AI in the loop at all, user describes what they want, Lens just delivers. |
| Opus 4.7 use (25%) | Adaptive thinking + web search + 1M context + vision + Managed Agents, all genuinely doing work, not decorating. |
| Depth & execution (20%) | Peer-reviewed research base; a real published paper that frames the need. Clean open-source TypeScript monorepo. CI green. |

## What would make this ship-grade (post-hackathon)

- Live retailer APIs for price + availability (Rainforest, Keepa, or affiliate feeds), not just web search.
- User account with saved preferences per category.
- Mobile app (not just extension + web).
- Comparative ranking over time ("the Stilosa moved from rank 3 to rank 1 this month because …").
- Open API so any retailer or publisher can embed the ranking on their pages.

None of the above are in scope for the hackathon. They are the roadmap that makes the one-week demo credible as a product.
