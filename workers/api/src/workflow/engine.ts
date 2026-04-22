// F3 — workflow engine. Executes a WorkflowSpec against an input.
//
// Core guarantees:
//  - Topological order via Kahn's algorithm (parallel batches).
//  - Per-node retry with configurable policy + exponential or custom backoff.
//  - Per-node timeout via Promise.race; handler aborts when context.signal fires.
//  - Persisted to workflow_runs (D1) on every transition; skipped if D1 absent.
//  - Typed events on the in-process bus (see events.ts).
//  - Cancellation: AbortController in the engine; downstream handlers observe ctx.signal.

import { ulid } from "./ulid.js";
import type { Run, WorkflowSpec, NodeRunState, NodeSpec } from "./spec.js";
import { WorkflowContext } from "./context.js";
import { bus } from "./events.js";
import { buildDepGraph, topoBatches } from "./dag.js";
import { createRunLog, updateRunLog } from "./runs-log.js";

export interface RunOptions {
  runId?: string;
  userId?: string | null;
  anonUserId?: string | null;
  signal?: AbortSignal;
  emitHook?: (name: string, payload: unknown) => void;
}

export interface EngineEnv {
  LENS_D1?: unknown;
}

export class WorkflowEngine<Env extends EngineEnv = EngineEnv> {
  constructor(private env: Env) {}

  // Tell TS that Env is a subtype of `Record<string, unknown>` for the
  // WorkflowContext generic parameter. Safe because Env is an object with a
  // known shape; the context uses env only as an opaque bag.
  private asCtx(c: WorkflowContext<Env>): WorkflowContext<Record<string, unknown>> {
    return c as unknown as WorkflowContext<Record<string, unknown>>;
  }

  async run<I, O>(spec: WorkflowSpec<I, O>, input: I, opts: RunOptions = {}): Promise<O> {
    const t0 = Date.now();
    const runId = opts.runId ?? ulid();
    const runCtrl = new AbortController();
    const signal = mergeSignals(opts.signal, runCtrl.signal);

    const run: Run = {
      id: runId,
      workflowId: spec.id,
      workflowVersion: spec.version,
      userId: opts.userId ?? null,
      anonUserId: opts.anonUserId ?? null,
      status: "running",
      input,
      nodes: Object.fromEntries(
        spec.nodes.map((n) => [n.id, { status: "pending", attempts: 0 } as NodeRunState]),
      ),
      startedAt: new Date().toISOString(),
    };

    const ctx = new WorkflowContext<Env>({
      env: this.env,
      runId,
      signal,
      ...(opts.emitHook ? { emitHook: opts.emitHook } : {}),
    });

    bus.emit("run:start", { runId, workflowId: spec.id });
    opts.emitHook?.("run:start", { runId, workflowId: spec.id });
    await createRunLog(this.env.LENS_D1 as never, run);

    try {
      const output = (await this.execute(spec, run, input, ctx)) as O;
      run.status = "completed";
      run.output = output;
      run.completedAt = new Date().toISOString();
      await updateRunLog(this.env.LENS_D1 as never, run);
      bus.emit("run:complete", { runId, workflowId: spec.id, durationMs: Date.now() - t0 });
      opts.emitHook?.("run:complete", { runId, workflowId: spec.id, durationMs: Date.now() - t0 });
      if (spec.onComplete) await spec.onComplete(run, output, this.asCtx(ctx));
      return output;
    } catch (err) {
      const e = err as Error;
      run.status = "failed";
      run.error = { message: e.message, ...(e.stack ? { stack: e.stack } : {}) };
      run.completedAt = new Date().toISOString();
      await updateRunLog(this.env.LENS_D1 as never, run);
      bus.emit("run:fail", { runId, workflowId: spec.id, error: e.message });
      opts.emitHook?.("run:fail", { runId, workflowId: spec.id, error: e.message });
      if (spec.onError) await spec.onError(run, e, this.asCtx(ctx));
      throw err;
    }
  }

  private async execute<I, O>(
    spec: WorkflowSpec<I, O>,
    run: Run,
    input: I,
    ctx: WorkflowContext<Env>,
  ): Promise<unknown> {
    const g = buildDepGraph(spec.nodes);
    const batches = topoBatches(g);
    const outputs: Record<string, unknown> = {};
    const INPUT_SENTINEL = "__input__";
    outputs[INPUT_SENTINEL] = input;

    const specAny = spec as unknown as WorkflowSpec<unknown, unknown>;
    for (const batch of batches) {
      await Promise.all(
        batch.map((nodeId) => this.runNode(specAny, g.nodeById.get(nodeId)!, run, outputs, ctx)),
      );
    }

    return outputs[spec.finalNodeId];
  }

  private async runNode(
    spec: WorkflowSpec,
    node: NodeSpec,
    run: Run,
    outputs: Record<string, unknown>,
    ctx: WorkflowContext<Env>,
  ): Promise<void> {
    const state = run.nodes[node.id]!;
    if (ctx.signal?.aborted) {
      state.status = "skipped";
      return;
    }

    // Resolve this node's input.
    let resolvedInput: unknown;
    const froms = node.inputsFrom ?? [];
    if (froms.length === 0) {
      resolvedInput = outputs["__input__"];
    } else if (froms.length === 1) {
      resolvedInput = outputs[froms[0]!];
    } else {
      resolvedInput = Object.fromEntries(froms.map((id) => [id, outputs[id]]));
    }

    const policy = node.retry ?? { maxAttempts: 1, backoffMs: 0 };
    let lastErr: Error | undefined;
    for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
      state.attempts = attempt;
      state.status = "running";
      state.startedAt = new Date().toISOString();
      bus.emit("node:start", { runId: run.id, nodeId: node.id, attempt });
      const nodeCtx = ctx.forNode(node.id);
      const t0 = Date.now();
      try {
        const timeoutMs = node.timeoutMs ?? 60_000;
        const output = await raceWithTimeout(
          node.handler(resolvedInput, this.asCtx(nodeCtx)),
          timeoutMs,
          ctx.signal,
        );
        state.durationMs = Date.now() - t0;
        state.output = output;
        state.completedAt = new Date().toISOString();
        state.status = "completed";
        outputs[node.id] = output;
        bus.emit("node:complete", { runId: run.id, nodeId: node.id, durationMs: state.durationMs });
        await updateRunLog(this.env.LENS_D1 as never, run);
        return;
      } catch (err) {
        lastErr = err as Error;
        state.error = {
          message: lastErr.message,
          attempt,
          ...(lastErr.stack ? { stack: lastErr.stack } : {}),
        };
        bus.emit("node:error", {
          runId: run.id,
          nodeId: node.id,
          attempt,
          error: lastErr.message,
        });
        if (attempt < policy.maxAttempts) {
          const delay =
            typeof policy.backoffMs === "function"
              ? policy.backoffMs(attempt)
              : policy.backoffMs;
          bus.emit("node:retry", {
            runId: run.id,
            nodeId: node.id,
            nextAttempt: attempt + 1,
            delayMs: delay,
          });
          await sleep(delay);
          continue;
        }
      }
    }
    state.status = "failed";
    state.completedAt = new Date().toISOString();
    await updateRunLog(this.env.LENS_D1 as never, run);
    throw lastErr ?? new Error("unknown node failure");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function raceWithTimeout<T>(
  p: Promise<T>,
  ms: number,
  signal?: AbortSignal | undefined,
): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error(`node timeout after ${ms}ms`));
    }, ms);
    const onAbort = (): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(new Error("run cancelled"));
    };
    if (signal) {
      if (signal.aborted) {
        done = true;
        clearTimeout(timer);
        reject(new Error("run cancelled"));
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }
    p.then(
      (v) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}

function mergeSignals(a?: AbortSignal | undefined, b?: AbortSignal | undefined): AbortSignal {
  if (!a) return b ?? new AbortController().signal;
  if (!b) return a;
  const ctrl = new AbortController();
  const onAbort = (): void => ctrl.abort();
  if (a.aborted || b.aborted) ctrl.abort();
  a.addEventListener("abort", onAbort, { once: true });
  b.addEventListener("abort", onAbort, { once: true });
  return ctrl.signal;
}
