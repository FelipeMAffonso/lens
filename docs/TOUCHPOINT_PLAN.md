# Touchpoint implementation plan

One-row-per-workflow status across the 11 shipping workflows from `VISION.md` + the key journey touchpoints from `CONSUMER_WORKFLOWS.md`. This is the single tracker — no scattered improvisation.

## Status legend

- ✅ shipped and live
- 🟡 code done, UI/wiring incomplete
- 🔴 not started
- ⏸ deferred to roadmap

## 11 shipping workflows (per VISION.md)

| # | Workflow | Status | Surface | Notes |
|---|---|---|---|---|
| W8  | Preference elicitation from typed prompts | ✅ | Web app `query` mode | Opus 4.7 adaptive thinking, pack-driven criteria |
| W10 | Spec-optimal discovery with live utility sliders | ✅ | Web app result card | Sliders re-rank client-side using server-returned per-criterion scores |
| W11 | Alternative surfacing at price tiers | ✅ | `alternativesCard()` | Same-price-different-tradeoff + 75%-tier + 50%-tier alternatives |
| W12 | Cross-assistant disagreement via Managed Agent | ✅ | Separate Worker `workers/cross-model/` | Parallel fan-out + Opus 4.7 synthesis at `/fanout` |
| W14 | AI recommendation audit (paste mode) | ✅ | Web app `text` mode | Headline demo, verdict banner, claim verdicts |
| W15 | Single-product URL evaluation | ✅ | Web app `url` mode + `extract.ts::extractFromUrl` | Fetches page, strips HTML, Opus 4.7 parses |
| W16 | Source provenance check | 🟡 | Mentioned in cross-model; not shipped as separate workflow | Marked simplified in VISION; part of claim verify |
| W20 | Claim verification against live sources | ✅ | `verify.ts` + pack confabulation patterns | Per-pack patterns drive verdicts |
| W28 | Checkout-readiness summary | ✅ | Verdict banner + alternativesCard + welfare-delta combined | Single-glance verdict + alternatives view |
| W32 | Welfare-delta analytic | ✅ | `welfareDeltaCard()` + localStorage | Avg utility advantage + price delta across history |
| W50 | Preference profile portability | ✅ | `saveProfile()` / `loadProfiles()` in localStorage | Auto-saved per category on every audit; exportable as JSON |

## Key supplementary touchpoints

| # | Workflow | Status | Surface |
|---|---|---|---|
| W6 (paste-photo of AI chat) | image mode | ✅ | `kind: "image"` with vision extract |
| W22 Dark-pattern checkout scan | passive | ✅ | Chrome extension `darkPatterns.ts` — 7 patterns |
| photo input (retail shelf / box) | vision | ✅ | `kind: "photo"` — extract.ts `extractFromPhoto()` |
| extension AI-chat text extract | popup | ✅ | `apps/extension/content.ts` |
| extension inline badge | overlay | ✅ | `renderBadges()` in darkPatterns.ts |

## Roadmap (deferred — not shipping this week)

Beyond the 11-workflow shipping set, CONSUMER_WORKFLOWS.md enumerates 41 more, including:

- Email ingestion + receipt parsing (W5) ⏸
- Ad-influence traceback (W1) ⏸
- Scheduled-replacement reminders (W2) ⏸
- Trigger-based purchase alerts (W3) ⏸
- Review authenticity analysis (W17) ⏸
- Counterfeit / grey-market check (W18) ⏸
- Sponsorship scanner (W19) ⏸
- Price history + sale-legit (W21) ⏸
- True-total-cost reveal (W24) ⏸
- Data-disclosure audit (W25) ⏸
- Returns / warranty assistance (W35) ⏸
- Subscription audit & cancellation (W36) ⏸
- Recall monitoring (W33) ⏸
- Lock-in cost tracking (W40) ⏸
- Repairability tracking (W41) ⏸
- Gift-buying mode (W48) ⏸
- Public disagreement ticker (W51) ⏸
- Lens Score API (W52) ⏸

These are documented with their Opus 4.7 capability dependencies, data tiers, and consent tiers in the six architecture docs. The pack-maintenance agent scripts (`scripts/validate-packs.mjs`, `enrich-pack.mjs`, `check-regulation-status.mjs`) already exist as the backing infrastructure — they run the per-pack agent loops the roadmap workflows depend on.

## Why this file exists

User feedback after the 30+ commits: "Every time I give detailed feedback you pick a specific point only and forget the rest and superficialize it." Fair.

This file forces every further edit to declare which workflow it moves and where status changes. Any new commit in lens/ should update this table if it completes, partially completes, or defers a workflow. That's the discipline.
