# Knowledge architecture — how Lens scales to comprehensive coverage

Lens's scope requires deep, jurisdictional, category-specific knowledge across four axes that no single LLM call can hold in a consistent, current, or authoritative way:

1. **Every product category** has its own criteria, failure modes, counterfeit signals, typical hidden costs, regulatory regime, and confabulation patterns. A food-supplement query touches FDA claims law; a laptop query touches right-to-repair; an airline ticket touches DOT rules on baggage fees — the knowledge per category is structurally different.

2. **Dark patterns** have an evolving research taxonomy: Harry Brignull's original 12 patterns ([deceptive.design](https://www.deceptive.design/)), the FTC's 2023 "Bringing Dark Patterns to Light" report, the FTC/ICPEN/GPEN 2024 review (76% of 642 audited sites used at least one dark pattern), UC Berkeley's Deceptive Pattern Detector taxonomy, and academic refinements in [arxiv 2412.09147](https://arxiv.org/html/2412.09147v1). The taxonomy is still expanding.

3. **Regulation and enforcement status** changes on a quarterly cadence. The FTC's Junk Fees Rule (finalized Dec 17 2024, effective May 12 2025) was narrowed in its final form to cover only live-event tickets and short-term lodging. The FTC's Click-to-Cancel Rule was finalized in October 2024, delayed from January to July 2025, and then **vacated by the U.S. Court of Appeals for the Eighth Circuit on July 8, 2025** — so the federal rule is not in effect, but state-level click-to-cancel rules (CA SB-313, NY, VT, IL) still are. Any tool that advises users on their cancellation rights has to know all this, per jurisdiction, and keep track of it as it changes.

4. **Fees come in dozens of distinct types** — shipping, handling, processing, taxes, service fees, resort fees, cleaning fees, convenience fees, ticket fees, BNPL interest, restocking fees, subscription renewals, inactivity charges, auto-refill charges, required memberships, ink-subscription entanglements. Each has its own identification signal, each has its own disclosure regime (or none), each has its own enforcement history.

A monolithic system cannot keep all of this in its head, and a system that depends on re-prompting Opus 4.7 to recall all of it every time is fragile (LLMs forget, hallucinate, are out of date). Lens needs a **knowledge architecture**: versioned, typed, composable packs that Opus 4.7 retrieves and applies at runtime.

## The Knowledge Pack abstraction

A Knowledge Pack is a self-contained module with:

- **Identity**: a stable slug (`category/espresso-machines`, `dark-pattern/roach-motel`, `regulation/us-federal/ftc-junk-fees`, `fee/subscription-inactivity`, `intervention/file-price-match-claim`).
- **Version**: semantic-versioned. Packs are immutable once published; updates create a new version. Clients pin to a version or track `latest`.
- **Schema**: the structured fields the pack exposes (criteria template, detection rule, jurisdictional scope, applicability conditions).
- **Evidence**: every factual claim in the pack carries a citation with a canonical URL, a retrieval timestamp, and a status flag (current / deprecated / vacated / superseded).
- **Authority**: who wrote it and who vouches for it. Packs carry a provenance chain: authored by {entity}, reviewed by {entity}, last verified {date}.
- **Applicability filters**: machine-readable conditions under which Opus 4.7 should pull this pack into the active context (category match, jurisdiction match, product-attribute presence, user-preference trigger).
- **Prompt contribution**: the natural-language instruction fragment the pack adds to the active Opus 4.7 prompt when applicable.
- **Executable logic**: optional code the pack provides (e.g. a dark-pattern pack may include a CSS selector + DOM traversal rule; a regulation pack may include a jurisdictional-eligibility check).
- **Retirement date and reason**: packs can be explicitly retired (a regulation was vacated, a pattern is obsolete). Retired packs do not ship to clients by default but remain in the archive for audit.

## The five pack types

### Category Packs

One per product category. Example: `category/espresso-machines`.

Contains:
- **Criteria template** — common weighted criteria for this category (pressure, build quality, steam power, size, ease of use, maintenance). Lens merges the template with the user's expressed preferences during Layer 1 of preference inference.
- **Spec normalization map** — how to parse "15 bar" → `{pressure: 15, unit: "bar"}`, how to reconcile "16GB RAM" with "16 GB memory," etc. Critical for comparing across vendors with different vocabularies.
- **Known confabulation patterns** — category-specific lies AI assistants and marketing pages commonly tell. "Stainless steel" often means "stainless steel accent on plastic housing" in espresso machines; "military-grade durability" means almost nothing in laptops; "clinically proven" requires specific FDA framing in supplements.
- **Counterfeit signals** — what to look for in marketplace listings (e.g., used packaging photos, seller account age, price-too-low thresholds).
- **Compatibility questions** — what user-context inputs matter (existing equipment, installation constraints, consumables).
- **Typical hidden operating costs** — filters for espresso machines, ink for printers, pods for coffee makers, subscriptions for connected appliances.
- **Category-specific regulations** — FDA for supplements, DOT for cars, CPSC recall scopes.
- **Repair ecosystem pointers** — iFixit score availability, manufacturer parts availability, third-party repair community.

Hackathon: 5 packs ship (espresso machines, laptops, headphones, coffee makers, robot vacuums — the demo scope). Roadmap: hundreds more, community-contributable.

### Dark Pattern Packs

One per dark pattern type. The canonical 12 from Brignull expand to roughly 20-25 with modern research extensions.

Each pack contains:
- **Name and description**, with the canonical academic or regulatory citation (Brignull 2010, FTC 2023, specific arxiv refinement).
- **Detection rule**, which is a two-stage pipeline: a cheap CSS/DOM heuristic that flags candidate elements, and an LLM verification prompt that confirms. This matches the approach used by UC Berkeley's Deceptive Pattern Detector ([MiniLM + XGBoost gate, LLM second-stage](https://www.ischool.berkeley.edu/projects/2026/deceptive-pattern-detector)) and the Dapde Pattern Highlighter.
- **Severity rating** (nuisance / manipulative / deceptive / illegal-in-jurisdiction), which jurisdiction thresholds the illegality flag against.
- **Remediation advice** — what the user should do when this pattern fires on a page.
- **Example gallery** — URL snapshots of the pattern in the wild, used for prompt few-shots and for the public deceptive-patterns dataset.
- **Regulatory linkages** — which laws or FTC rules the pattern violates, if any, with enforcement status.

Hackathon: 12 packs (Brignull's canonical set). Roadmap: extend to 25+ with FTC and academic refinements.

### Regulation Packs

One per regulation in force, or formerly in force.

Each pack contains:
- **Jurisdiction** (`us-federal`, `us-state/ca`, `eu`, `uk`, `br`, etc.).
- **Regulation name and citation** (official, e.g. "FTC Trade Regulation Rule on Unfair or Deceptive Fees, 16 CFR Part 464").
- **Scope** — what goods, services, or behaviors it covers (the Junk Fees Rule's narrowing to live-event tickets + short-term lodging is itself an important scope field).
- **Effective date** and **current status** (`in-force`, `delayed`, `vacated`, `superseded`, `preempted`). The Click-to-Cancel rule carries `status: vacated`, `vacated-by: 8th-Circuit-2025-07-08`, `superseded-by: null` because no federal replacement exists.
- **Applicability filters** — when does this regulation apply to the user's situation (jurisdiction, product category, seller type, transaction amount).
- **User rights granted** — plain-language summary of what the regulation entitles the user to.
- **Enforcement signals** — what actions the user can take (file FTC complaint, state AG complaint, BBB complaint, small-claims court, private right of action if applicable).
- **Verification date and source** — the last time this pack was reviewed against current law, with a link to the primary source.

Hackathon: 8 packs — FTC Junk Fees Rule (narrowed), FTC Click-to-Cancel Rule (vacated), CA SB-313 Click-to-Cancel, FTC Endorsement Guide, Magnuson-Moss Warranty Act, EU Sale of Goods Directive, FTC Negative Option Rule, California AB-660 pricing transparency. Roadmap: dozens more across jurisdictions.

### Fee Packs

One per fee type. Example: `fee/subscription-inactivity`, `fee/restocking`, `fee/resort-fee`.

Each pack contains:
- **Fee name and plain-language description**.
- **Typical range** (amount, percentage, or fixed).
- **Identification signal** — how to spot this fee on a product page, cart, or receipt (CSS selector, parse heuristic, LLM prompt).
- **Disclosure legality** — does the fee have to be disclosed by law in this jurisdiction, and if so at what stage of the transaction.
- **Negotiability** — can the user reasonably refuse, waive, or request a refund of this fee; what is the typical success rate.
- **Intervention hook** — which Intervention Pack applies (e.g. "file price-match claim," "request fee waiver," "cancel before auto-renewal").

Hackathon: 15 packs covering the most common hidden-fee categories. Roadmap: 60+.

### Intervention Packs

One per action Lens is authorized to take on the user's behalf, or to recommend the user take.

Each pack contains:
- **Intervention name and description**.
- **Authority required** — which consent tier must have been granted (see `DELIVERY_ARCHITECTURE.md` on the consent gradient).
- **Execution type** — surface-and-warn / refuse-and-redirect / draft-and-offer / automate-with-consent / escalate-to-regulator / community-flag.
- **Prerequisites** — what state must be true before Lens can run this intervention (e.g. user must have verified identity for an FTC complaint; user must be within retailer's return window for a return request).
- **Template output** — the draft letter, form fields, or automated-action specification.
- **Success signals** — how to know the intervention worked.
- **Failure fallback** — what Lens does if the intervention fails (e.g. escalate to higher-authority intervention, or surface to user for manual action).

Hackathon: 4 packs — surface-and-warn (dark patterns), draft-and-offer (return request with Magnuson-Moss citation), automate-with-consent (price-match claim filing, delegated), community-flag (contribute audit to public dataset). Roadmap: 20+.

## How Opus 4.7 composes packs at runtime

For any given user query, the pipeline:

1. **Selects applicable packs.** Based on the inferred category, the user's jurisdiction (from profile or IP hint), the product URL (if any), the type of workflow invoked, and any explicit user-chosen value overlays, the Worker queries the pack registry and retrieves the relevant Category Pack plus any Dark Pattern / Regulation / Fee / Intervention packs that match the current context.

2. **Merges pack contributions into the prompt.** Each pack contributes a structured fragment to the Opus 4.7 system prompt. The fragment is typed — the extraction prompt gets a different fragment than the verification prompt. Fragments are bounded in length; the pack registry enforces token budgets so a heavy category with many associated regulations does not blow the context window.

3. **Runs the workflow.** Opus 4.7 executes with the composed prompt and the user's input. The pack contributions shape the output — an espresso query pulls in pressure normalization, confabulation patterns, and typical-operating-cost hints; a cart-page query pulls in Brignull dark patterns plus FTC Junk Fees Rule scope (ticket/lodging only) plus CA AB-660 pricing transparency (if the user is in California).

4. **Attributes outputs to packs.** Every verdict, claim, or recommendation in the output carries the pack slug(s) that contributed. Users can trace why a given output said what it said, down to the specific pack version and the pack's primary source.

5. **Logs pack performance.** Telemetry tracks which pack-plus-prompt combinations produced outputs that the user accepted vs. overrode, so packs can be improved over time with evidence.

## Pack lifecycle

Packs go through a lifecycle:

- **Drafted.** A proposed pack. Not shipped to clients. Carries a `status: draft` flag.
- **Reviewed.** Passed review by at least one domain expert (for categories: a category specialist; for regulations: legal review; for dark patterns: user-experience research review). Carries reviewer signatures.
- **Published.** Shipped to clients. Tagged with semantic version.
- **Deprecated.** Superseded by a newer version. Old version remains queryable for audit purposes but is not selected by default.
- **Retired.** No longer applicable (e.g. vacated regulation). Not selected by the runtime composer, available for historical queries.

The lifecycle is important because regulation changes. The Click-to-Cancel Rule pack needs to exist as a published pack through its various delayed-effective-date phases, then transition to `retired` with `retirement-reason: vacated-by-8th-circuit` after July 8, 2025, all while the California SB-313 pack continues in `published` status unaffected.

## Community pack contribution

The full universe of knowledge Lens needs is too large for any single author to write. The architecture is designed so packs are community-contributable.

- Packs live in an open-source repository separate from the Lens application code. Contributors submit packs via pull requests.
- Each pack type has a schema validator and a pack-specific review checklist. Regulation packs require a legal-trained reviewer; dark pattern packs require an example URL; category packs require at least three primary-source citations for factual claims.
- Reviewers and contributors sign packs cryptographically so users can verify provenance end to end.
- Packs can be forked — a local jurisdiction can maintain its own fork of a regulation pack and Lens clients can opt into that fork instead of the upstream.
- The pack registry is a public artifact. Researchers, journalists, and regulators can query it for the current state of Lens's coverage.

This is how 100+ packs becomes maintainable even with a small core team: the packs that need the most specialized knowledge are authored by specialists, and the core team reviews rather than writes everything.

## What ships in the hackathon

Proof of architecture, not proof of coverage. Shipping this week:

- **5 Category Packs** — the five demo categories (espresso, laptops, headphones, coffee makers, robot vacuums), hand-authored, used by the live pipeline.
- **3 Dark Pattern Packs** — hidden costs, confirmshaming, roach motel, selected from Brignull's 12 as the ones most visible in consumer demo scenarios.
- **2 Regulation Packs** — FTC Junk Fees Rule (with scope limitation to tickets+lodging noted), CA SB-313 Click-to-Cancel (with status: in-force, federal-vacated noted).
- **3 Fee Packs** — shipping fees, subscription auto-renewal, ink-subscription entanglement.
- **2 Intervention Packs** — surface-and-warn (dark-pattern alerts in the extension), draft-and-offer (Magnuson-Moss return request template).

The packs ship as JSON + Markdown files in `lens/packs/` with a simple TypeScript loader in `workers/api/src/packs.ts`. The pack schema is documented in `packs/SCHEMA.md`. Opus 4.7 prompts in `workers/api/src/prompts/` pull pack contributions in via templating.

The roadmap is the pack universe: hundreds of category packs, dozens of dark pattern packs, dozens of regulation packs across jurisdictions, dozens of fee packs, a couple dozen intervention packs. Each one authored as a community-contributable artifact. The hackathon ships enough packs to prove the shape and enough architectural scaffolding to make the next hundred packs a simple authoring task.

## Why this is a moat

Incumbents cannot adopt this architecture without re-examining their own interests. An Amazon-owned Rufus cannot ship a Regulation Pack for the FTC Endorsement Guide that would flag Amazon's own influencer-endorsement practices. An OpenAI-owned ChatGPT Shopping cannot ship Dark Pattern Packs that flag its own partner retailers. The packs are objective — they reference primary sources and apply equally to every retailer, every assistant, every jurisdiction. That objectivity is incompatible with any recommendation surface whose business model depends on which products appear. Lens is the only place where the packs can be applied neutrally, because Lens is the only commerce-adjacent tool with no ranking-bias revenue stream.

The second-order implication: over time, Lens's pack registry becomes a public infrastructure asset. Regulators reference it; journalists cite it; consumer-advocacy organizations contribute to it. Its authority comes from its independence, and its independence holds because of its revenue structure. That is the compounding moat — not the tool itself, but the body of knowledge the tool accumulates and applies neutrally.

## References

- [Harry Brignull, Deceptive Patterns Part 3: Types of Deceptive Pattern](https://www.deceptive.design/book/contents/part-3)
- [A Comprehensive Study on Dark Patterns (arxiv 2412.09147)](https://arxiv.org/html/2412.09147v1)
- [What Makes a Dark Pattern... Dark? (arxiv 2101.04843)](https://arxiv.org/pdf/2101.04843)
- [FTC, ICPEN, GPEN 2024 dark-patterns review press release](https://www.ftc.gov/news-events/news/press-releases/2024/07/ftc-icpen-gpen-announce-results-review-use-dark-patterns-affecting-subscription-services-privacy)
- [FTC Junk Fees Rule — Rulemaking: Unfair or Deceptive Fees](https://www.ftc.gov/legal-library/browse/rules/rulemaking-unfair-or-deceptive-fees)
- [FTC Final Junk Fees Rule PDF](https://www.ftc.gov/system/files/ftc_gov/pdf/r207011_udf_rule_2024_final_0.pdf)
- [FTC Click-to-Cancel Rule — Final Rule announcement (Oct 2024)](https://www.ftc.gov/news-events/news/press-releases/2024/10/federal-trade-commission-announces-final-click-cancel-rule-making-it-easier-consumers-end-recurring)
- [US Appeals Court Blocks FTC's Click-to-Cancel Rule — Brown Rudnick](https://briefings.brownrudnick.com/post/102kr1z/us-appeals-court-blocks-ftcs-click-to-cancel-subscriptions-rule-what-your-bus)
- [Deceptive Pattern Detector — UC Berkeley School of Information](https://www.ischool.berkeley.edu/projects/2026/deceptive-pattern-detector)
