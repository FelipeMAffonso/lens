# Lens Compaction / Resume Protocol

**Purpose:** prevent shallow post-compaction work. A compressed chat summary is a pointer, not ground truth. The repo is ground truth.

This protocol is mandatory after any context compaction, resume, interruption, handoff, or user request for "deep" work. Do not implement, summarize, or claim project state from memory until this protocol is complete.

## Hard Rule

Build from the actual repository, not from memory.

If a compressed summary, prior assistant message, checklist row, or memory note conflicts with source files, docs, tests, or git state, the repo wins. If the user has sent a newer instruction, the newer user instruction wins over all older docs.

## Ultimate Welfare Tool Mandate

The current product target is not "hackathon paste-box." Treat Lens as the public-release, paper-grade consumer-welfare defense layer across the entire customer journey. After compaction, re-anchor on this mandate before choosing work:

- Lens must defend the consumer before search, during AI-assisted research, on retailer/product pages, at checkout, after purchase, during ownership, and at end-of-life.
- Lens must derive an explicit utility function before recommending anything. It cannot pretend to know preferences from a single vague prompt. It should combine stated preferences, adaptive clarification, explicit user edits, category priors, saved profiles, revealed choices, purchase history, and cross-category meta-preferences, with uncertainty shown to the user.
- Preference inference must remain user-controlled: the user can inspect, edit, disable, export, or delete every preference source. Gmail, Plaid, receipts, purchase monitoring, and push notifications are opt-in, scoped, revocable, and transparent.
- The browser extension is a first-class product surface, not a demo appendage. It should block or warn on dark patterns, hidden fees, fake scarcity, review manipulation, counterfeit/grey-market risk, affiliate influence, surveillance-pricing clues, and checkout traps.
- The data spine must be treated as core infrastructure: many SKUs, many categories, many source types, retailer and manufacturer catalogs, Amazon/Best Buy/Walmart/Target/Costco/Home Depot/Temu-style marketplace comparison, recall feeds, price history, brand/authorized-seller data, privacy/security data, and financial/purchase signals where the user explicitly grants access.
- The page must make this clear from the beginning: independent agent, no affiliate bias, transparent utility math, privacy tiers, user control, encryption posture, data sources, surfaces, monitors, and what is live versus not live.
- "Complete" means flows work end-to-end with failure states minimized: parse messy URLs, photos, screenshots, retailer pages, AI answers, receipts, and product names; degrade honestly; never invent a product or hide missing data.

When this mandate conflicts with a narrow local fix, implement the local fix in a way that moves the full consumer-welfare architecture forward.

## Required Re-Grounding

Run/read these before making substantive claims or edits:

1. `git status --short` and current branch.
2. Root inventory: `package.json`, workspace list, top-level docs, `apps/`, `workers/`, `packages/`, `packs/`, `BLOCKS/`.
3. Source-of-truth docs, in this order:
   - `LOOP_DISCIPLINE.md`
   - `VISION_COMPLETE.md`
   - `docs/VISION.md`
   - `docs/PREFERENCE_INFERENCE.md`
   - `docs/TOUCHPOINT_PLAN.md`
   - `IMPROVEMENT_PLAN.md`
   - `IMPROVEMENT_PLAN_V2.md`
   - `GAP_ANALYSIS.md`
   - `AMBIENT_MODEL.md`
   - `CHECKLIST.md`
   - `HANDOFF.md`
4. The implementation files for every surface you will touch:
   - Web: `apps/web/src/main.ts`, `apps/web/src/chat/*`
   - Extension: `apps/extension/content.ts`, `apps/extension/content/retail/*`, `apps/extension/content/hosts/*`, `apps/extension/sidebar/sidebar.ts`
   - API: `workers/api/src/index.ts`, `extract.ts`, `search.ts`, `pipeline.ts`, `workflow/specs/audit.ts`, route modules relevant to the task
   - MCP/SDK if the API contract changes
5. Tests adjacent to those implementation files.

## Required Inventory Commands

Use the fastest available search tools. In this workspace `rg` may hit access-denied paths, so PowerShell inventory is acceptable.

```powershell
git status --short
Get-ChildItem -Force
Get-ChildItem -Recurse -File -Include *.md,*.ts,*.tsx,*.js,*.json,*.toml |
  Where-Object { $_.FullName -notmatch '\\node_modules\\|\\dist\\|\\.git\\|\\.wrangler\\|\\coverage\\|\\references\\' } |
  ForEach-Object { $rel = Resolve-Path -Relative $_.FullName; "$rel`t$($_.Length)" }
```

When searching for gaps, search the code, not just docs:

```powershell
Get-ChildItem -Recurse -File -Include *.md,*.ts,*.tsx,*.js,*.json,*.toml |
  Where-Object { $_.FullName -notmatch '\\node_modules\\|\\dist\\|\\.git\\|\\.wrangler\\|\\coverage\\|\\references\\' } |
  Select-String -Pattern 'TODO|FIXME|stub|fixture|mock|fallback|not implemented|secret|api key|image|photo|sku|amazon|resolve-url' -CaseSensitive:$false
```

## Work Standard After Re-Grounding

- Map the user-facing flow end to end before editing: UI entrypoint -> shared schema -> API route -> worker module -> data source -> UI rendering -> tests.
- Prefer real empty/recovery states over optimistic placeholders.
- Minimize failure states: parse more inputs, validate earlier, preserve user intent, degrade honestly, and test edge cases.
- Never touch GitHub commits or pushes unless the user explicitly asks.
- Run verification proportional to the touched surface: targeted tests first, then workspace typecheck, then full tests/build when feasible.

## SciSciGPT Reference

The official SciSciGPT repo lives outside this repo at:

`..\references\SciSciGPT`

Use it as an architectural reference for manager/specialist/evaluation loops, not as a source of copied code. The relevant lesson is orchestration discipline: manager routes work, specialists use tools, evaluator reflects/rewards, and the loop only stops when the answer is evidence-grounded.
