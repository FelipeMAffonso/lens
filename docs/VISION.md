# Lens — Vision

## The one-line

**Lens is the consumer's independent agent across every point of every purchase.**

Every actor in the commerce stack has representation: retailers have pricing optimization software, brands have SEO firms, platforms have ad auctions, manufacturers have influencer networks, affiliates have tracking pixels, even consumer advocacy media has advertising revenue tied to the products they evaluate. The consumer alone walks into the transaction with no representation. Lens is the counter-party — the one agent in the stack whose only allegiance is to the consumer's welfare, structured so that no commission, no ad revenue, no partner relationship, no catalog ownership can bias its answer.

## The thesis

Every major shopping recommendation surface on the internet — Amazon's organic ranking, Google Shopping, Apple's App Store, Rufus, ChatGPT Shopping, Gemini, Copilot, Perplexity, and every retailer's "you might also like" — optimizes for the platform's revenue, not the shopper's welfare. The mechanisms differ (commission, ad placement, engagement, retention), but the shape is the same: a ranking is delivered with confidence and no explanation. The shopper has no way to audit which criteria were weighted, how heavily, or why Product A appeared above Product B.

When AI assistants entered this space they inherited the same opacity and added a new failure mode: a peer-reviewed study of 18 frontier models across 382,000 trials (Affonso et al., submitted to *Nature*, 2026) showed these models pick a non-optimal product roughly 21% of the time and confabulate attribute-based justifications in 86% of cases. The AI sounds confident, the prose is fluent, and the bias that drove the output is invisible.

AI recommendation bias is one specific harm. The underlying problem is larger. Across the full purchase lifecycle, consumers face systematic welfare erosion in every stage: confabulated claims during research, fake incentivized reviews during evaluation, algorithmic surveillance pricing at the moment of decision, dark patterns at checkout, hidden subscription traps after purchase, recall non-notification during ownership, un-claimed price-match refunds post-delivery, and lock-in costs across ecosystems. Each is documented in academic research, FTC findings, or consumer advocacy work. Each is a place where someone on the supply side has an agent working to extract value from the consumer, and the consumer has no corresponding agent working to protect their welfare.

Lens exists to invert this. The shopper's own priorities become the scoring function. Every weight is exposed. Every claim is verified against a live source. Every alternative the platforms did not surface is visible. The three operations — **infer preferences, compute transparent math, verify against independent sources** — apply at every stage of every purchase, and Lens is the one tool that applies them consistently across the whole lifecycle.

See `docs/CONSUMER_WORKFLOWS.md` for the full enumeration of 52 workflows across the nine-stage journey (need emergence, discovery, research, evaluation, decision, delivery, post-purchase, ongoing use, end of life). The spec-resistance paper is evidence that one specific harm is real and measurable; it is not the product. The product is the full surface.

## What Lens is

A browser extension, web app, and open API that accepts any expression of shopping intent — a typed question, a pasted AI answer, a screenshot of an AI chat, a product-page URL, or even a voice note — and returns a single transparent audit card. The card contains the user's inferred weighted preferences, the spec-optimal product ranked against those preferences, every cited claim with a live verification verdict and citation, and a disagreement map across other frontier assistants asked the same question. Every weight, score, and source is inspectable. The ranking is deterministic; the same inputs always produce the same output. When the user drags a slider to re-weight, the ranking recomputes live in the browser.

The product is open source under MIT. It runs on Cloudflare Workers with Claude Opus 4.7 as the reasoning engine and serves the frontend from Cloudflare Pages. Nothing proprietary sits between the user and the answer.

## Why this kills GPT Shopping and Rufus

The incumbents compete on integration — being inside the surface the shopper is already using. Their structural weakness is that each one is bound to a revenue model Lens is not. ChatGPT Shopping earns a commission (reportedly a 2% affiliate fee per Sam Altman, and industry reporting mentions ~4% through the Shopify partnership) on every purchase that flows through its Agentic Commerce Protocol integrations. A full claim-verification layer that systematically contradicts ChatGPT's recommendations would contradict the revenue those recommendations generate. Amazon Rufus serves 250+ million users on top of Amazon's own catalog, where ranking is influenced by sponsored placement, first-party inventory, and commission margin tiers; any "better-value alternative" Rufus surfaces is a better alternative *on Amazon*, not on the open web. Google AI Mode runs over a 50-billion-product Shopping Graph where merchant fees and ad placement influence which products surface. Perplexity markets itself under the tagline "Shopping That Puts You First" but its ranking still operates inside a partner-feed plus subscription revenue model where weights are not exposed.

None of these platforms can ship transparent user-editable weights, per-claim verification citing sources that contradict their own pick, or cross-assistant disagreement without reshaping the commercial incentives that fund them. This is structural, not a feature oversight.

Lens has no such conflict. It is an independent audit layer on top of whatever assistant the user consults, including none at all. When Lens says a claim is misleading or that the AI's pick is non-optimal by a measurable gap, there is no business relationship to protect. That independence is the moat. See `docs/COMPETITIVE_POSITIONING.md` for the full head-to-head with each competitor's 2026 state.

## The 2026 market context

The AI shopping space is not empty. It is dense with product on the assistant side (ChatGPT Shopping, Rufus, Google AI Mode, Perplexity, every retailer's in-house bot) and dense on the brand-side AI-visibility tracking (Alhena AI, Profound AI). The category that is empty in April 2026 is the consumer-side audit layer — the tool that inspects what the assistant recommended and verifies it against transparent math and live sources. Lens is the first product in that category.

The regulatory environment is leaning toward Lens's framing. The FTC had a March 11, 2026 deadline to publish its AI consumer-protection policy statement. Its January 2025 findings on algorithmic/surveillance pricing characterized those tools as a direct consumer-welfare harm, quantifying the margin boost at 2-5% and citing polling showing 72% of consumers oppose individualized pricing for any reason. The agency has publicly stated that transparency requirements alone are insufficient and that shifting the disclosure burden onto consumers "falls short of protecting consumers." Lens's welfare-delta metric — the dollar difference between what the AI recommended and what the specs supported — is the kind of evidence the agency is asking for. As aggregate audits accumulate across users, Lens becomes citable public data for the conversation the FTC is already holding.

## The six pillars

Lens is not one feature. It is six capabilities that only make sense in combination, because the value comes from the stack.

### 1. Preference extraction

Natural-language shopping intent gets parsed into a weighted utility function. The user writes *"espresso machine under $400, pressure and build matter more than price"* and Lens derives `{pressure: 0.40, build_quality: 0.35, price: 0.25}` along with inferred constraints (budget, category, brand preferences or anti-preferences). This uses Claude Opus 4.7's adaptive thinking — the model decides how much reasoning to spend based on how ambiguous the request is, and returns both the weights and a plain-English rationale for each weight. The user can accept the inferred weights, adjust them, or overwrite them entirely. Preferences are saved per category, so the next time the user asks about laptops their "I need 32GB minimum" constraint comes along automatically.

### 2. Live product search

The live search step uses Claude Opus 4.7's server-side web search tool (2026 edition, with dynamic filtering that keeps irrelevant snippets out of context) to pull 10-20 real candidate products from retailer and manufacturer pages. The spec sheets are loaded into Opus 4.7's 1M-token context alongside the user's criteria so every candidate is evaluated against every criterion in a single reasoning pass. For the hackathon demo and for latency-sensitive runs, Lens falls back to a hand-curated deterministic catalog across five categories.

### 3. Transparent ranking

Every candidate receives a utility score `U = Σ wᵢ · sᵢ` where each weight and score is visible on hover. The math is intentionally LLM-free. Rankings are deterministic and reproducible. Sliders in the UI let the user retune weights and watch the ranking update in real time, which is the clearest possible demonstration that the math is doing the work, not the AI. The spec-optimal pick is the top-ranked candidate; runners-up are shown with the gap explained ("Pick #2 costs $100 less but loses 0.07 utility on steam and 0.04 on build").

### 4. Claim verification

Every attribute assertion the AI made — "15-bar pressure," "stainless-steel build," "30 hours of battery" — gets checked against the candidate catalog. Verdicts are `true`, `false`, `misleading`, or `unverifiable`. A `misleading` verdict is reserved for claims that are technically true but selectively framed to favor a worse pick (e.g., citing "15-bar pressure" as if it were high when every alternative has 20). Every verdict carries a citation URL and a one-sentence explanation. If a claim cannot be verified, Lens says so rather than guessing.

### 5. Cross-assistant disagreement

The same question that the host assistant answered runs in parallel through three other frontier models — today GPT-5, Gemini 3, and Kimi K2 — delivered as a Claude Managed Agent so the long-running multi-provider fan-out is properly decoupled from the main audit request. The result is a disagreement map: "ChatGPT picked X, Claude picked Y, Gemini picked Y, Kimi K2 picked X." Over time, with enough audits, this becomes a public ticker of which assistants agree with which picks in which categories. Assistants that systematically recommend non-optimal products show up in the aggregate.

### 6. Welfare analytics

Over every audit the user runs, Lens tracks the gap between what the AI recommended and what the spec-optimal pick was — the "welfare delta." After ten audits the user sees a personal summary: "Across your last 10 AI-assisted shopping questions, Lens's picks averaged 0.12 higher utility at $63 lower average price." This single stat is the product's retention engine. Once a user sees that number once, Lens becomes the last step before buy, for everything.

## What Lens is not

Lens is not a recommendation engine trained on user behavior. There is no telemetry funnel, no personalized-to-you ranking drift, no ad auction. The output is a pure function of the user's stated criteria and the product catalog. Two different users with the same criteria get the same ranking.

Lens is not an editorial site. No human reviewers, no opinion content. The opinion is distilled from the user's own words into weighted criteria and then applied with transparent math.

Lens is not a comparison table. Comparison tables flatten the product space along every dimension; Lens projects the product space onto the specific criteria the user cares about in this purchase and ranks along that projection. The projection is different for every query.

Lens is not an ad network. There are no sponsored slots, no paid rankings, no affiliate-driven sorting. Affiliate links, if present on any product-page link, are labeled and have zero effect on the ranking.

## Why Claude Opus 4.7 is load-bearing

Lens uses five Opus 4.7 capabilities, each of which carries meaningful weight in the system rather than appearing as decoration.

**Adaptive thinking** decomposes ambiguous natural-language preferences into weighted criteria. This is a reasoning task where the right answer depends on context-sensitive interpretation (does "performance matters" mean CPU, GPU, battery, or network?). Opus 4.7 decides how much thinking to spend and returns a structured utility function plus a plain-English rationale for each weight, which is what makes the UI explainable.

**Server-side web search (2026)** replaces an entire scraping, rate-limiting, and caching stack. Opus 4.7 refines its own queries, filters results dynamically, and hands back a structured candidate list. Because Anthropic runs the search, the subrequest surface from a Cloudflare Worker stays small and the caller does not have to maintain a Brave or Serper integration.

**1M context** holds every candidate's full spec sheet alongside every cited claim in a single reasoning pass. This turns claim verification from a retrieval-and-hope pipeline into a single comparative reasoning step, which is why the `misleading` verdict is possible at all — the model can see that 15 bar is technically accurate for the AI's pick while also seeing that every comparable alternative has 20 bar.

**Vision with high-resolution image support (3.75MP)** lets Lens accept screenshots of any AI chat — desktop, mobile, voice transcripts, embedded product pages — without requiring copy-paste. This is the surface-expansion that makes Lens viable on mobile, where most impulse AI-shopping happens.

**Claude Managed Agents** own the cross-assistant fan-out as a long-running, multi-provider hand-off. The main `/audit` Worker stays fast and responsive; the Managed Agent handles rate limits, retries, and synthesis across three providers and returns a unified disagreement map. This maps directly to the hackathon's "Best use of Managed Agents" special prize.

## Scoring against the hackathon rubric

| Criterion (weight) | How Lens wins |
|---|---|
| Impact (30%) | Every online shopper is in the market, not just AI users. The welfare-delta analytic turns one-time users into repeat users. The paper provides the credibility anchor that the problem is real and measurable. |
| Demo (25%) | The demo plays twice: once with a paste of ChatGPT's answer (audit mode, catches the confabulation) and once with a cold user query (primary mode, no AI in the loop). Both land in under 20 seconds with visible parallel sub-agent activity. |
| Opus 4.7 use (25%) | Five capabilities load-bearing: adaptive thinking, web search (2026), 1M context, vision, Managed Agents. Not decoration — each does work the product could not do without it. |
| Depth & execution (20%) | Peer-reviewed research base; clean open-source TypeScript monorepo; CI green on every commit; deterministic fixtures for reproducibility; explicit threat model (ARCHITECTURE.md) showing what Lens does not claim. |

## Product surface — hackathon vs roadmap

The full product surface is 52 workflows across the nine-stage customer journey, enumerated in `docs/CONSUMER_WORKFLOWS.md`. Eleven of those workflows ship in the hackathon demo; the other 41 live on the roadmap. The coherence argument is that all 52 workflows ride on the same three-operation spine (infer preferences, compute transparent math, verify against independent sources), which means adding any new workflow is a prompt and a panel rather than an architectural change.

**Shipping by Sun Apr 26:**

1. Preference elicitation from typed prompts (Workflow 8 — Opus 4.7 adaptive thinking).
2. Spec-optimal discovery with live utility sliders (Workflow 10 — ★).
3. Alternative surfacing at price tiers (Workflow 11).
4. Cross-assistant disagreement via Managed Agent (Workflow 12 — ★ targets the $5k Managed Agents prize).
5. AI recommendation audit (Workflow 14 — ★ demo headliner, the "gotcha" moment).
6. Single-product URL evaluation (Workflow 15).
7. Source provenance check (Workflow 16 — simplified).
8. Claim verification against live sources (Workflow 20 — ★).
9. Checkout-readiness summary (Workflow 28 — the unified audit card).
10. Welfare-delta analytic (Workflow 32 — retention engine).
11. Preference profile portability (Workflow 50 — localStorage).

**Roadmap (linked from README, not shipping this week):**

The other 41 workflows cover review-authenticity analysis, dark-pattern detection, price-history and sale-legitimacy checks, true-total-cost reveal, data-disclosure audits, breach-history on sellers, scam / counterfeit detection, unboxing verification, warranty reality checks, recall monitoring, price-drop refund automation, returns-assistance drafting, subscription audits and cancellation drafting, firmware-update monitoring, lock-in cost tracking, repairability scoring, resale-value estimation, responsible-disposal routing, trade-in optimization, upgrade-timing analysis, values/ethics overlays, family/household profiles, gift-buying mode, group-buy pooling, the public disagreement ticker, and the Lens Score API for publishers. Each is enumerated with its Opus 4.7 capability dependency in `CONSUMER_WORKFLOWS.md`.

## The demo narrative

Lens opens cold on a real ChatGPT conversation. ChatGPT recommends the De'Longhi Stilosa espresso machine with three reasons. Cut to Lens: the same paste, three seconds later, side-by-side with the spec-optimal Presswell Artisan P20. The "15-bar pressure" claim is accurate but misleading; every alternative in Lens's catalog has 20 bar. The "stainless-steel build" claim is flagged false — the housing is plastic, only the internal boiler is stainless. Two of three other frontier models agreed with Lens, not ChatGPT.

Then the second act cuts away the AI entirely. A second user types, directly into Lens, "over-ear headphones under $300, noise cancellation and battery matter more than brand." Lens returns the Sennheiser Momentum 4, with every weight and score visible, and the user drags the "battery life" slider up to see the ranking re-sort live. No ChatGPT in the loop. This is what shopping should look like.

The third act is the welfare number. "Across Felipe's last 10 AI-assisted shopping questions, Lens's picks averaged 0.12 higher utility at $63 lower average price. That's the delta between what the AI wanted to sell you and what the specs actually support."

The close: one sentence, on a black screen. *"When the AI gives you a recommendation, Lens gives you the truth."*

## Why this is the submission we want to win with

The Opus 4.6 winner list (Mike Brown's CrossBeam, Michał's PostVisit, Kazibwe's TARA, Asep's Conductr, Jon McBee's Elisa) rewards three things in combination: domain expertise the builder uniquely has, a visible bottleneck the demo resolves, and aggressive use of Claude's distinctive capabilities. Lens has all three. Felipe has published research on exactly the failure mode Lens exploits. The bottleneck is concrete and visible to every online shopper. The Opus 4.7 usage is substantive across five capabilities rather than decorative in one.

The expected-value calculation for Felipe is straightforward. The $50k first-place credit pool plus the $5k Managed Agents prize plus the $5k Keep Thinking prize, if all three land, funds the next eighteen months of the research program that produced the paper in the first place. The downside, if Lens does not place, is a publicly shipped open-source tool with a peer-reviewed paper attached that can serve as infrastructure for the follow-up studies already in the pipeline. Either outcome advances the research program.
