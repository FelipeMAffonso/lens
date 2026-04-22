# Journey integration — how each stage actually runs

This maps every one of the 52 workflows in `CONSUMER_WORKFLOWS.md` to concrete runtime behavior: which packs fire, which agents run, what the user sees, what consent is required. It is the operational counterpart to `DELIVERY_ARCHITECTURE.md` — the 6-axis matrix described WHERE each workflow lives; this doc describes WHAT ACTUALLY HAPPENS during a run.

## Stage 0 — Need emergence

**Example flow: the user opens their email; Lens's Gmail integration ingests a receipt.**

1. User has granted durable email-ingestion consent (Tier 3).
2. Cloudflare Cron Trigger fires every 15 min; the `email-ingest` Worker polls the Gmail API for new messages matching a "receipts" filter.
3. For each new receipt: fetch HTML body → extract purchase record via Opus 4.7 vision (some receipts are images). Store in D1.
4. Compare against subscriptions in the user's profile; if this is a renewal charge, cross-reference against `fee/subscription-auto-renewal`.
5. If the receipt indicates a forced auto-charge or a surprise fee, trigger the `intervention/surface-and-warn` pack → email the user.

Packs used: `fee/subscription-auto-renewal`, `intervention/surface-and-warn`, any category packs for the purchased products (for post-hoc welfare-delta calculation).

## Stage 1 — Discovery

**Example flow: user types "espresso machine under $400, pressure + build + steam."**

1. POST `/audit` with `kind: query` (Job 1 primary mode, roadmap; currently `kind: text` with empty `raw`).
2. `extract.ts` two-pass:
   - Pass 1 identifies category = "espresso machine"
   - `findCategoryPack("espresso machine")` returns `category/espresso-machines` pack
   - Pass 2 re-runs extraction with `categoryCriteriaPrompt()` injected — criteria names now match the pack template (pressure, build_quality, steam_power, etc.)
3. `search.ts` — in fixture mode, returns the curated 5-product espresso catalog; in real mode, `web_search_20260209` tool pulls 6-8 live candidates using the pack's `specNormalization` rules.
4. `rank.ts` — deterministic utility math per criterion, applying `typicalRange` and `direction` from the pack.
5. Return the ranked candidates with full utility breakdown.

Packs used: `category/espresso-machines` (criteria + normalization + hidden-cost disclosures). Latency: 10-18s.

## Stage 2 — Research (a.k.a. Stage 1 continued)

Same as Stage 1 but with an explicit comparison set (the user brings 2-3 specific products they're considering). The `search.ts` step is skipped; ranking is applied to the provided set.

## Stage 3 — Evaluation (AI audit scenario — the demo headliner)

**Example flow: user pastes a ChatGPT espresso recommendation.**

1. POST `/audit` with `kind: text`, `source: chatgpt`, `raw: <ChatGPT answer>`.
2. `extract.ts` extracts:
   - `intent` (user's criteria — derived from user prompt if provided, else inferred from the AI's framing)
   - `aiRecommendation` (the picked product + claims + reasoning trace)
3. `search.ts` returns candidates (fixture or live).
4. `verify.ts` runs with `categoryConfabulationsPrompt()` injected:
   - Each AI claim is checked against candidate specs.
   - The prompt now knows category-specific patterns (`stainless-steel` means plastic with accent; `15 bar` is pump-nominal not brew target).
   - Verdicts cite pack evidence (E1, E3).
5. `rank.ts` computes spec-optimal.
6. `crossModel.ts` fans out to GPT-4o / Gemini / Kimi in parallel (future: Managed Agent hand-off).
7. Return the audit card.

Packs used: `category/espresso-machines` (confabulation patterns), `regulation/us-federal-magnuson-moss` (if warranty terms come up), applicable dark-pattern packs if URL scanning is included.

## Stage 3 — Evaluation (dark-pattern scan, passive extension mode)

**Example flow: user browses to an Amazon product page. Extension scans passively.**

1. Content script runs `detectHost()` → identifies host type.
2. Content script runs `lightweightDetect()` — CSS/DOM heuristics from `darkPatternsByPageType.get("product")` — this selects the applicable pack subset without any LLM call.
3. If any heuristic triggers, the content script collects evidence (screenshot + DOM fragment) and posts to `POST /passive-scan`.
4. The Worker runs the second stage: Opus 4.7 with the matched packs' `llmVerifyPrompt` fragments composed via `darkPatternsPrompt()`.
5. If confirmed, the extension renders an inline badge (intervention `surface-and-warn`).

Packs used: `dark-pattern/*` (the relevant subset for page type), `intervention/surface-and-warn`.

Consent: user installed extension (explicit one-time). Per-scan is implicit. No data leaves the device until the user clicks the badge.

## Stage 4 — Decision & purchase

**Example flow: user on hotel checkout page.**

1. Extension detects page type = `checkout` with keyword match "resort fee".
2. `lightweightDetect()` on `dark-pattern/hidden-costs` fires.
3. Worker receives passive-scan: `darkPatternsPrompt([hidden-costs pack])` + `regulationsPrompt([ftc-junk-fees pack])` + `feesPrompt([resort-fee, ticket-service-fee])`.
4. Opus 4.7 returns: *"Hidden-costs pattern detected; 'resort fee' is covered by FTC Junk Fees Rule effective May 2025; this hotel appears to be violating the Total Price requirement."*
5. Extension renders warning badge with link to `intervention/file-ftc-complaint`.

Packs used: `dark-pattern/hidden-costs`, `regulation/us-federal-ftc-junk-fees`, `fee/resort-fee`, `intervention/surface-and-warn`, `intervention/file-ftc-complaint`.

Consent: explicit per-action for the FTC complaint filing.

## Stage 5 — Delivery & setup (roadmap)

User uploads photo of delivered product. `/audit` with `kind: image`, `source: user-upload`. Opus 4.7 vision compares photo to the retailer's listing photos (previously captured by the extension or passed as URL). If substitution detected, triggers `intervention/draft-magnuson-moss-return`.

## Stage 6 — Post-purchase

**Example flow: a product in the user's purchase history gets recalled.**

1. Cloudflare Cron fires weekly.
2. `regulation-watcher` agent checks CPSC/NHTSA/FDA recall feeds.
3. For each recall, cross-reference against user's purchase history in D1.
4. If match: push notification / email with the recall details + `intervention/draft-magnuson-moss-return` template pre-filled.

Packs used: `intervention/draft-magnuson-moss-return`, `regulation/us-federal-magnuson-moss`, category pack for the specific product.

## Stage 7 — Ongoing use

**Example flow: user owns an HP printer with Instant Ink subscription.**

1. User added the printer + subscription to their Lens profile (Tier 2, explicit durable).
2. Weekly cron runs `regulation-watcher` — monitors Magnuson-Moss enforcement news + HP-specific firmware-update lawsuits.
3. If significant development (class action settlement, firmware that re-enables third-party cartridges), Lens notifies the user.

Packs used: `fee/ink-subscription-entanglement`, `category/printers`, `regulation/us-federal-magnuson-moss`.

## Stage 8 — End of life (roadmap)

Resale-value estimation + recycling routing, user-triggered via web dashboard. Pack: `category/*` for the specific product.

## Cross-journey

**Preference profile is Tier 1 (localStorage).** Every workflow consults the profile. `findCategoryPack()` uses the profile's per-category preferences to select the right pack. Changes to criteria weights propagate to the next audit automatically without re-prompting Opus.

**Welfare-delta** is Tier 2 (server, user-keyed). Runs on every completed audit. Aggregates over time. The user sees their number after ~10 audits; the public disagreement ticker (Workflow 51) aggregates over all consented users.

## Per-pack call graph

Each audit request traverses a fraction of the pack registry. The registry's indexed lookups ensure this is O(1) per lookup:

```
/audit (espresso query)
  ├── findCategoryPack("espresso machine")
  │     → category/espresso-machines          [1 pack]
  │     → injects categoryCriteriaPrompt()    [~500 tokens]
  │     → injects categoryConfabulationsPrompt() [~800 tokens]
  ├── getFeesForCategory("espresso")
  │     → [] (no category-specific fees registered)
  │     → fee/shipping, fee/subscription-auto-renewal (generic *) [2 packs]
  ├── getRegulationsForJurisdiction("us-federal")
  │     → us-federal-magnuson-moss, ftc-junk-fees, ftc-fake-reviews,
  │       ftc-endorsement-guides, ...                              [4 packs]
  └── getDarkPatternsForPageType("product")
        → (only for URL-scan workflows; no-op in paste audit)
```

Total prompt-fragment tokens per audit: ~2000-4000. Well under the per-request budget.

## Consent gradient summary

| Workflow class | Consent tier | Data tier |
|---|---|---|
| Paste audit (Stage 3) | implicit per-session | Tier 0 in-flight |
| Preference profile save | explicit one-time | Tier 1 local |
| Extension install | explicit one-time | Tier 1 local by default |
| Passive page scan (extension) | implicit per-session after install | Tier 0 (scanned data not sent unless user opens badge) |
| Email ingestion (Gmail) | explicit durable | Tier 3 sensitive |
| Purchase-history import | explicit durable | Tier 3 sensitive |
| Automatic price-match filing | explicit delegated autonomous | Tier 3 |
| Anonymized welfare-delta contribution | explicit data-contribution | Tier 4 |
| Public-ticker contribution | explicit data-contribution | Tier 4 |

The gradient is the ethical spine. Every workflow declares its tier; the UI never skips the consent step for that tier.
