import { describe, expect, it } from "vitest";
import { dispatchCron } from "./dispatcher.js";
import { CRON_JOBS, findCronJobs } from "./jobs.js";
import { registerWorkflow } from "../workflow/registry.js";
import type { WorkflowSpec } from "../workflow/spec.js";

describe("cron jobs registry", () => {
  it("has at least one job per canonical cadence", () => {
    expect(CRON_JOBS.length).toBeGreaterThanOrEqual(5);
    // every-15m + hourly + daily + weekly patterns represented
    const patterns = CRON_JOBS.map((j) => j.pattern);
    expect(patterns.some((p) => /\*\/15/.test(p))).toBe(true);
    expect(patterns.some((p) => /^\d+ \* \* \* \*$/.test(p))).toBe(true);
    expect(patterns.some((p) => /^\d+ \d+ \* \* \*$/.test(p))).toBe(true);
    expect(patterns.some((p) => /^\d+ \d+ \* \* 1$/.test(p))).toBe(true);
  });

  it("findCronJobs returns matching jobs", () => {
    const jobs = findCronJobs("*/15 * * * *");
    expect(jobs.length).toBeGreaterThanOrEqual(1);
    expect(jobs.every((j) => j.pattern === "*/15 * * * *")).toBe(true);
  });

  it("findCronJobs returns [] for unregistered pattern", () => {
    expect(findCronJobs("* * * * *")).toEqual([]);
  });
});

describe("dispatchCron", () => {
  it("no-ops when pattern unknown", async () => {
    await dispatchCron({ cron: "0 0 29 2 *", scheduledTime: Date.now() }, {});
    // no throw = pass
    expect(true).toBe(true);
  });

  it("runs a registered workflow when pattern matches", async () => {
    let ran = 0;
    const spec: WorkflowSpec<unknown, number> = {
      id: "_test_cron_workflow",
      version: "1.0.0",
      description: "",
      finalNodeId: "n",
      nodes: [{ id: "n", handler: async () => { ran++; return 1; } }],
    };
    registerWorkflow(spec);
    // Insert a test pattern by monkey-patching CRON_JOBS:
    CRON_JOBS.push({
      pattern: "* * * * 7",
      workflowId: "_test_cron_workflow",
      description: "test",
    });
    await dispatchCron({ cron: "* * * * 7", scheduledTime: 60_000 }, {});
    expect(ran).toBe(1);
  });
});
