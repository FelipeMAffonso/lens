# Lens — Detailed Implementation Tracker

Single source of truth for **everything** that exists, what's missing, what's broken, and what's queued. Updated every commit. Critic-agent driven.

## TL;DR live status

- **Web app:** https://lens-b1h.pages.dev — 3 input modes (query, URL+photo, paste-AI-answer)
- **API:** https://lens-api.webmarinelli.workers.dev — `/health`, `/audit`, `/audit/stream`, `/passive-scan`, `/packs`, `/packs/stats`, `/packs/:slug`
- **Cross-model agent:** https://lens-cross-model.webmarinelli.workers.dev — `/fanout` parallel multi-provider with Opus 4.7 synthesis
- **Repo:** https://github.com/FelipeMAffonso/lens — 50+ commits, MIT, CI green
- **Knowledge packs:** **106 active** (53 category + 21 dark-pattern + 14 regulation + 11 fee + 7 intervention) — 0 errors, 0 warnings, every pack has ≥1 primary source
- **SKU index:** 15 category packs carry pack-driven representative SKUs (espresso-machines, laptops, headphones, coffee-makers, robot-vacuums, monitors, smartphones, refrigerators, golf-clubs, mattresses, wireless-earbuds, tvs, blenders, printers, eyeglasses, home-security-systems, pet-insurance)
- **Last deploy:** API ver ba059f65 (2026-04-22)

## Pack inventory (all 85)

### Category (45)

| Slug | Has primary source | lastVerified | Notes |
|---|---|---|---|
| airline-tickets | ✅ DOT primary | 2026-04-21 | |
| air-purifiers | ✅ AHAM/DOE primary | 2026-04-21 | |
| apartment-rentals | ✅ White House CFPB primary | 2026-04-21 | |
| auto-insurance | ✅ NAIC primary | 2026-04-21 | |
| baby-car-seats | ✅ NHTSA FMVSS 213 primary | 2026-04-21 | |
| baby-monitors | ✅ AAP primary | 2026-04-21 | |
| blenders | ✅ FTC Truth-in-Advertising primary | 2026-04-21 | Strengthened from CR-only |
| cameras | ✅ ISO 12233 primary | 2026-04-21 | Strengthened from DPReview-only |
| coffee-makers | ✅ SCA primary | 2026-04-21 | |
| cookware | ✅ EPA PFOA + DOE/NIST | 2026-04-21 | |
| credit-cards | ✅ CFPB CARD Act primary | 2026-04-21 | regulatoryLinks slug fixed |
| dishwashers | ✅ ENERGY STAR primary | 2026-04-21 | |
| electric-bikes | ✅ FCC + NYC FDNY primary | 2026-04-21 | |
| electric-toothbrushes | ✅ ADA primary | 2026-04-21 | |
| espresso-machines | ✅ SCA primary | 2026-04-21 | |
| fitness-equipment | ✅ FTC + SEC 10-K primary | 2026-04-21 | Strengthened |
| headphones | ✅ ANSI/ASA + FTC Endorsement primary | 2026-04-21 | Strengthened from RTINGS-only |
| health-insurance | ✅ HealthCare.gov + ACA primary | 2026-04-21 | |
| hiking-backpacks | ✅ ASTM F1955-22 primary | 2026-04-21 | Strengthened |
| home-insurance | ✅ NAIC + III primary | 2026-04-21 | |
| hotels | ✅ FTC Junk Fees Rule primary | 2026-04-21 | |
| hvac-systems | ✅ DOE + IRS primary | 2026-04-21 | |
| kitchen-knives | ✅ ASTM E18-22 primary | 2026-04-21 | Strengthened |
| laptops | ✅ MIL-STD-810H DLA + iFixit + FTC primary | 2026-04-21 | Strengthened |
| mattresses | ✅ ASTM F1566-23 + FTC primary | 2026-04-21 | Strengthened |
| mechanical-keyboards | ✅ Cherry MX official primary | 2026-04-21 | |
| monitors | ✅ VESA ClearMR primary | 2026-04-21 | Strengthened |
| office-chairs | ✅ BIFMA primary | 2026-04-21 | |
| pet-food | ✅ AAFCO + FDA CVM primary | 2026-04-21 | |
| printers | ✅ FTC Right-to-Repair primary | 2026-04-21 | Strengthened |
| refrigerators | ✅ ENERGY STAR primary | 2026-04-21 | |
| robot-vacuums | ✅ AHAM AC-1 primary | 2026-04-21 | Strengthened |
| running-shoes | ✅ World Athletics Rules primary | 2026-04-21 | Strengthened |
| smart-thermostats | ✅ ENERGY STAR primary | 2026-04-21 | |
| smartphones | ✅ FTC + Google support primary | 2026-04-21 | Strengthened |
| software-subscriptions | ✅ CFPB + CA SB-313 primary | 2026-04-21 | |
| standing-desks | ✅ BIFMA X5.5 primary | 2026-04-21 | |
| student-loans | ✅ studentaid.gov + CFPB primary | 2026-04-21 | |
| supplements | ✅ FDA DSHEA + USP primary | 2026-04-21 | |
| tvs | ✅ VESA DisplayHDR + FTC primary | 2026-04-21 | Strengthened |
| vpn-services | ✅ NIST + EFF primary | 2026-04-21 | |
| washing-machines | ✅ ENERGY STAR + CR primary | 2026-04-21 | |
| wearables | ✅ FDA + peer-reviewed primary | 2026-04-21 | |
| wine | ⚠ One-source (Nature) — agent flagged as overloaded | 2026-04-21 | Needs additional citation |
| wireless-earbuds | ✅ IEC 60529 primary | 2026-04-21 | Strengthened |

### Dark patterns (17)

`bait-and-switch`, `comparison-prevention`, `confirmshaming`, `disguised-ads`, `fake-scarcity`, `fake-social-proof`, `fake-urgency`, `forced-action`, `forced-continuity`, `hidden-costs`, `nagging`, `obstruction`, `preselection`, `roach-motel`, `sneak-into-basket`, `trick-wording`, `visual-interference` — all sourced to Brignull canonical taxonomy (deceptive.design) + FTC 2023 report where applicable.

### Regulation (10)

| Slug | Status | Effective | Vacated |
|---|---|---|---|
| eu-digital-services-act | in-force | 2024-02-17 | — |
| eu-gdpr-consent | in-force | 2018-05-25 | — |
| us-ca-ccpa | in-force | 2020-01-01 | — |
| us-ca-sb-313-click-to-cancel | in-force | 2018-07-01 | — |
| us-federal-ftc-click-to-cancel-vacated | **vacated** | 2025-07-14 (was) | 2025-07-08 by 8th Circuit |
| us-federal-ftc-endorsement-guides | in-force | 2023-06-29 | — |
| us-federal-ftc-fake-reviews | in-force | 2024-10-21 | — |
| us-federal-ftc-junk-fees | in-force (narrowed) | 2025-05-12 | — |
| us-federal-magnuson-moss | in-force | 1975-07-04 | — |
| us-federal-truth-in-lending | in-force | 1969-07-01 | — |

### Fees (8)

`bnpl-interest`, `early-termination-fee`, `inactivity-fee`, `ink-subscription-entanglement`, `resort-fee`, `shipping`, `subscription-auto-renewal`, `ticket-service-fee`

### Interventions (5)

`draft-cancel-subscription`, `draft-magnuson-moss-return`, `file-cfpb-complaint`, `file-ftc-complaint`, `surface-and-warn`

## Workflow implementation status (52 from CONSUMER_WORKFLOWS.md)

### Stage 0 — Need emergence (5)

| W# | Workflow | Status | Notes |
|---|---|---|---|
| W1 | Ad-influence traceback | 🔴 not implemented | roadmap |
| W2 | Scheduled-replacement reminders | 🔴 not implemented | needs scheduled cron + product-history store |
| W3 | Trigger-based purchase alerts | 🔴 not implemented | roadmap |
| W4 | Pre-need category onboarding | 🔴 not implemented | roadmap |
| W5 | Subscription discovery (email ingestion) | 🔴 not implemented | needs Gmail OAuth + scheduled poll |

### Stage 1 — Discovery & inspiration (4)

| W# | Workflow | Status |
|---|---|---|
| W6 | Category exploration | 🟡 partial (covered by W8 query mode) |
| W7 | Lifestyle bundles | 🔴 not implemented |
| W8 | Preference elicitation | ✅ live in web `query` mode |
| W9 | Comparative framing | 🔴 not implemented |

### Stage 2 — Research (4)

| W# | Workflow | Status |
|---|---|---|
| W10 | Spec-optimal discovery + sliders | ✅ live |
| W11 | Alternative surfacing at price tiers | ✅ live in `alternativesCard()` |
| W12 | Cross-assistant disagreement | ✅ live via Managed Agent worker |
| W13 | Vendor vs independent source weighting | 🔴 not implemented (settings-level) |

### Stage 3 — Evaluation (7)

| W# | Workflow | Status |
|---|---|---|
| W14 | AI recommendation audit (paste/screenshot) | ✅ live |
| W15 | Single-product URL evaluation | ✅ live in `url` mode |
| W16 | Source provenance | 🟡 partial (within claim verify) |
| W17 | Review authenticity analysis | 🔴 not implemented |
| W18 | Counterfeit / grey-market check | 🔴 not implemented |
| W19 | Sponsorship scanner | 🔴 not implemented |
| W20 | Claim verification | ✅ live |

### Stage 4 — Decision & purchase (8)

| W# | Workflow | Status |
|---|---|---|
| W21 | Price-history & sale-legit | 🔴 not implemented (needs price-history API) |
| W22 | Dark-pattern checkout scan | ✅ extension passive (one-stage); LLM second-stage now exists at `/passive-scan` |
| W23 | Compatibility check | 🔴 not implemented |
| W24 | True-total-cost reveal | 🔴 not implemented |
| W25 | Data-disclosure audit | 🔴 not implemented |
| W26 | Breach-history on seller | 🔴 not implemented (needs HIBP integration) |
| W27 | Scam / fraud detection | 🔴 not implemented |
| W28 | Checkout-readiness summary | ✅ rendered as combined banner+alternatives+welfare |

### Stage 5 — Delivery & setup (3)

| W# | Workflow | Status |
|---|---|---|
| W29 | Unboxing/DOA verification | 🔴 not implemented (photo mode exists; verification logic doesn't) |
| W30 | Setup instruction aggregation | 🔴 not implemented |
| W31 | Warranty/returns reality | 🔴 not implemented |

### Stage 6 — Post-purchase validation (6)

| W# | Workflow | Status |
|---|---|---|
| W32 | Welfare-delta analytic | ✅ live (localStorage) |
| W33 | Recall monitoring | 🔴 not implemented (needs CPSC RSS poll cron) |
| W34 | Price-drop refund | 🔴 not implemented |
| W35 | Returns/warranty assistance | 🟡 intervention pack exists; UI flow doesn't |
| W36 | Subscription audit | 🟡 intervention pack exists; UI flow doesn't |
| W37 | Performance tracking | 🔴 not implemented |

### Stage 7 — Ongoing use (4)

| W# | Workflow | Status |
|---|---|---|
| W38 | Firmware monitoring | 🔴 not implemented |
| W39 | Compatible-accessory discovery | 🔴 not implemented |
| W40 | Lock-in cost tracking | 🔴 not implemented |
| W41 | Repairability tracking | 🔴 not implemented |

### Stage 8 — End of life (4)

| W# | Workflow | Status |
|---|---|---|
| W42 | Resale-value estimation | 🔴 not implemented |
| W43 | Recycling/disposal routing | 🔴 not implemented |
| W44 | Trade-in optimization | 🔴 not implemented |
| W45 | Upgrade-timing analysis | 🔴 not implemented |

### Cross-journey (7)

| W# | Workflow | Status |
|---|---|---|
| W46 | Values overlay | 🔴 not implemented |
| W47 | Family/household profiles | 🔴 not implemented (single profile per device) |
| W48 | Gift-buying mode | 🔴 not implemented |
| W49 | Group-buy pooling | 🔴 not implemented |
| W50 | Profile portability | ✅ live with Export/Import JSON |
| W51 | Public disagreement ticker | 🔴 not implemented (needs aggregation backend) |
| W52 | Lens Score API | 🔴 not implemented |

## Pack-maintenance agent status (4 loops per docs/PACK_AGENTS.md)

| Agent | Script | Cron status | Output artifact |
|---|---|---|---|
| Schema validator | `scripts/validate-pack-schema.mjs` | ✅ runs in CI on every push + weekly | exit code |
| LLM-as-judge | `scripts/validate-packs.mjs` | ✅ scheduled weekly (requires ANTHROPIC_API_KEY secret) | `data/pack-validation-report.json` |
| Pack enricher | `scripts/enrich-pack.mjs` | ✅ scheduled weekly, rotating 5 packs | `data/pack-enrichment-proposals/*.json` |
| Regulation watcher | `scripts/check-regulation-status.mjs` | ✅ scheduled weekly | `data/regulation-status-report.json` |
| Product-page scraper (W4 roadmap) | not built | 🔴 not built | — |

All four cron jobs live in `.github/workflows/pack-maintenance.yml`, schedule `13 6 * * 1` (Monday 06:13 UTC, off-minute by design).

## Outstanding gaps from critic agents

| # | Gap | Severity | Owner / next action |
|---|---|---|---|
| G1 | Extension `<all_urls>` permission overreach | 🟡 medium | Narrow to specific retailer + AI-chat host patterns in next cycle |
| G2 | Privacy notice / consent modal absent | 🟡 medium | Ship `/privacy` page + first-run consent dialog |
| G3 | Cloudflare Worker logs request bodies (Tier 0 promise broken) | 🟡 medium | Strip request bodies from console.log, document log retention |
| G4 | Fan-out to 3rd-party AIs (OpenAI/Google/OpenRouter) undisclosed in UI | 🟡 medium | Update cross-model card subtitle to name providers |
| G5 | Vision uploads pass through 2 third parties (CF + Anthropic) without disclosure | 🟡 medium | Add upload-confirmation modal |
| G6 | DELIVERY_ARCHITECTURE promises k-anonymity, encryption-at-rest — none implemented | 🟡 medium | Walk back doc claims OR build D1 + encryption layer |
| G7 | Wine pack still has one-source (Nature) overloaded citation | 🟢 low | Add second source |
| G8 | All packs share `lastVerified: 2026-04-21` — bulk-generation tell | 🟢 low | Spread dates as enricher updates packs |
| G9 | `lookupSpec` could false-positive on string fields | 🟢 low | Prioritize numeric-yielding fields in alias resolution |
| G10 | No unit/integration tests | 🟡 medium | Add at least one end-to-end test against fixture mode |
| G11 | Per-criterion candidate scores opaque (where did 0.73 come from?) | 🟢 low | Add tooltip linking score to spec value |
| G12 | Each category pack only has 5-7 criteria; real categories have 20-50 specs | 🟡 medium | Expand category packs with `secondaryCriteria[]` array (next cycle, per user note) |
| G13 | No SKU catalog — every audit relies on live web search or hand-curated fixture | ✅ shipped | `representativeSkus[]` field added to CategoryBody. Espresso/laptops/headphones packs have 7-8 SKUs each. `search.ts` fixture mode now pulls from pack SKUs with legacy fallback. |

## Next loop priorities

1. Expand 5 category packs with `secondaryCriteria` (15-25 additional specs per pack) — addresses G12, user's "many specs exist" observation
2. Privacy notice + consent modal (G2)
3. Disclose 3rd-party fan-out in UI (G4, G5)
4. Add at least one end-to-end pipeline test (G10)
5. Strengthen wine pack with second source (G7)

## Cycle log

- Cycle N (2026-04-21): all 85 packs validated 0-warning; primary source on every pack; pack-maintenance cron with 4 jobs live; passive-scan endpoint shipped; pipeline warnings added; extension build script added; profile export/import; verdict banner counts unverifiable.
