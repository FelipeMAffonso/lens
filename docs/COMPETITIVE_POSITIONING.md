# Competitive positioning — the 2026 landscape

This document is grounded in the public state of each competitor as of April 2026 rather than on general reasoning about the market. Every factual claim about a competitor is sourced to publicly reported capabilities, pricing, or partnerships.

## The five major AI shopping surfaces

### 1. ChatGPT Shopping (OpenAI)

OpenAI runs an in-chat conversational commerce surface on top of its **Agentic Commerce Protocol (ACP)** — a standard infrastructure layer that platforms like Shopify, Instacart, and Etsy have connected their backends into. The **Instant Checkout** feature, launched in September 2025, allows users to complete purchases without leaving ChatGPT. Monetization is built on commissions: according to OpenAI CEO Sam Altman, the company plans to charge roughly a **2% affiliate fee** on purchases, and industry reporting on the Shopify partnership mentions figures in the **~4% cut** range. OpenAI's broader strategy blends subscriptions, ads, lead-gen, and commerce as parallel revenue streams, each of which depends on conversion through the shopping surface.

Because ChatGPT Shopping's ranking feeds directly into a commission-bearing purchase, a transparent audit layer that systematically contradicted its own picks would contradict the revenue model. The audit is not something OpenAI can credibly ship on top of ChatGPT Shopping without reshaping the commercial incentives that make ChatGPT Shopping exist.

**Sources:**
- [OpenAI Reportedly Works to Monetize ChatGPT's Shopping Function By Taking Commission (Sourcing Journal)](https://sourcingjournal.com/topics/technology/openai-chatgpt-shopping-shopify-monetization-checkout-conversational-commerce-1234755983/)
- [ChatGPT Shopping: What Will Change in 2026 (MIM Agency)](https://www.agencymim.com/informational-resources/market-insights/chatgpt-shopping-and-the-new-logic-of-e-commerce-what-will-change-in-2026/)
- [ChatGPT Just Created a New Way for Brands to Make Money (Inc.)](https://www.inc.com/ben-sherry/chatgpt-just-created-a-new-way-for-brands-to-make-money-heres-how-it-works/91279264)

### 2. Amazon Rufus

Amazon has reported **over 250 million customers** used Rufus in the past year with monthly active users up **149%** and interactions up **210%**. The 2026 upgrade set introduced account memory (Rufus retains per-user preferences across sessions), visual search input (photo-to-product matching), and multi-step sub-search capabilities ("within a single request, Rufus can run multiple sub-searches, combine Amazon catalog data with external editorial sources, and weigh goals, budget, constraints, and preferences"). Amazon has publicly described Rufus as capable of **setting price alerts, highlighting better-value alternatives, and auto-purchasing** when prices drop below a user-defined threshold.

The structural limitation is unchanged: Rufus indexes Amazon's catalog and operates inside Amazon's ranking system, which is influenced by sponsored placements, Amazon Basics/first-party inventory, and commission margin tiers. A "better-value alternative" surfaced by Rufus is a better-value alternative *on Amazon*, not a better-value alternative on the open web. Rufus cannot ship the message "Amazon just recommended the $300 Sony, but the specs and live prices across three other retailers show the $240 Sennheiser is better" without actively hurting Amazon's own revenue.

**Sources:**
- [Amazon's next-gen AI assistant for shopping is now even more helpful (About Amazon)](https://www.aboutamazon.com/news/retail/amazon-rufus-ai-assistant-personalized-shopping-features)
- [Amazon Rufus Guide 2026: How Amazon's AI Assistant Recommends Products (Amalytix)](https://www.amalytix.com/en/knowledge/ai/amazon-rufus-guide-2026/)

### 3. Google AI Mode (Gemini + Shopping Graph)

Google's AI Mode pairs Gemini with its **Shopping Graph, which now exceeds 50 billion product listings** spanning global retailers and small shops. The AI Mode surface runs a "**query fan-out**" pattern — multiple simultaneous sub-queries — to assemble curated product panels. Results are shown as panels rather than a ranked list of links, which shifts the user away from a directly inspectable rank order. Additional features include virtual try-on for apparel and an agentic checkout flow that respects a user-stated budget.

Google's monetization through Shopping depends on ad placements and merchant promotions. The rank of a product within an AI Mode panel is therefore not independent of the ad auction. Google cannot ship a transparent-weighting UI that says "here are the five weights that determined this panel, edit them yourself" without exposing the degree to which ad placement and merchant fees factor into the ranking. The rank is a black box by design.

**Sources:**
- [Shopping on Google: AI Mode and virtual try-on updates from I/O 2025 (Google Blog)](https://blog.google/products-and-platforms/products/shopping/google-shopping-ai-mode-virtual-try-on-update/)
- [Inside Google Shopping AI mode: How it works (Productsup)](https://www.productsup.com/blog/inside-google-shopping-ai-mode-how-it-works-and-what-powers-it/)

### 4. Perplexity Shopping

Perplexity markets its shopping surface under the explicit positioning **"Shopping That Puts You First."** Its product stack includes a "**Buy with Pro**" checkout flow (for Perplexity Pro subscribers in the US), cited recommendations sourced from live product feeds, and partnerships with Shopify, Amazon, and third-party feed providers. Payment is handled via PayPal. Free shipping is offered on all Buy with Pro orders.

Perplexity's positioning is the closest to Lens's framing, and that is the reason it deserves the most careful disambiguation. "Puts You First" in Perplexity's case still operates inside a revenue model where partner feeds (Shopify merchants, Amazon listings) are the source of product data and a subscription tier is the monetization layer. The ranking is more transparent than ChatGPT's or Rufus's — Perplexity cites sources — but the weights that produced the ranking are not exposed. The user sees *which sources* the answer came from, but not *which criteria* were weighted and how heavily. Lens exposes the criteria and weights themselves, not just the citations.

Perplexity is also a ranking target Lens audits, not a position Lens competes with head-on. When the user pastes a Perplexity answer into Lens, Lens evaluates it the same way it evaluates ChatGPT or Rufus, and the cross-assistant disagreement panel shows where Perplexity agrees or disagrees with other frontier models.

**Sources:**
- [Shopping That Puts You First (Perplexity Blog)](https://www.perplexity.ai/hub/blog/shopping-that-puts-you-first)
- [Shop like a Pro (Perplexity Blog)](https://www.perplexity.ai/hub/blog/shop-like-a-pro)

### 5. Retailer-embedded assistants

Walmart, Target, Shopify, and every major retailer in 2026 has some version of an in-house conversational commerce layer. These are structurally bound to their own catalog by definition. Cross-retailer comparison is actively hostile to the host's business model, so none of them will ship it independently.

## The white space Lens occupies

The 2026 AI shopping landscape has a dense supply of tools in three adjacent categories, and a sparse supply in the one category Lens targets:

| Category | Examples | Serves |
|---|---|---|
| Assistant-first shopping surface | ChatGPT Shopping, Rufus, Google AI Mode, Perplexity | Shoppers, monetized via commerce |
| AI visibility tracking for brands | Alhena AI, Profound AI | Brands wanting to appear in AI answers |
| Price-tracking consumer tools | TaskMonkey, Keepa, CamelCamelCamel, Honey | Shoppers on specific retailers |
| **Consumer-side AI recommendation audit** | **empty** | **—** |

There is no shipped consumer tool whose purpose is to audit an AI-generated shopping recommendation against transparent criteria and verify the claims against live spec sheets. Lens is the first. The adjacent categories demonstrate that both the brand-side and price-tracking problems are mature enough to support multiple venture-backed products, which argues the consumer-audit category will be too once the first product ships.

**Sources:**
- [10 Best AI Visibility Tools for Ecommerce Brands in 2026 (Alhena)](https://alhena.ai/blog/best-ai-visibility-tools-ecommerce/)
- [Best AI Tools for Product Recommendation in 2026 (Involve)](https://www.involve.me/blog/best-ai-tools-for-product-recommendation)

## Head-to-head against actual 2026 competitors

| Dimension | ChatGPT Shopping | Rufus | Google AI Mode | Perplexity | **Lens** |
|---|---|---|---|---|---|
| Runs inside a single host assistant | self-only | self-only (Amazon) | self-only (Google) | self-only | **any host assistant** |
| Cross-retailer catalog | partner feeds | Amazon only | Shopping Graph (ads-influenced) | partner feeds | **any page on the open web** |
| User can see the ranking criteria | no | no | no | citations yes, weights no | **weights and scores, live** |
| User can edit ranking weights | no | no | no | no | **live slider re-rank** |
| Claim-by-claim verification | no | no | no | cited sources | **per-claim verdict with URL** |
| Cross-assistant disagreement map | no | no | no | no | **three-provider fan-out** |
| Welfare-delta per-user accounting | no | no | no | no | **tracked across audits** |
| Screenshot input (vision) | no | partial (in-Amazon only) | no | no | **any screenshot** |
| Revenue depends on ranking bias | yes (~2% commission) | yes (commission + ad placement) | yes (ads) | yes (Pro subscription + partners) | **no** |
| Open source | no | no | no | no | **MIT** |

Every row where Lens is structurally distinct — the weight inspection, the live re-rank, the cross-assistant disagreement, the welfare delta, the independence from a recommendation-bias revenue model — is a row the incumbents cannot match without reshaping the commercial incentives that fund them.

## The infrastructure hook: ACP

OpenAI's **Agentic Commerce Protocol (ACP)** is emerging as a standard layer for AI-driven purchases. Shopify, Instacart, and Etsy have already connected their backends. If ACP becomes the standard purchase rail for AI assistants in 2026-2027, Lens naturally sits *above* ACP as an independent pre-purchase audit layer. The user asks an assistant, the assistant proposes a purchase via ACP, Lens inspects the proposal before the user confirms. Lens does not need to own the purchase flow to provide the value; it needs to own the last check.

## The regulatory tailwind

The FTC set a **March 11, 2026 deadline** to publish a policy statement on how existing consumer-protection laws apply to AI in commerce, marketing, and customer interactions. The FTC's January 2025 findings on **algorithmic/surveillance pricing** concluded that such tools "are explicitly marketed to effectively boost revenue and margins by 2-5%," which the agency characterized as a direct consumer welfare harm. Polling published alongside this enforcement found that **72% of consumers oppose individualized pricing for any reason**. The FTC has also publicly signaled that transparency requirements by themselves are insufficient, and that shifting the burden onto consumers to read disclosures "falls short of protecting consumers."

Lens's welfare-delta analytic — "Across your last 10 AI-assisted shopping queries, Lens's picks averaged 0.12 higher utility at $63 lower average price" — maps directly onto the consumer-welfare harm metric the FTC is documenting. As aggregate audit data accumulates across users, Lens becomes the independent empirical evidence base for the regulatory conversation the agency is already holding. That is not a minor side effect; it is a second moat. A tool that generates regulatory-grade public data is harder to suppress than a tool that only helps individuals shop better.

**Sources:**
- [Artificial Intelligence — Federal Trade Commission](https://www.ftc.gov/industry/technology/artificial-intelligence)
- [Center for AI and Digital Policy Feb 22, 2026 FTC submission on surveillance pricing (PDF)](https://downloads.regulations.gov/FTC-2026-0034-0007/attachment_1.pdf)
- [Transparency and AI: FTC Launches Enforcement Actions (Lathrop GPM)](https://www.lathropgpm.com/insights/transparency-and-ai-ftc-launches-enforcement-actions-against-businesses-promoting-deceptive-ai-product-claims/)

## Most likely incumbent responses and why each fails

**"We'll ship our own second-opinion feature inside ChatGPT."** OpenAI can technically build this, but the second opinion cannot systematically recommend products that bypass OpenAI's shopping partners, because doing so contradicts the 2% commission that funds the feature's existence. The resulting tool will be softer than Lens by design.

**"We'll add transparent weights to AI Mode."** Google can technically add a "here's how we weighted your query" explainer, but the weights that determined the rank include factors the user did not choose (ad placement, merchant fees, retention optimization). Exposing these is a brand risk that is strictly worse than leaving them opaque.

**"We'll match Lens's welfare-delta accounting inside Rufus."** Amazon can ship "you saved $47 this month by using Rufus" without breaking anything — but the baseline for that calculation has to be non-Amazon alternatives, and surfacing non-Amazon alternatives inside Rufus is itself the problem the parent business is trying to avoid.

**"We'll acquire Lens."** This is the cleanest outcome for Felipe and a reasonable outcome for the acquirer, provided the acquirer is not one of the incumbents above. A consumer-protection non-profit, a publisher with a neutrality brand (*Consumer Reports*, Wirecutter's parent *New York Times*, *Which?* in the UK), or a public-interest foundation could credibly operate Lens without breaking its independence. An incumbent acquirer would have to maintain Lens's critical posture toward its own other products, which is not a stable equilibrium.

**"We'll ignore Lens."** Plausible for the first six months. Implausible once Lens has ten thousand users and a public disagreement ticker showing which assistants systematically under-recommend in which categories. The ticker becomes citable evidence in FTC enforcement actions and journalism.

## Why an independent researcher wins this race

Felipe is unusually positioned. The credibility anchor — the *Nature*-submitted paper with 18 frontier models and 382,000 trials — is his own work. Every major AI lab has an incentive to not publish the analysis that paper already published. Every major retailer has an incentive to not commission the audit tool that paper's findings motivate. An independent academic with a peer-reviewed result, an open-source tool, and no commercial relationship to any platform is the rare fit: the person most motivated to ship this tool is also the person most structurally independent of the interests that would suppress it.
