# F0 — Winner Calibration (what we must beat)

Read this before touching any block. Every decision in BLOCK_PLAN.md is shaped by what these winners shipped.

## 1. CrossBeam (1st, $50k) — `mikeOnBreeze/cc-crossbeam`

**Stats**: 756 files, 82,048 lines (ts/tsx/js/md). 47 `.ts` + 34 `.tsx` + 300+ markdown.

**Stack**:
- Next.js 16 + React 19 + shadcn/ui + Tailwind CSS 4 frontend
- Express 5 orchestrator on Cloud Run (persistent long-running process)
- Vercel Sandbox per agent job (isolated execution environment)
- Supabase (Postgres + Realtime + Storage)
- Claude Agent SDK with `claude_code` preset
- 28+ reference files per skill, decision-tree routers, composite skills
- 13 design iterations documented

**Execution model**:
- Phased task graph in `claude-task.json` with per-phase `status`, per-task `passes`, per-phase `verification.steps`
- Testing ladder L0-L4: SDK init → skill invoke → subagent+Bash → mini pipeline → skill2 isolation → full pipeline
- Cost budget per level: L0 $0.01 (Haiku) → L4 $25 (Opus)
- **Agent runs take 10-30 minutes** (!)
- Git commit per task (`git add agents-crossbeam/ test-assets/ && git commit -m "task-XXX:..."`)
- Voice logs (`progress.md`) kept throughout the build

**Agent SDK config pattern (PROVEN)**:
```typescript
query({
  prompt,
  options: {
    tools: { type: 'preset', preset: 'claude_code' },
    systemPrompt: { type: 'preset', preset: 'claude_code', append: CUSTOM },
    cwd: AGENTS_ROOT,
    settingSources: ['project'],
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    allowedTools: ['Skill', 'Task', 'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebSearch', 'WebFetch'],
    additionalDirectories: [PROJECT_ROOT],
    maxTurns: 80,
    maxBudgetUsd: 15.00,
    model: 'claude-opus-4-7',
    includePartialMessages: true,
    abortController: new AbortController(),
  }
})
```

**Critical gotchas we must replicate**:
- Missing `tools` preset → agent says "I'll write the file" but nothing appears
- Missing `settingSources: ['project']` → skills not discovered
- Wrong `cwd` → loads wrong skills
- Permission prompts hang → use `bypassPermissions` + `allowDangerouslySkipPermissions`
- Subagents can't find skills reliably → prefer parent-level skill calls

**Skills-first knowledge architecture**:
- `california-adu` skill: 28 reference files covering HCD ADU Handbook + Gov Code 66310-66342 + decision tree router + quick-reference thresholds table
- `adu-corrections-interpreter` skill: multi-step workflow guide
- `adu-city-research` skill: three modes (WebSearch discovery / WebFetch extraction / browser fallback)
- `crossbeam-ops` skill: teaches agents how to operate the deployed system via API
- Symlinked from `adu-skill-development/skill/` into `.claude/skills/` so they're source-controlled once

**Why CrossBeam won**: real quantified problem (90%+ first-submit rejection rate), real-world traction (Buena Park city with 8900 permit target), live city research working on 480+ CA cities, two reversible flows (contractor side + city side), fire-and-forget phase autonomy with explicit pause/resume. "I didn't write a single line of code" framing — credible because Agent SDK did the heavy lifting.

## 2. Elisa (2nd, $30k) — `zoidbergclawd/elisa`

**Stats**: 713 files, 17,690 lines (ts/tsx/js/py/md). 375 `.ts` + 183 `.tsx`. **76 commits in 30 hours.** **1,500+ tests.**

**Stack**:
- Electron 35 desktop app with `safeStorage` OS-keychain API key storage
- React 19 + Vite 7 + Blockly 12 + Tailwind CSS 4 frontend
- Express 5 + ws 8 + Zod 4 backend
- `@anthropic-ai/claude-agent-sdk` via `query()` per task
- Vitest (backend + frontend)
- **MicroPython firmware** for ESP32-S3-Box3 + Heltec LoRa devices
- esbuild backend bundler, tsc for Electron main, Vite for frontend

**Architecture primitives**:
- `NuggetSpec` — Zod-validated JSON produced by Blockly interpreter, drives the whole pipeline
- **Task DAG** via Kahn's algorithm (`utils/dag.ts`)
- **Build Session** — in-memory state machine (idle → planning → executing → testing → deploying → done)
- **Agent roles**: Builder, Tester, Reviewer, Custom — each has role-specific system prompt
- **Orchestrator phases** (a-l): AUTO-TEST → PLAN → FRAMEWORK → MEETINGS → TRACE → PORTALS → EXECUTE → TEST → GATE → HEALTH → DEPLOY → COMPLETE
- **Streaming-parallel pool** — Promise.race, up to 3 concurrent tasks
- **Token budget** per agent with 80% warning + halt on exceed
- **Per-task meeting triggers** (design review at task_starting, mid-build meetings at 25/50/60% completion)
- **TestRunner** parses pytest/node test results + coverage
- **GATE** — pass-rate gate with auto-fix (Explorer: no gate, Builder: 50%/1 fix, Architect: 80%/2 fixes)
- **HealthTracker** — grade A-F, history persisted
- **Device plugin system**: `devices/<plugin-id>/device.json` manifest + `prompts/agent-context.md` + `templates/` + `lib/`
- **Planning Mode** — conversational assistant that builds the spec before executing
- **Composition Mode** — arrange nugget blocks spatially (vertical=sequential, side-by-side=parallel)
- **Iterative chat** — after build completes, user keeps chatting; re-runs targeted agents on the existing workspace
- **SessionLogger** — per-session logs in `.elisa/logs/`
- **Per-task git commits** via simple-git
- **Multi-device flash wizard** for hardware deployment

**Docs organization (matters for judges who read repos)**:
- `docs/INDEX.md` — master index
- `ARCHITECTURE.md` (root)
- `CLAUDE.md` at every major directory level
- `docs/plans/` — 20+ design/plan markdown files
- `docs/manual/` — user-facing guides
- **Staleness prevention rule**: update relevant CLAUDE.md in the same commit when architecture changes

**Why Elisa won 2nd**: scale flex (76 commits, 39K LOC, 1500 tests), multi-modal demo (visual blocks → code → website AND ESP32 hardware), embedded pedagogy (teaching layer woven into build steps), real child user (daughter tested + deployed). Judges saw a product, not a demo.

## 3. PostVisit.ai (3rd, $10k)

Not accessible via GitHub (private). From public reporting: **349 commits in 7 days**. Cardiologist MD with 20 years of healthcare software experience. Built during a Brussels→San Francisco road trip. Tested in real hospital settings.

Key pattern: leverage **domain expertise + real deployment surface**. PostVisit wasn't a demo — it was a real patient-care tool a real doctor could use.

## 4. TARA (Keep Thinking Prize, $5k) — Kyeyune Kazibwe

Converts dashcam footage → complete infrastructure investment appraisal with NPV, cash flows, equity scoring, sensitivity analysis. 5 hours vs weeks for a $1-4M traditional study. Vision analysis → road segment classification → auto-populated costs → PDF report.

Key pattern: **collapse a multi-month expert workflow into a vision-driven pipeline with a structured deliverable (PDF)**.

## 5. Conductr (Creative Exploration, $5k) — Asep Bagja

Browser-based MIDI instrument with Claude as live bandmate. C engine compiled to WebAssembly generates notes every 15ms. 4,800 lines JS + WASM.

Key pattern: **Claude embedded in a real-time loop where latency matters**. Typing "make it funky" modifies live arrangements without stopping playback.

## What this means for Lens

The bar isn't "52 workflows with a paste box for each." The bar is:

1. **≥ 3 separate services** running real work (API worker + cross-model worker + MCP server + scheduled cron).
2. **Actual state persistence** (D1 + KV + R2) that makes Watcher + Advocate + Historian workflows credible.
3. **Multi-surface demo**: web + inline extension sidebar + PWA mobile + MCP tool + email inbound.
4. **Phased task execution** (CrossBeam pattern) so the build is auditable and resumable.
5. **Testing ladder** L0-L5 with per-level cost budget and model choice.
6. **Per-task git commits** with messages that map to block IDs.
7. **Progress log** (`progress.md` or equivalent) documenting the build decisions.
8. **Docs-first** with CLAUDE.md at every major directory level and INDEX.md at the top.
9. **Real users** — Lens must run against real ChatGPT/Claude/Gemini/Rufus/Perplexity + real Amazon/BestBuy/Walmart/Target at demo time.
10. **Quantified welfare metric** — "your picks would have averaged +$X / +Y utility vs the AIs'" — visible in the demo, sourced from real audit history.
11. **A structured PDF-style deliverable** somewhere in the flow (e.g., Lens Audit Report PDF exportable).
12. **Real-time streaming** (SSE + WebSocket for the dashboard; content-script postMessage for the sidebar).

**If Lens ships less than Elisa-scale (17K LOC, 1500 tests) the submission video has to be unreasonably strong to compensate.** Target is CrossBeam-scale (80K+ LOC, but with simpler per-file density via the pack abstraction).

---

## Lessons to bake into Lens's execution discipline

- **Never push perfection on extraction upfront.** CrossBeam pivoted: simple-fast extraction + smart search agent beats slow-perfect extraction.
- **Budget each level.** Don't run the full pipeline (L4, $15+) when a mini pipeline (L3, $5) validates the architecture.
- **Buena Park shortcut pattern** — one hand-curated scenario lets you skip live integrations while debugging. Lens's fixture-mode catalog is the equivalent; do not remove it.
- **Real model IDs, not aliases.** `claude-opus-4-7`, `claude-haiku-4-5-20251001` — not `opus` or `haiku`.
- **Session directories per run.** CrossBeam writes every artifact to `sessions/{timestamp}/{artifact.json}`. Lens must do the same for audit runs so they're replayable.
- **Don't fight permission prompts.** `bypassPermissions` + `allowDangerouslySkipPermissions` for headless agent runs.
- **Skills are load-bearing.** CrossBeam's 28-file ADU skill is what makes its agent competitive. Lens needs equivalent skill packaging for at least Shopping-Domain, Dark-Pattern, Regulation, and Intervention.
