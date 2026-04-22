# F17 — Observability (structured logs + traces)

**Status:** in progress.
**Prerequisites:** F2 (D1 for trace storage), F3 (workflow_runs table).
**Unlocks:** F18 rate limiting, every agent loop (visibility), demo-day debugging.

## Why
Every workflow run needs to be inspectable after the fact. Debugging failed audits, understanding why a dark-pattern verdict fired, showing judges "here's exactly what ran" — all require structured logs + per-span traces tied to a runId. The existing `console.log` calls are unstructured and unstructured logs don't ship.

## Scope (minimum viable)
- `workers/api/src/obs/log.ts` — structured-log helper. One JSON line per event. Tags: `level`, `runId`, `nodeId`, `userId`, `anonUserId`, `ts`, `msg`, `...attrs`.
- `workers/api/src/obs/trace.ts` — span factory. Every node execution already creates a span implicitly via `workflow_runs.nodes_json`; add a wrapper that stamps `trace_id` on the run and `span_id` per node. Surface duration, status, attributes.
- Update `workflow_runs` migration to include `trace_id` (already present, wire it).
- `GET /trace/:runId` — returns the full run + per-node span tree.
- `GET /trace/recent?workflow=&limit=` — recent runs, for the future debug dashboard.
- No external OTEL exporter this block — shipping to Workers Logs console is enough for the hackathon. Exporter path added in a later polish block.

## Files
- `workers/api/src/obs/log.ts`
- `workers/api/src/obs/trace.ts`
- `workers/api/src/obs/index.ts` (re-exports)
- `workers/api/src/obs/log.test.ts`
- `workers/api/src/obs/trace.test.ts`
- Update `workers/api/src/index.ts` to mount `/trace/:runId` + `/trace/recent`.
- Update `workers/api/src/workflow/context.ts` to use `obs/log` under the hood (already JSON-line, extend with trace tags).

## Acceptance
- [ ] Structured JSON log emitted on every run start / node start / node complete / node error / run complete.
- [ ] Every `workflow_runs` row has a `trace_id` populated (ULID).
- [ ] `GET /trace/:runId` returns the full run JSON from D1 with per-node spans.
- [ ] `GET /trace/recent?limit=20` lists recent runs.
- [ ] 5+ unit tests for log + trace helpers.
- [ ] Live smoke: run an audit, hit `/trace/:runId` with the returned id, get back a complete trace.
