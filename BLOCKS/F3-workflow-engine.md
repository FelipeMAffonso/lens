# F3 — Workflow engine (runtime DAG + event bus + scheduler)

**Status:** pending.
**Prerequisites:** F2 (persistence — workflow runs persisted to D1).
**Estimated time:** 8-10 hours.
**Blocks:** every workflow block that isn't the existing linear audit pipeline.

## Why this block exists

The existing `runAuditPipeline` is a 140-line function that hardcodes the order `extract → {search||crossModel} → verify → rank` and emits events via a single callback. It does exactly one thing and cannot be composed, scheduled, resumed, cancelled, or reused.

Every Watcher (recall, price-drop, firmware, subscription-renewal) and every Advocate (file price-match, draft return, cancel sub) is a **workflow** with its own DAG. We need a runtime that runs named DAGs, logs every node, retries failures, and can resume after a worker restart.

We will mirror Elisa's orchestrator pattern (phased execution, task DAG via Kahn's algorithm, streaming-parallel pool with Promise.race up to 3 concurrent tasks) but adapted for Cloudflare Workers with Durable Objects as the execution host for long-running runs.

## Design principles

1. **Every workflow is a pure DAG spec.** Nodes declare inputs, outputs, handler. Edges define dependencies. No ad-hoc ordering inside handlers.
2. **Handlers are async pure functions.** `(input, ctx) => output`. Side effects go through `ctx.emit`, `ctx.readState`, `ctx.writeState`.
3. **Runs are persisted.** Every node transition writes to `workflow_runs.nodes_json`. If a Worker cold-starts mid-run, we can resume from the last checkpoint.
4. **Long-running runs live in Durable Objects.** Short runs (< 30s) run inline in the request Worker. > 30s runs get promoted to a DO.
5. **Workflows are registered once at boot.** Like Hono routes. Registration is code, not config.
6. **Events are typed.** Enum of event names + TS type per payload. No stringly typed bus.
7. **Cancellation is first-class.** `AbortSignal` threaded through every handler. Cancellation resolves gracefully, commits partial state.
8. **Parallelism is expressed via DAG edges.** Two nodes with the same predecessor run in parallel. The engine uses Promise.all on the frontier.
9. **Retries per-node.** Policy object on the node: `{ maxAttempts, backoffMs, retryOn: Array<errCode> }`.
10. **Timeouts per-node.** Race with a timer; abort handler on timeout.

## File inventory

| Path | Purpose |
|---|---|
| `workers/api/src/workflow/spec.ts` | `WorkflowSpec`, `NodeSpec`, `EdgeSpec`, `RetryPolicy` types |
| `workers/api/src/workflow/engine.ts` | `WorkflowEngine` class — run / resume / cancel |
| `workers/api/src/workflow/context.ts` | `WorkflowContext` — emit, readState, writeState, abort, logger, env |
| `workers/api/src/workflow/registry.ts` | `registerWorkflow`, `getWorkflow`, `listWorkflows` |
| `workers/api/src/workflow/events.ts` | event bus, typed event enum |
| `workers/api/src/workflow/runner-do.ts` | Durable Object wrapping `WorkflowEngine` for long runs |
| `workers/api/src/workflow/runs-log.ts` | read/write `workflow_runs` via F2's repo |
| `workers/api/src/workflow/specs/audit.ts` | migrate existing `runAuditPipeline` to a spec |
| `workers/api/src/workflow/specs/recall-watch.ts` | recall monitor spec (S6-W33) — placeholder here, implemented in that block |
| `workers/api/src/workflow/specs/*.ts` | one file per workflow (≥ 52 eventually) |
| `packages/shared/src/workflow.ts` | public workflow types for front-end + MCP |
| `workers/api/src/workflow/engine.test.ts` | DAG execution edge cases |
| `workers/api/src/workflow/context.test.ts` | state API |
| `workers/api/src/workflow/integration.test.ts` | end-to-end audit workflow via engine |

## Core types

```ts
// workers/api/src/workflow/spec.ts
export interface NodeSpec<In, Out> {
  id: string;
  label?: string;
  handler: (input: In, ctx: WorkflowContext) => Promise<Out>;
  inputsFrom?: Array<string>;   // node IDs whose outputs compose this node's input
  timeoutMs?: number;
  retry?: RetryPolicy;
  cacheable?: boolean;           // memoize within-run
}

export interface WorkflowSpec<RunInput = unknown, RunOutput = unknown> {
  id: string;                    // e.g. "audit.text", "recall.watch"
  version: string;
  description: string;
  inputSchema: z.ZodType<RunInput>;
  outputSchema: z.ZodType<RunOutput>;
  nodes: Array<NodeSpec<any, any>>;
  entryNodeId: string;
  finalNodeId: string;
  parallelGroups?: Array<{ groupId: string; nodeIds: string[] }>;
  onComplete?: (run: Run, output: RunOutput, ctx: WorkflowContext) => Promise<void>;
  onError?: (run: Run, err: Error, ctx: WorkflowContext) => Promise<void>;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number | ((attempt: number) => number);
  retryOn?: Array<string>;
}

export type Run = {
  id: string;
  workflowId: string;
  input: unknown;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  nodes: Record<string, NodeRunState>;
  startedAt: string;
  completedAt?: string;
  error?: { message: string; node?: string; stack?: string };
};

export type NodeRunState = {
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  startedAt?: string;
  completedAt?: string;
  output?: unknown;
  error?: { message: string; attempt: number };
  attempts: number;
  durationMs?: number;
};
```

## Engine pseudo-impl

```ts
export class WorkflowEngine {
  constructor(private env: Env, private registry: WorkflowRegistry) {}

  async run<I, O>(specId: string, input: I, opts?: { runId?: string; signal?: AbortSignal }): Promise<O> {
    const spec = this.registry.get(specId) as WorkflowSpec<I, O>;
    const runId = opts?.runId ?? ulid();
    const run: Run = {
      id: runId, workflowId: specId, input,
      status: "running",
      nodes: Object.fromEntries(spec.nodes.map((n) => [n.id, { status: "pending", attempts: 0 }])),
      startedAt: new Date().toISOString(),
    };
    await runsLog.create(this.env.LENS_D1, run);

    const ctx = new WorkflowContext({ env: this.env, runId, emitter: bus, signal: opts?.signal });
    try {
      const output = await this.execute(spec, run, input, ctx);
      run.status = "completed"; run.completedAt = new Date().toISOString();
      await runsLog.update(this.env.LENS_D1, run);
      await spec.onComplete?.(run, output, ctx);
      return output;
    } catch (err) {
      run.status = "failed"; run.error = { message: (err as Error).message };
      await runsLog.update(this.env.LENS_D1, run);
      await spec.onError?.(run, err as Error, ctx);
      throw err;
    }
  }

  private async execute(spec: WorkflowSpec, run: Run, input: unknown, ctx: WorkflowContext): Promise<unknown> {
    const depGraph = buildDepGraph(spec.nodes);
    const order = topoSort(depGraph);           // Kahn's algorithm
    const results: Record<string, unknown> = { __input: input };

    for (const batch of order.batches) {          // batches = nodes with same depth
      await Promise.all(batch.map((nodeId) => this.runNode(spec, nodeId, run, results, ctx)));
    }
    return results[spec.finalNodeId];
  }

  private async runNode(spec, nodeId, run, results, ctx) {
    const node = spec.nodes.find((n) => n.id === nodeId)!;
    const nodeState = run.nodes[nodeId];
    if (ctx.signal?.aborted) { nodeState.status = "skipped"; return; }

    const input = node.inputsFrom
      ? node.inputsFrom.length === 1 ? results[node.inputsFrom[0]]
        : Object.fromEntries(node.inputsFrom.map((id) => [id, results[id]]))
      : results.__input;

    const policy = node.retry ?? { maxAttempts: 1, backoffMs: 0 };
    let lastErr: Error | null = null;
    for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
      nodeState.attempts = attempt;
      nodeState.status = "running"; nodeState.startedAt = new Date().toISOString();
      ctx.emit("node:start", { runId: run.id, nodeId, attempt });
      try {
        const t0 = Date.now();
        const timeoutMs = node.timeoutMs ?? 60_000;
        const out = await raceWithTimeout(node.handler(input, ctx.forNode(nodeId)), timeoutMs);
        nodeState.durationMs = Date.now() - t0;
        nodeState.output = out;
        nodeState.status = "completed"; nodeState.completedAt = new Date().toISOString();
        results[nodeId] = out;
        ctx.emit("node:complete", { runId: run.id, nodeId, durationMs: nodeState.durationMs });
        await runsLog.update(ctx.env.LENS_D1, run);
        return;
      } catch (err) {
        lastErr = err as Error;
        nodeState.error = { message: lastErr.message, attempt };
        ctx.emit("node:error", { runId: run.id, nodeId, attempt, error: lastErr.message });
        if (attempt < policy.maxAttempts) {
          await sleep(typeof policy.backoffMs === "function" ? policy.backoffMs(attempt) : policy.backoffMs);
          continue;
        }
      }
    }
    nodeState.status = "failed"; nodeState.completedAt = new Date().toISOString();
    throw lastErr;
  }
}
```

## Context API

```ts
export class WorkflowContext {
  env: Env;
  runId: string;
  signal?: AbortSignal;

  emit(event: string, payload: unknown): void { bus.emit(event, payload); }
  readState<T>(key: string): Promise<T | null>;
  writeState<T>(key: string, value: T): Promise<void>;
  logger: Logger;
  forNode(nodeId: string): WorkflowContext { /* narrowed context */ }
}
```

## Event bus

Type-safe pub/sub in-process. Persists to KV for cross-worker subscribers.

```ts
export type EventMap = {
  "node:start": { runId: string; nodeId: string; attempt: number };
  "node:complete": { runId: string; nodeId: string; durationMs: number };
  "node:error": { runId: string; nodeId: string; attempt: number; error: string };
  "run:start": { runId: string; workflowId: string };
  "run:complete": { runId: string; workflowId: string; durationMs: number };
  "run:fail": { runId: string; workflowId: string; error: string };
  "audit:completed": { runId: string; auditId: string };
  "recall:detected": { userId: string; purchaseId: string; recallId: string };
  "price:dropped": { userId: string; purchaseId: string; oldPrice: number; newPrice: number };
  "pattern:detected": { userId: string; pageUrl: string; pattern: string };
};
```

## Durable Object wrapper

```ts
export class WorkflowRunnerDO {
  state: DurableObjectState;
  env: Env;
  engine?: WorkflowEngine;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state; this.env = env;
  }

  async fetch(req: Request): Promise<Response> {
    // /run/:specId with { input, runId } — long-running run
    // /cancel/:runId
    // /status/:runId
    // ... dispatch to engine
  }
}
```

Register DO class in `wrangler.toml`:
```toml
[[durable_objects.bindings]]
name = "WORKFLOW_DO"
class_name = "WorkflowRunnerDO"
```

Short runs bypass the DO and execute inline in the request Worker. Long runs (declared via `WorkflowSpec.runtime === "durable"`) are forwarded to `env.WORKFLOW_DO.idFromName(runId).fetch(...)`.

## Migration: audit pipeline → spec

`workers/api/src/workflow/specs/audit.ts`:
```ts
export const auditTextWorkflow: WorkflowSpec<AuditInputText, AuditResult> = {
  id: "audit.text",
  version: "1.0.0",
  description: "Audit an AI-generated shopping recommendation pasted as text.",
  inputSchema: AuditInputTextSchema,
  outputSchema: AuditResultSchema,
  entryNodeId: "extract",
  finalNodeId: "assemble",
  nodes: [
    {
      id: "extract",
      handler: async (input, ctx) => extractIntentAndRecommendation(input, ctx.env),
      timeoutMs: 60_000,
      retry: { maxAttempts: 2, backoffMs: 1000 },
    },
    {
      id: "search",
      inputsFrom: ["extract"],
      handler: async ({ intent }, ctx) => searchCandidates(intent, ctx.env),
      timeoutMs: 90_000,
    },
    {
      id: "crossModel",
      inputsFrom: ["extract"],
      handler: async ({ intent, aiRecommendation }, ctx) =>
        runCrossModelCheck(intent, aiRecommendation, ctx.env),
      timeoutMs: 45_000,
    },
    {
      id: "verify",
      inputsFrom: ["extract", "search"],
      handler: async ({ extract, search }, ctx) =>
        verifyClaims(extract.aiRecommendation, search, extract.intent, ctx.env),
      timeoutMs: 60_000,
    },
    {
      id: "rank",
      inputsFrom: ["extract", "search"],
      handler: async ({ extract, search }, ctx) => rankCandidates(extract.intent, search),
    },
    {
      id: "assemble",
      inputsFrom: ["extract", "search", "verify", "rank", "crossModel"],
      handler: async (inputs, ctx) => assembleAuditResult(inputs, ctx),
    },
  ],
  parallelGroups: [
    { groupId: "parallel", nodeIds: ["search", "crossModel"] },
  ],
  onComplete: async (run, output, ctx) => {
    await auditsRepo.createFromResult(ctx.env.LENS_D1, output, run);
    bus.emit("audit:completed", { runId: run.id, auditId: output.id });
  },
};
```

The existing `POST /audit` handler becomes:
```ts
app.post("/audit", async (c) => {
  const parsed = AuditInputSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_input" }, 400);
  const engine = new WorkflowEngine(c.env, registry);
  const specId = `audit.${parsed.data.kind}`;
  const result = await engine.run(specId, parsed.data);
  return c.json(result);
});
```

## Scheduled workflows (hook for F4)

`WorkflowSpec.schedule?: { cron: string; timezone?: string; input?: unknown; target: "all-users" | "eligible-users" }` — when set, registration also registers a cron. F4 provides the Cloudflare Cron dispatcher that reads registrations and routes firings to the engine.

## Tests

- **Unit**: toposort correctness, cycle detection, parallel batch grouping, retry exhaustion, timeout, abort mid-run, state persistence round-trip.
- **Integration**: run `audit.text` workflow end-to-end against fixture mode; verify every node transitions correctly; verify `workflow_runs` row exists and has the right shape.
- **Cancel**: start a run, abort after 100 ms, assert partial state saved and downstream nodes `skipped`.
- **Resume**: kill the engine mid-run (simulate cold start), start a fresh engine, call `resume(runId)`, assert completion.

## Acceptance criteria

- [ ] `audit.text`, `audit.query`, `audit.url`, `audit.photo` all migrated to workflow specs.
- [ ] Existing `POST /audit` passes all existing fixtures through the engine unchanged.
- [ ] SSE stream emits the new typed events (`run:start`, `node:start`, ..., `run:complete`).
- [ ] `workflow_runs` D1 table populated for every audit.
- [ ] Run cancellation works (tested via Playwright).
- [ ] ≥ 50 engine-level unit tests; coverage ≥ 90% for `workflow/engine.ts` + `context.ts`.
- [ ] `GAP_ANALYSIS.md` §4 root cause 3 crossed off.

## Implementation checklist

1. [ ] Draft `spec.ts` + `context.ts` + `events.ts` types.
2. [ ] Implement topological sort (`utils/dag.ts`) with cycle detection test.
3. [ ] Implement `engine.ts` without DO; all inline.
4. [ ] Implement `registry.ts` + `runs-log.ts`.
5. [ ] Port existing audit pipeline → `specs/audit.ts`.
6. [ ] Replace `/audit` handler to delegate to engine.
7. [ ] Write engine tests.
8. [ ] Write audit-spec integration test.
9. [ ] Add DO wrapper + wire for long-running specs.
10. [ ] Deploy + smoke test: audit in web UI, observe SSE events, inspect `workflow_runs` row.
11. [ ] Commit `lens(F3): runtime workflow engine`.

## Rollback

Engine is additive — keep old `runAuditPipeline` function intact behind a feature flag `LENS_ENGINE=on|off`. If live audits regress, flip flag to `off`.
