import { describe, expect, it, vi } from "vitest";
import { WorkflowEngine } from "./engine.js";
import type { WorkflowSpec } from "./spec.js";
import { bus } from "./events.js";

describe("WorkflowEngine", () => {
  it("runs a trivial single-node workflow", async () => {
    const spec: WorkflowSpec<number, number> = {
      id: "trivial",
      version: "1.0.0",
      description: "",
      finalNodeId: "double",
      nodes: [
        {
          id: "double",
          handler: async (n) => (n as number) * 2,
        },
      ],
    };
    const engine = new WorkflowEngine({});
    const out = await engine.run(spec, 5);
    expect(out).toBe(10);
  });

  it("runs diamond DAG with parallel mid-layer", async () => {
    const started: string[] = [];
    const spec: WorkflowSpec<{ x: number }, number> = {
      id: "diamond",
      version: "1.0.0",
      description: "",
      finalNodeId: "sum",
      nodes: [
        {
          id: "source",
          handler: async (i) => (i as { x: number }).x,
        },
        {
          id: "a",
          inputsFrom: ["source"],
          handler: async (n) => {
            started.push("a");
            return (n as number) + 1;
          },
        },
        {
          id: "b",
          inputsFrom: ["source"],
          handler: async (n) => {
            started.push("b");
            return (n as number) * 10;
          },
        },
        {
          id: "sum",
          inputsFrom: ["a", "b"],
          handler: async (i) => {
            const { a, b } = i as { a: number; b: number };
            return a + b;
          },
        },
      ],
    };
    const engine = new WorkflowEngine({});
    const out = await engine.run(spec, { x: 5 });
    expect(out).toBe((5 + 1) + (5 * 10));
    expect(new Set(started)).toEqual(new Set(["a", "b"]));
  });

  it("retries a failing node per policy", async () => {
    let attempts = 0;
    const spec: WorkflowSpec<void, string> = {
      id: "retry",
      version: "1.0.0",
      description: "",
      finalNodeId: "flaky",
      nodes: [
        {
          id: "flaky",
          retry: { maxAttempts: 3, backoffMs: 0 },
          handler: async () => {
            attempts++;
            if (attempts < 3) throw new Error("boom");
            return "ok";
          },
        },
      ],
    };
    const engine = new WorkflowEngine({});
    const out = await engine.run(spec, undefined);
    expect(out).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("propagates failure after exhausting retries", async () => {
    const spec: WorkflowSpec<void, string> = {
      id: "retry-fail",
      version: "1.0.0",
      description: "",
      finalNodeId: "flaky",
      nodes: [
        {
          id: "flaky",
          retry: { maxAttempts: 2, backoffMs: 0 },
          handler: async () => {
            throw new Error("always-broken");
          },
        },
      ],
    };
    const engine = new WorkflowEngine({});
    await expect(engine.run(spec, undefined)).rejects.toThrow(/always-broken/);
  });

  it("honors timeoutMs", async () => {
    const spec: WorkflowSpec<void, string> = {
      id: "timeout",
      version: "1.0.0",
      description: "",
      finalNodeId: "slow",
      nodes: [
        {
          id: "slow",
          timeoutMs: 50,
          handler: async () => {
            await new Promise((r) => setTimeout(r, 500));
            return "done";
          },
        },
      ],
    };
    const engine = new WorkflowEngine({});
    await expect(engine.run(spec, undefined)).rejects.toThrow(/timeout/);
  });

  it("emits run:start + run:complete events", async () => {
    const starts: string[] = [];
    const completes: string[] = [];
    const offStart = bus.on("run:start", (p) => starts.push(p.workflowId));
    const offComplete = bus.on("run:complete", (p) => completes.push(p.workflowId));
    const spec: WorkflowSpec<void, number> = {
      id: "events-test",
      version: "1.0.0",
      description: "",
      finalNodeId: "n",
      nodes: [{ id: "n", handler: async () => 42 }],
    };
    const engine = new WorkflowEngine({});
    await engine.run(spec, undefined);
    expect(starts).toContain("events-test");
    expect(completes).toContain("events-test");
    offStart();
    offComplete();
  });

  it("invokes onComplete hook with the output", async () => {
    const onComplete = vi.fn(async () => {});
    const spec: WorkflowSpec<void, number> = {
      id: "hooks",
      version: "1.0.0",
      description: "",
      finalNodeId: "n",
      nodes: [{ id: "n", handler: async () => 7 }],
      onComplete,
    };
    const engine = new WorkflowEngine({});
    await engine.run(spec, undefined);
    expect(onComplete).toHaveBeenCalledOnce();
    const args = onComplete.mock.calls[0]!;
    // args = [run, output, ctx]
    expect(args[1]).toBe(7);
  });

  it("cancellation via AbortSignal aborts run", async () => {
    const spec: WorkflowSpec<void, string> = {
      id: "cancel",
      version: "1.0.0",
      description: "",
      finalNodeId: "slow",
      nodes: [
        {
          id: "slow",
          timeoutMs: 10_000,
          handler: async () => {
            await new Promise((r) => setTimeout(r, 500));
            return "done";
          },
        },
      ],
    };
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 20);
    const engine = new WorkflowEngine({});
    await expect(engine.run(spec, undefined, { signal: ctrl.signal })).rejects.toThrow(
      /cancelled/,
    );
  });
});
