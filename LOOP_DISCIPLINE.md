# Loop Discipline — the anti-drift contract

**This file is the first thing every loop turn reads. If you are here, you are about to execute one block. Read all of this before touching any code, every single turn, no exceptions.**

## The problem this file solves

Earlier runs drifted. Claude woke up, glanced at `CHECKLIST.md`, grabbed the first ⬜, produced a shallow version that looked plausible, marked it ✅, moved on. Result: a paste-box website labeled as "the consumer's independent agent across every point of every purchase." The demo didn't match the vision, and the code was ~5% of the winner-level depth.

**This file is the corrective.** Every turn re-anchors on the full context before execution, and every block ships at CrossBeam/Elisa depth — not a sketch, not a stub, not a placeholder.

## Mandatory reads per turn (in this exact order)

On every single loop turn, before you consider what to execute:

1. **`GAP_ANALYSIS.md`** — read end-to-end. This is WHY the block matters. If you can't articulate the specific gap the block closes, stop and re-read.
2. **`BLOCKS/F0-WINNER-CALIBRATION.md`** — read end-to-end. This is the QUALITY BAR. CrossBeam 82K LOC, Elisa 17.7K LOC + 1500 tests, PostVisit 349 commits in 7 days. If your block isn't pushing toward that scale, it's drift.
3. **`BLOCK_PLAN.md`** — read end-to-end. This is the SHAPE of the full plan. Skimming is drift. The whole plan matters because block dependencies are plan-global.
4. **`CHECKLIST.md`** — read top-to-bottom. This is the STATE. Find the first ⬜ whose prereqs (by ID precedence or explicit block-file prereqs) are all ✅ or 🟡-sufficient.
5. **`BLOCKS/<block-id>.md`** — read end-to-end. If it does not exist yet, STOP — do not execute. First write the block file at F1/F2/F3 level of detail (~5k-10k words per file), then read what you wrote, then execute.

## Anti-drift rules

### Depth
- Every block targets **winner-level depth**, not minimal-passing depth. If CrossBeam did 28 reference files for one domain skill, your equivalent is 28+ files.
- "Works for the happy path" ≠ done. Include error states, retry policies, timeouts, idempotency, observability, tests.
- Tests are not optional. Every module ships with ≥ 90% branch coverage + at least one integration test that exercises the full flow.

### Scope
- Complete the current block entirely before starting the next. Partial work in multiple blocks is drift.
- If a block's implementation checklist has 20 items, execute all 20 items in one unbroken execution, not three items per turn across seven turns.
- Do not jump to polish (P1-P10) or demo (DEMO-1..8) blocks before foundation (F1-F20) is ✅. Foundation is load-bearing.

### Verification
- Never mark ✅ on a block unless:
  1. Every item in its "Implementation checklist" is done.
  2. Every item in its "Acceptance criteria" is met.
  3. Tests pass (`npm test --workspaces` or targeted subset).
  4. Build passes (`npm run typecheck --workspaces`).
  5. If the block touches deployed surfaces: deploy succeeds (`wrangler deploy` or `wrangler pages deploy`) and a smoke test hits a real endpoint.
  6. A commit exists referencing the block ID.
  7. **An Opus 4.7 LLM-as-judge pass has run on the shipped feature and every P0+P1 finding has been applied in-block.** (See "LLM-as-judge gate" below.)

### LLM-as-judge gate (mandatory per block)

After the code lands + tests pass + deploy succeeds, **before** marking ✅ and moving on, run an Opus 4.7 critic pass. The gate exists because 50+ ✅-marked blocks that pass tests but miss edge cases, UX gaps, or drift from Apple-product-bar collectively read as shallow. The judge pass is cheap (1-2 Opus calls per block) and catches class-of-bug issues tests can't.

**How to run it:**

```ts
Agent({
  description: "Opus 4.7 critic for <block-id>",
  subagent_type: "general-purpose",
  model: "opus",
  prompt: `You are an Opus 4.7 critic for Lens hackathon code. The just-shipped feature is <block-id>: <one-line summary>. Files touched: <list>. Tests added: <count>. Read the block's file, the code changed in the last commit (git show HEAD), and the relevant docs (VISION_COMPLETE.md, AMBIENT_MODEL.md, LOOP_DISCIPLINE.md, docs/VISION.md). Find flaws: missing edge cases, UX gaps, integration holes, deviation from Apple-product bar, drift from the block's acceptance criteria, security holes, affiliate/ranking-bias regressions. Propose concrete fixes. Return a numbered punch list, ≤300 words, sorted P0 → P3.`
})
```

**Severity rubric (what the judge should pin):**

- **P0** — correctness/security/affiliate-leak/regressions → fix in-block, same commit.
- **P1** — missing edge case, UX gap the acceptance criteria didn't catch → fix in-block.
- **P2** — defensible deferrals, incremental polish → open a follow-up block file.
- **P3** — nice-to-have, later-phase → record in block file under `## Judge notes`.

**Apply P0 + P1 before marking ✅.** Re-test + re-deploy if code changed. Append the judge's punch list (verbatim) to the block file under `## Judge pass <date>`.

**Why:** the user mandated this on 2026-04-22 ("for every single little feature that you ship, you also MUST send opus 4.7 agents to llm-as-judge and find flaws and improve the full feature"). A block that skipped the judge pass is a block that drifted.

### Git
- Commit message format: `lens(<block-id>): <one-line summary>` + co-author footer.
- Commit at block boundaries, not mid-block.
- `git push` after every commit to keep the public repo current for judges.
- Never use `--no-verify`, never amend published commits.

### Progress
- Append a progress-log line at the bottom of CHECKLIST.md for every completed block: `YYYY-MM-DD: <block-id> ✅ — <one-line summary>. Commit: <hash>.`
- Update the status column AND the commit column in CHECKLIST.md.

### Stuck
- If a block blocks you for more than **3 turns**, STOP.
- Document what you tried + what failed + your best theory in `BLOCKS/<block-id>.md` under a new `## Blockers` heading.
- Leave status as `⏳` and move on to an INDEPENDENT block on the next turn.
- Never fake progress. Never mark ✅ with a broken implementation.

### Context
- After 50+ turns in a single session, the conversation gets compressed. Trust `GAP_ANALYSIS.md`, `BLOCK_PLAN.md`, `CHECKLIST.md`, and `BLOCKS/*.md` as ground truth. These files are the externalized memory.
- When the compressed session summary says something different from those files, the files win.

### Anti-pattern list (things that are drift, not progress)

- ❌ Reading only CHECKLIST.md and grabbing the next ⬜.
- ❌ Creating a new `docs/SOMETHING.md` instead of writing real code.
- ❌ Marking a block ✅ because the function "looks right" without running tests.
- ❌ Adding a route that returns `{ ok: true }` as a placeholder.
- ❌ Saying "this would work" without making it work.
- ❌ Jumping to demo recording before end-to-end integration works on real hosts.
- ❌ Rewriting one pack's JSON instead of shipping a new workflow.
- ❌ Refactoring existing code when the task is to add a new capability.
- ❌ "I'll come back to tests later."
- ❌ Summarizing what was done instead of what is working.

### Pro-pattern list (things that are progress)

- ✅ A commit that adds ≥ 500 lines of real code + ≥ 5 tests per module.
- ✅ A deployed endpoint that returns real data when hit from curl.
- ✅ A UI that renders on a real host page (when the block calls for extension work).
- ✅ A workflow that completes end to end in a Durable Object / cron run.
- ✅ Tests that fail before your change and pass after.
- ✅ A new `BLOCKS/<id>.md` file written at F1/F2/F3-level depth before execution.

## Execution cadence target

- Average 1 block per 2-4 turns for foundation (F1-F20) when I'm in session.
- Average 1 block per 2 turns for workflow implementations once foundation is ✅.
- **By submission time (Sun Apr 26 8PM EDT):** ≥ 80 blocks ✅, which should land ≥ 40K LOC + ≥ 1500 tests + all 8 demo beats recorded.

## Model choice per operation

Mirror CrossBeam's L0-L4 budget ladder:

| Operation | Model | Why |
|---|---|---|
| Wiring tests (L0/L1) | Haiku 4.5 | Cheap, fast; testing glue |
| Subagent orchestration tests | Sonnet 4.6 | Medium cost, medium quality |
| Skill reference files + domain content | Opus 4.7 | Quality matters; cheap at low token counts |
| End-to-end pipeline runs | Opus 4.7 | Production path |
| Pack enrichment | Opus 4.7 + web_search | Live research |
| Regulation status | Opus 4.7 + web_search | Low-volume, high-consequence |

Use `model: 'claude-haiku-4-5-20251001'` for wiring tests. Use `model: 'claude-opus-4-7'` for everything else.

## Agent SDK config (proven, copy-paste)

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';
const result = query({
  prompt,
  options: {
    tools: { type: 'preset', preset: 'claude_code' },
    systemPrompt: { type: 'preset', preset: 'claude_code', append: LENS_SYSTEM },
    cwd: LENS_ROOT,
    settingSources: ['project'],
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    allowedTools: ['Skill','Task','Read','Write','Edit','Bash','Glob','Grep','WebSearch','WebFetch'],
    additionalDirectories: [REPO_ROOT],
    maxTurns: 80,
    maxBudgetUsd: 15.00,
    model: 'claude-opus-4-7',
    includePartialMessages: true,
    abortController: new AbortController(),
  }
});
```

## Absolute priorities (in order)

1. **Never ship drift.** Every commit should be something a CrossBeam/Elisa reviewer would nod at.
2. **Foundation before feature.** F1-F20 must be ✅ before any stage workflow is executed.
3. **Tests with every change.** No untested code merges.
4. **Commit block-by-block.** Clean git history.
5. **Deploy continuously.** Every foundation and surface block deploys live by end of that block.
6. **Document in-band.** CLAUDE.md at every major directory. Update INDEX.md when structure changes.

## Off-limits (the lines you do not cross)

- **Do not** delete `GAP_ANALYSIS.md`, `BLOCK_PLAN.md`, `CHECKLIST.md`, `BLOCKS/F0-WINNER-CALIBRATION.md`, or this file.
- **Do not** remove the `packs/` knowledge-pack JSON files except via an explicit pack-maintenance commit.
- **Do not** amend or rebase already-pushed commits.
- **Do not** skip hooks (`--no-verify`) or signing.
- **Do not** log user emails, API keys, or raw session tokens.
- **Do not** post to production services (Resend email, push notifications, SMS) without a `LENS_ENV=production` gate and an explicit user authorization.
- **Do not** add affiliate links, tracking pixels, `ref=`, `tag=`, `utm_*`, or any monetized-redirect parameter to any retailer URL Lens produces. Ever. Lens's ranking is pure deterministic math on user-stated preferences, and the revenue posture is "none that biases ranking." Enforcement: a commit introducing such params is a project-violation commit and must be reverted. See `VISION_COMPLETE.md` §13 #8.

## The Apple-product bar (added 2026-04-21)

Every block touches the product surface. Every block is graded against:

1. **Smooth.** No jank, no FOUC, no jarring transitions, no spinner-that-never-spins, no layout shift. Target CLS ≤ 0.01, TBT ≤ 150ms.
2. **Intelligent.** Every input anticipates intent. Empty states teach. Error states recover. Ambiguous queries ask one clarifying question, not five.
3. **Beautiful.** Typography scale, 4px radius scale, coral accent `#DA7756`, soft shadows, consistent spacing ramp (4/8/12/16/24/32/48). No pixel-pushed one-offs.
4. **Motion with purpose.** 150ms on interactive elements, 300ms on layout changes. `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out-quint). Progress bars for predictable duration, not indefinite spinners.
5. **Accessible.** Every interactive element keyboard-reachable, focus rings visible, aria-labels set, AA contrast. axe-core clean on every route.
6. **Responsive.** Every surface works cleanly at 360px. Extension sidebar collapses to full-screen on narrow viewports.
7. **Delightful details.** Optimistic updates on profile saves. Toast on successful sign-in. Subtle micro-interaction on slider re-rank (brief 200ms flash on the new top pick). Empty states that feel like conversation.
8. **Consistent across surfaces.** Web dashboard, extension sidebar, mobile PWA, email digest, MCP schemas — all share the type scale, color tokens, motion curves, icon set. One product, many surfaces.
9. **Honest loading.** "Searching the web for 12 real espresso machines" beats "Loading…". Every long-running workflow narrates itself via SSE tied to stage labels.
10. **Never a placeholder.** Every UI state is a real state with real copy, not `lorem ipsum` or `TODO`. If a feature isn't built, its card doesn't exist yet; if it exists, it's complete.

**The test:** show the finished surface to someone who has never seen Lens. If their first reaction isn't "oh this is nice", the bar hasn't been hit.

## One-line mantra

**Read the context. Write the block file at depth. Execute every item. Test. Deploy. Commit. Mark ✅. Next. Feel like Apple shipped it.**
