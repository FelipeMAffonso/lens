# Pack maintenance agent loops

Knowledge packs are load-bearing for Lens. If they go stale — a regulation is vacated, a dark pattern gets a new variant, a brand changes its confabulation playbook — Lens's answers degrade silently. The commit history of each pack is audit evidence. So pack maintenance is not a nice-to-have; it is the mechanism that keeps Lens defensible.

This document specifies the four autonomous agent loops that keep packs current.

## Agent 1 — Pack Validator (LLM-as-judge)

**Script:** `scripts/validate-packs.mjs`

**Cadence:** weekly cron.

**Loop:**
1. Iterate every pack in `packs/`.
2. For each `evidence` entry, fetch the `sourceUrl`.
3. Ask Opus 4.7 (effort=medium, max_tokens=1000): *"Given this claim, does the source content support it? Return supported ∈ {yes, partial, no, unverifiable_from_fetched_content}."*
4. Write `data/pack-validation-report.json` with a row per (pack, evidence).

**Action:** any `supported=no` triggers an issue in the pack-validation GitHub project; the pack is flagged `status: draft` until a human resolves.

## Agent 2 — Pack Enricher

**Script:** `scripts/enrich-pack.mjs`

**Cadence:** weekly cron, staggered so each pack gets enrichment roughly every four weeks.

**Loop:**
1. For the target pack, send Opus 4.7 the full pack JSON plus a prompt asking it to use `web_search` (4 queries) to find new confabulation patterns, new regulations, new counterfeit signals, new hidden costs.
2. Opus returns a `proposedVersion` and `proposedChanges` delta.
3. Write to `data/pack-enrichment-proposals/<slug>.json` — never direct-merged; a human or a second agent reviews.

**Action:** merged proposals increment the pack version, update `lastVerified`, and flow through CI validation.

## Agent 3 — Regulation Watcher

**Script:** `scripts/check-regulation-status.mjs`

**Cadence:** weekly cron.

**Loop:**
1. For every regulation pack, build a focused query: *"Is [citation] currently in force as of today? Has status changed since [lastVerified]? Cite sources."*
2. Opus 4.7 uses `web_search` (3 queries) to check primary sources (Federal Register, state legislature pages, court opinions).
3. Returns `{currentStatus, statusChanged, changeDescription, primarySource, recommendedAction}`.

**Action:** `statusChanged=true` opens an issue. If `recommendedAction=retire-pack`, the pack's `status` moves to `retired` with `retirementDate` and `retirementReason` populated. FTC Click-to-Cancel is the canonical example — Lens's pack for it carries `status: retired`, `retirementDate: 2025-07-08`, `retirementReason: vacated by 8th Circuit`.

## Agent 4 — Product-Page Scraper

**Script (roadmap):** `scripts/scrape-category-samples.mjs`

**Cadence:** daily cron, sampling a few product pages per category.

**Loop:**
1. For each category pack, pick N (e.g. 5) current product listings from top retailers.
2. Extract the marketing text and spec sheet.
3. Ask Opus 4.7: *"Do any spec or claim patterns in these listings match the confabulationPatterns in the pack? Are there new patterns not yet captured?"*
4. Proposed additions go into the Enricher's proposal queue.

**Action:** keeps category packs current with whatever brands are actually doing in the marketplace. Writing a new pack is manual; *updating* an existing one can be mostly automated.

## Putting the loops together

```
                       ┌─────────────────┐
                       │  packs/ (git)   │
                       └────────┬────────┘
                                │
                ┌───────────────┼───────────────┐
                │               │               │
                ▼               ▼               ▼
        ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
        │ Validator    │ │ Enricher     │ │ RegWatcher   │
        │ (weekly)     │ │ (monthly)    │ │ (weekly)     │
        └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
               │                │                │
               ▼                ▼                ▼
        ┌─────────────────────────────────────────────┐
        │ data/ — reports + proposal queue            │
        └───────────────────┬─────────────────────────┘
                            │
                            ▼
        ┌─────────────────────────────────────────────┐
        │ Human or agent reviews, opens PR,           │
        │ runs bundle-packs.mjs, Worker auto-deploys. │
        └─────────────────────────────────────────────┘
```

## Why this matters for judging

The Opus 4.6 winners (CrossBeam, Elisa, PostVisit, TARA, Conductr) all landed on one pattern that Lens extends here: **parallel, specialized sub-agents doing work that would otherwise require a single over-stretched prompt.** Lens's pack-maintenance loops are four specialized agents, each tuned to a different failure mode (stale evidence, missing coverage, regulation drift, marketplace drift). This is the "Best use of Claude Managed Agents" story made concrete.

The loops also make Lens's knowledge a **living artifact**. Unlike a hardcoded database, the pack registry improves autonomously every week without requiring Felipe to write a line of code. Over months this compounds: Lens's coverage broadens, Lens's claims tighten, Lens's regulatory awareness stays current. That is the compounding moat `docs/KNOWLEDGE_ARCHITECTURE.md` predicts, instantiated.
