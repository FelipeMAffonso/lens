# Lens — Session Handover

If you (or a fresh Claude session) are picking this up cold, read this file first.

## 30-second summary

**Lens** is a consumer-welfare shopping agent built for Built-With-Opus-4.7 hackathon (Apr 21-26, 2026). It ingests a natural-language query, URL, photo, or pasted AI shopping recommendation, and returns (a) a spec-optimal product ranking from a knowledge-pack-driven SKU index, (b) a confabulation audit of any AI-stated claims, (c) a plain-English welfare delta. Grounded in Affonso (2026) Nature-submitted paper: 18 models × 382K trials → 21% non-optimal recommendation rate, 86% confabulation rate.

## Live surfaces (all working, all public)

| Surface | URL | Status |
|---|---|---|
| Web dashboard | https://lens-b1h.pages.dev | ✅ 3 modes (query, url, text) + photo upload + profile export |
| API worker | https://lens-api.webmarinelli.workers.dev | ✅ `/health`, `/audit`, `/audit/stream` SSE, `/passive-scan`, `/packs`, `/packs/stats`, `/packs/:slug` |
| Cross-model | https://lens-cross-model.webmarinelli.workers.dev | ✅ `/fanout` OpenAI+Google+OpenRouter → Opus 4.7 synthesis |
| GitHub repo | https://github.com/FelipeMAffonso/lens | ✅ MIT, CI green, main=e1491ba |
| Chrome extension | `apps/extension/` | ✅ MV3, esbuild IIFE, passive dark-pattern scan |
| Privacy page | https://lens-b1h.pages.dev/privacy.html | ✅ Full sub-processor table |

## Authoritative state documents (read in this order)

1. **`TRACKER.md`** — pack inventory, workflow status (W1-W52), gap list (G1-G13), agent status. **Updated every commit.**
2. **`docs/VISION.md`** — Lens's core thesis: "the consumer's independent agent across every point of every purchase"
3. **`docs/CONSUMER_WORKFLOWS.md`** — 52 workflows across 9 customer-journey stages (scope charter)
4. **`docs/KNOWLEDGE_ARCHITECTURE.md`** — pack schema, 5 pack types, primary-source rule, weekly updater architecture
5. **`docs/TOUCHPOINT_PLAN.md`** — which workflows are live, partial, or not-yet, with exit criteria per row
6. **`SUBMISSION.md`** — hackathon submission text + DEMO video shot list
7. **`packs/SCHEMA.md`** — JSON schema for knowledge packs (mirrors `packages/shared/src/packs/types.ts`)

## Repo layout

```
lens/
├── apps/
│   ├── web/              Vite web dashboard (deployed to Cloudflare Pages)
│   └── extension/        Chrome MV3 extension with esbuild IIFE build
├── workers/
│   ├── api/              Hono on CF Workers — audit pipeline entry point
│   └── cross-model/      Fanout to OpenAI/Google/OpenRouter + Opus synthesis
├── packages/
│   └── shared/           Zod schemas + pack types (source of truth)
├── packs/
│   ├── category/         (57) knowledge packs per product category
│   ├── dark-pattern/     (23) deceptive patterns — full Brignull canonical + drip-pricing + intermediate-currency
│   ├── regulation/       (15) in-force/vacated/delayed laws with status + citation
│   ├── fee/              (13) typical hidden fees + disclosure legality per jurisdiction
│   └── intervention/     (8) remediation templates with consent tiers
├── scripts/
│   ├── validate-pack-schema.mjs   blocking — runs before bundle
│   ├── bundle-packs.mjs           generates workers/api/src/packs/all.generated.ts
│   ├── enrich-pack.mjs            LLM-as-judge via Opus 4.7 web search
│   ├── validate-packs.mjs         LLM critic pass
│   └── check-regulation-status.mjs weekly regulation-watcher
├── .github/workflows/pack-maintenance.yml    4 weekly cron jobs
├── docs/                 All architecture + handover + vision documents
└── TRACKER.md            ALWAYS UP TO DATE — the live ledger
```

## Build/deploy cheatsheet

```bash
# Build packs (runs validator first, blocks on error)
node scripts/bundle-packs.mjs

# Deploy API
cd workers/api && npx wrangler deploy

# Deploy web
cd apps/web && npm run build && npx wrangler pages deploy dist

# Validator alone
node scripts/validate-pack-schema.mjs

# Build Chrome extension
cd apps/extension && npm run build  # outputs to dist/
```

## Known state at handover point (2026-04-22, main=e1491ba)

**Working:**
- **116 packs** bundled, validated **0 errors, 0 warnings**
- **21 category packs carry SKU indexes** (espresso-machines, laptops, headphones, coffee-makers, robot-vacuums, monitors, smartphones, refrigerators, golf-clubs, mattresses, wireless-earbuds, tvs, blenders, printers, eyeglasses, home-security-systems, pet-insurance, carry-on-luggage, gas-grills, dishwashers, office-chairs, standing-desks, online-therapy) — fixture-mode audit covers the full mid-market product space
- Fixture-mode audit uses pack-declared SKUs (deterministic ~6-18s demo)
- Real-mode audit uses Opus 4.7 web search (`LENS_SEARCH_MODE=real`)
- Weekly pack-maintenance cron (Monday 06:13 UTC) runs 4 jobs: schema-validate, llm-judge, regulation-watcher, enricher
- Chrome extension passively scans checkouts for Brignull patterns with inline badges
- Privacy sub-processor table complete
- **UX overhaul shipped** (commit 6ff1ce2): light theme, coral accent, 4px radii, focus rings, card shadows, CTA band — design language modeled on the Cognitive Traps Repository

**Recently fixed:**
- `illegalInJurisdictions` validator false-positive (was treating jurisdiction names as pack slugs) — removed at commit cc2b932
- Stale "73 packs" copy in index.html → 106 (will need to bump to 111 next deploy)

**Still-open gaps (from TRACKER.md G1-G13):**
- G1: No auth on web app (acceptable for hackathon demo)
- 52 workflows: ~18 live, ~6 partial, ~28 not-implemented (roadmap)
- W17 review-authenticity workflow declared in fake-social-proof pack but no endpoint yet
- `wine` category pack flagged by judge agent as one-source
- Demo video not yet recorded (Task #7 pending)
- "106 Knowledge Packs" copy in index.html is stale vs current 111; update on next web deploy

**Active `/loop` cron:** ID `70f3dd2b`, fires every 5 min, prompt = "continue building Lens..."

## Next pending task (Task #21)

> Implement W17 review-authenticity workflow using fake-social-proof pack. Add 5+ new packs. Apply P1 UX polish from cognitive-traps audit.

## Bootstrap for a new session

1. Read `docs/VISION.md` (≤5 min)
2. Read `TRACKER.md` (full)
3. Read `docs/CONSUMER_WORKFLOWS.md` (scope charter)
4. `cd` into `projects/claude-opus-4-7-hackaton/lens`
5. Check `git log --oneline -20` to see the last 20 commits
6. Open `TaskList` to see pending work
7. Pick the next highest-value task from `TRACKER.md` gap list or the pending TaskList entry

## Escalation points (things only Felipe can do)

- Anthropic/OpenAI/Google/OpenRouter API keys (stored in CF worker secrets, bound at deploy)
- Cloudflare account access
- GitHub account
- Hackathon submission form (when ready)

## Commit style

```
lens: <verb> <scope> (<count> change)

<2-3 sentence body>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

Push with `GIT_TERMINAL_PROMPT=0 git push` to avoid HTTPS prompt hangs.
