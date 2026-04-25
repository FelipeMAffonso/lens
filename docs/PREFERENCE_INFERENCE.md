# Preference inference — the epistemically hard problem

The utility function is the center of Lens. Everything downstream (ranking, alternative surfacing, claim verification weighting, welfare-delta computation) depends on having a faithful weighted representation of what the user actually cares about. But preferences are in the user's head, often inconsistent, often constructed in-the-moment, and subject to framing effects. This document lays out how Lens infers preferences and why the approach is defensible.

## What the research says

Decades of consumer research conclude that preferences are **constructive rather than retrieved** (Payne, Bettman & Johnson, *The Adaptive Decision Maker*, 1993). Consumers do not carry fixed utility functions in their heads that they simply report when asked; they build the preference in response to the question, the context, and the options presented. This is the origin of framing effects (Tversky & Kahneman, *The Framing of Decisions and the Psychology of Choice*, 1981), anchoring, and status-quo bias (Samuelson & Zeckhauser, 1988).

This has three consequences for any system that tries to infer preferences:

1. **Stated preferences are partial truth.** When a user says "I care about pressure and build quality," that is a real signal about what is salient to them right now, but not a complete utility function. Follow-up elicitation can recover weights the user did not think to mention.

2. **Revealed preferences are also partial truth.** Past purchases are informative but constrained by past choice sets, past budgets, past defaults, and past ignorance. The user chose X because they did not know Y existed, or because Y was out of stock, or because status-quo inertia kept them on X.

3. **The honest pipeline combines both, with explicit user editing as the final authority.** No single inference mechanism dominates; the right answer is a principled combination.

Recent research on LLMs for preference elicitation confirms both the promise and the pitfalls. LLMs can simulate consumer preferences with roughly 89% accuracy in persona-chatbot studies ([Consumer segmentation with LLMs, ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0969698924003746)) but directly asking an LLM to emit a complete utility function "may yield misleading results" without a careful prompting pattern — chain-of-thought conjoint reasoning is the recommended mitigation ([Can LLMs Capture Human Preferences?, *Marketing Science* 2024](https://pubsonline.informs.org/doi/10.1287/mksc.2023.0306)). Generative Active Task Elicitation (GATE) and Bayesian Preference Elicitation with language models show that LLMs acting as active questioners can converge to approximately efficient preference estimates with **~5× fewer queries** than classical conjoint-based elicitation ([Accelerated Preference Elicitation with LLM-Based Proxies, arxiv 2501.14625](https://arxiv.org/abs/2501.14625); [Eliciting Human Preferences with Language Models, OpenReview](https://openreview.net/forum?id=LvDwwAgMEW)). Crucially, LLMs have documented weaknesses in **quantifying their own uncertainty, modeling the user's mental state, and asking informative questions** — so the pipeline has to compensate for those with structured fallbacks.

A separate line of work ([A Bayesian hierarchical approach to joint modelling of Revealed and stated choices, ScienceDirect 2023](https://www.sciencedirect.com/science/article/abs/pii/S1755534523000209); [Combining stated and revealed preferences, arxiv 2507.13552](https://arxiv.org/pdf/2507.13552)) shows that **Bayesian hierarchical models combining stated and revealed preference data** produce more robust individual-level utility estimates than either source alone, explicitly accounting for decision inertia and scale differences between stated and behavioral data. This is the statistical shape Lens's preference model takes over time.

## The Lens preference-inference pipeline

Five layers, running in order. Earlier layers handle the fast common case; later layers handle the hard cases and long-term calibration.

### Layer 1 — Goal-based parsing (the user's first few words)

The user types, dictates, or pastes a natural-language description of what they want. Opus 4.7's adaptive thinking parses the text into (a) the product category, (b) a list of salient criteria, (c) directional preferences on each criterion, (d) any explicit constraints (budget, brand exclusions, compatibility requirements), and (e) a confidence score per inferred weight.

This is the common case. It works end-to-end in roughly 5 seconds on a typical query. The user sees the inferred weights immediately and can accept them.

Rationale: goal-based elicitation is the lowest-friction path and is supported by the conversational-recommender-systems literature ([Effect of preference elicitation methods on user experience, ScienceDirect 2024](https://www.sciencedirect.com/science/article/pii/S0885230824000792)). Domain experts prefer attribute-based elicitation; novices prefer goal-based; this layer handles both because goals implicitly decompose into attributes.

### Layer 2 — Adaptive clarification (when Layer 1 leaves ambiguity)

Opus 4.7 returns a confidence score per inferred weight. When any weight falls below threshold (low confidence), Lens triggers targeted clarification questions framed as concrete binary trade-offs. Example: "When you say *build quality* matters, would you rather have (A) full stainless steel + 11 lb weight + $50 more, or (B) mixed-material + 7 lb + $50 less?" Two to four of these converge to individual-level weights quickly.

This is the conjoint-style step, implemented adaptively rather than as a fixed battery. Research on accelerated preference elicitation with LLM proxies shows these adaptive questions converge about 5× faster than non-adaptive conjoint ([arxiv 2501.14625](https://arxiv.org/abs/2501.14625)). The same research shows active questioning with an LLM in the loop compensates for LLMs' known weakness at self-assessing uncertainty — the structured format forces the model to commit to a testable question.

When the user answers, Opus 4.7 updates the weights. The updated weights and the full question-answer trace are stored in the user's preference profile so that later audits in the same category do not need to re-ask.

### Layer 3 — Explicit editing (the user always has final authority)

Every preference profile is visible and editable. The user opens a panel, sees the current weights with the natural-language rationale, and adjusts them directly — numeric slider, enable/disable, rename criterion, add new criterion. Explicit user edits take precedence over every inferred value and are preserved across sessions.

This layer is what makes the pipeline defensible. The user is never locked into the system's inference; transparency + editability resolves the LLM's known weakness at modeling the user's mental state by letting the user just tell the system what they meant. Explicit correction is the ground truth that later layers learn from.

### Layer 4 — Revealed-preference updating (longitudinal learning)

After each audit, Lens logs whether the user accepted its top-ranked recommendation, or overrode it, or abandoned the session. Over 5-10 audits in a category, a Bayesian hierarchical update to the user's weights is applied in light of these observed choices:

- If the user consistently picked rank-2 over rank-1, the criterion that discriminates between them gets an upward weight adjustment.
- If the user abandoned sessions where the top pick exceeded some price threshold, budget sensitivity gets recalibrated.
- If the user overrode the ranker to pick a product with an attribute Lens did not track, that attribute gets added as a candidate criterion for next time.

The Bayesian hierarchical structure (individual-level weights sampled from a category-level prior) is drawn from the marketing-science literature on joint RP+SP modeling ([ScienceDirect 2023](https://www.sciencedirect.com/science/article/abs/pii/S1755534523000209)). It accounts for decision inertia (user might still prefer X in stated terms even after picking Y several times) and scale differences between stated and behavioral data.

### Layer 5 — Cross-category transfer (priors across categories)

The user's preferences are not independent across categories. A user who consistently values "durability and repairability" in laptops is likely to value them in kitchen appliances. Layer 5 uses Opus 4.7 to infer **meta-preferences** (values that transfer) from category-specific weights and seeds new categories with informed priors. The user sees the inferred prior explicitly and can accept or reject it before the new category profile is committed.

This turns Lens into an increasingly good fit over time without ever requiring behavioral telemetry outside Lens's own audit history.

## What Lens does NOT do

Lens does not use browsing telemetry outside of its own audit flow. It does not harvest purchase history from connected email or bank accounts without explicit per-source consent. It does not apply collaborative-filtering across users to nudge preferences (no "people who liked X also liked Y" ranking perturbation). Revealed preferences are learned only from the user's own direct interactions with Lens.

This constraint is deliberate. The whole point of Lens is that the user's preferences are the scoring function; any mechanism that silently imports external signals would undermine that. Opt-in social proof (Workflow 21 in `CONSUMER_WORKFLOWS.md`) exists as an explicitly-surfaced, user-activated feature — not a silent ranking input.

## Uncertainty, refusal, and "I don't know"

LLMs are known to under-report their own uncertainty, which is the central failure mode that preference-inference research has identified ([Eliciting Human Preferences with Language Models](https://openreview.net/forum?id=LvDwwAgMEW)). Lens handles this three ways:

1. **Every weight has a confidence score** attached, derived from Opus 4.7's self-report combined with a structural check (does the user's text actually mention this criterion directly, imply it, or did the model guess?). Low-confidence weights trigger Layer 2.

2. **When weights remain ambiguous after adaptive elicitation, Lens refuses to commit a ranking.** The UI shows "we need another question to distinguish between A and B" rather than ranking with a low-confidence weight. This is the principled equivalent of the "unverifiable" verdict in claim verification.

3. **Every utility breakdown is visible.** If the user sees that rank-1 beats rank-2 by 0.03 utility where a single weight moved 0.1 could flip the order, the UI says so explicitly. A tight margin on low-confidence weights is flagged, not hidden.

## What ships now

The current implementation no longer treats preference inference as a loose prompt artifact. `workers/api/src/preferences/inference.ts` wraps every extracted intent in `layered-utility-v1` before ranking. The audit result now carries the utility-model audit trail through the shared schema, and the web UI renders it in the criteria card.

- Layer 1 (goal-based parsing) runs in `workers/api/src/extract.ts`, then `derivePreferenceIntent()` canonicalizes, normalizes, and explains the criteria.
- Layer 2 (adaptive clarification) is still handled by the `/clarify` flow when low-confidence preferences need an explicit trade-off question.
- Layer 3 (explicit editing) is the plain-language re-rank UI plus saved local preference profiles; every criterion can carry source, confidence, and rationale metadata.
- Layer 4 (revealed-preference updating) has a first deterministic implementation in `workers/api/src/performance/handler.ts`: post-purchase satisfaction can adjust the user's category weights, and the code supports both legacy object-shaped rows and current array-shaped criteria rows.
- Layer 5 (cross-category transfer) is represented today as category-level priors and user-controlled profile layers; true hierarchical cross-category learning remains a roadmap item until enough longitudinal, consented user data exists to estimate it honestly.

The important product rule is live in code: Lens derives and exposes a utility function before recommendation, and any sensitive behavioral source (Gmail, Plaid, receipts, purchase history, push watchers) stays opt-in and revocable.

## Why this pipeline wins versus competitors

ChatGPT, Rufus, Google AI Mode, and Perplexity all infer preferences from the user's query plus proprietary behavioral telemetry, and then present the ranking without showing the weights. The inference itself is black-box and non-editable; the user cannot see the confidence of each weight, cannot correct an obvious misinterpretation, cannot carry preferences between sessions as portable data. Lens makes every one of those properties explicit.

The consequence is that Lens's preference inference stays accurate longitudinally in a way the incumbents' cannot. An incumbent's ranking improves only through behavioral optimization against their own revenue objective; Lens's ranking improves through explicit user correction against the user's own welfare objective. These are different optimization targets, and over time they diverge sharply.

## Citations

Payne, J. W., Bettman, J. R., & Johnson, E. J. (1993). *The Adaptive Decision Maker*. Cambridge University Press.

Tversky, A., & Kahneman, D. (1981). "The Framing of Decisions and the Psychology of Choice." *Science*, 211(4481), 453-458.

Samuelson, W., & Zeckhauser, R. (1988). "Status Quo Bias in Decision Making." *Journal of Risk and Uncertainty*, 1, 7-59.

Relevant LLM-era sources:
- [Can Large Language Models Capture Human Preferences? (*Marketing Science*)](https://pubsonline.informs.org/doi/10.1287/mksc.2023.0306)
- [Eliciting Human Preferences with Language Models (OpenReview)](https://openreview.net/forum?id=LvDwwAgMEW)
- [Accelerated Preference Elicitation with LLM-Based Proxies (arxiv 2501.14625)](https://arxiv.org/abs/2501.14625)
- [Bayesian Preference Elicitation with Language Models](https://www.emergentmind.com/papers/2403.05534)
- [The effect of preference elicitation methods on the user experience in CRS (ScienceDirect)](https://www.sciencedirect.com/science/article/pii/S0885230824000792)
- [A Bayesian hierarchical approach to joint modelling of Revealed and stated choices (ScienceDirect 2023)](https://www.sciencedirect.com/science/article/abs/pii/S1755534523000209)
- [Combining stated and revealed preferences (arxiv 2507.13552)](https://arxiv.org/pdf/2507.13552)
- [Consumer segmentation with large language models (ScienceDirect)](https://www.sciencedirect.com/science/article/abs/pii/S0969698924003746)
- [Foundations of Stated Preference Elicitation (Berkeley — Kenneth Train)](https://eml.berkeley.edu/~train/papers/foundations.pdf)
