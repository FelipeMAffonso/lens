# The paper Lens leans on

**Affonso, F. (2026).** "Preference misalignment in machine shopping behavior." Submitted to *Nature*.

- **Scale:** 18 frontier models (Claude, GPT, Gemini, DeepSeek, Llama, Qwen, Kimi, Gemma), 20 product categories, 34 hand-crafted assortments, 32 experimental conditions, 4 paraphrases per condition, 382,679 trials in total.
- **Headline finding:** At baseline — no special framing, standard user query — these models pick a non-optimal product in ~21% of trials. The optimal pick in every assortment is the one that maximizes a simple transparent utility function (equal weight on quality and value), with every other option strictly dominated.
- **Mechanism:** Brand familiarity absorbed during pretraining. A conjoint (mechanism_attribute_swap) that rotates specs while keeping brand names fixed shows ~17% of non-optimal choices are driven by the brand name itself, not the attributes. Controls confirm the effect vanishes when brand names are replaced with "Brand A", "Brand B" etc.
- **Confabulation:** ~86% of non-optimal choices are justified post-hoc with attribute claims that don't hold up. The model cites specs to rationalize a brand-driven choice.
- **Why it matters for Lens:** the problem space is large (consumer AI shopping delegation), the pattern is consistent across model families, and the confabulation means the user cannot trust the AI's stated reasoning to sanity-check the pick. Lens is the welfare intervention: an audit layer that re-solves the problem from scratch and exposes the confabulation where it exists.

Citation in Lens's written submission summary:

> A peer-reviewed study of 18 frontier models across 382,000 trials (Affonso et al., submitted to *Nature*, 2026) showed these assistants pick a non-optimal product 21% of the time and confabulate the reasons 86% of the time.

(Full paper available on request. Preprint pending; arXiv link will be added when posted.)
