# F4 — Cron + scheduler primitives

**Status:** in progress.
**Prerequisites:** F3 (workflow engine), F2 (KV for lock + D1 for run log).
**Unlocks:** Watcher workflows (recall-watch, price-drop-watch, firmware-watch, subs-renewal-watch, replacement-reminder), pack-maintenance crons.

## Why
The workflow engine runs one-shot when `/audit` is called. Every "while you sleep" workflow in `VISION_COMPLETE.md` §4 (rows 25-28) needs a scheduler. Cloudflare Workers ship with Cron Triggers natively — we wire them into the engine.

## Scope (minimum viable)
- `wrangler.toml` adds `[triggers] crons = [...]`.
- `workers/api/src/cron/dispatcher.ts` — the `scheduled()` handler export; maps incoming cron pattern to a workflow spec.
- `workers/api/src/cron/jobs.ts` — registry `{cronPattern → workflowId}`.
- `workers/api/src/cron/lock.ts` — KV-backed distributed lock (so two concurrent isolates don't both fire the same cron if Cloudflare retries).
- `workers/api/src/workflow/specs/recall-watch.ts` — **stub** spec. Just emits a `node:start` → `node:complete` with a placeholder "would poll CPSC/NHTSA/FDA" message + persists a run log row.
- `workers/api/src/index.ts` exports `scheduled` alongside `default app` so wrangler routes cron invocations.
- `GET /cron/jobs` — introspection endpoint (lists registered cron → workflow mappings).

Does NOT ship in this block:
- Actual CPSC feed parsing (that's its own block under A-RECALL-FEED / S6-W33).
- Managed Agent based long-running runs (that's the Durable Object variant, later).
- A full dashboard UI for cron runs (use `/trace/recent?workflow=recall.watch` for now).

## Files
- `workers/api/wrangler.toml` (update)
- `workers/api/src/index.ts` (export scheduled)
- `workers/api/src/cron/dispatcher.ts`
- `workers/api/src/cron/jobs.ts`
- `workers/api/src/cron/lock.ts`
- `workers/api/src/cron/lock.test.ts`
- `workers/api/src/cron/dispatcher.test.ts`
- `workers/api/src/workflow/specs/recall-watch.ts`

## Acceptance
- [ ] `wrangler.toml` has `[triggers] crons = ["*/15 * * * *", "17 */2 * * *", "7 6 * * 1"]` (or similar representative set).
- [ ] `scheduled()` handler routes cron → dispatcher → workflow run.
- [ ] KV lock prevents double-runs when the same cron fires in two isolates within a 5-min window.
- [ ] `recall.watch` workflow registered + triggered on its cron.
- [ ] 4+ unit tests: lock acquire/release, dispatcher match, no-op when no workflow registered, stub recall-watch spec runs cleanly.
- [ ] Live deploy + smoke: `GET /cron/jobs` returns the registry; wrangler tail shows at least one cron fire within 30 min.
