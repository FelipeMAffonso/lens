// F16 — ticker aggregator workflow. Runs hourly via the `41 * * * *` cron.

import type { WorkflowSpec } from "../spec.js";
import { registerWorkflow } from "../registry.js";
import { aggregate, K_ANON_MIN } from "../../ticker/aggregator.js";
import { getAuditRunsForAggregation, insertBuckets } from "../../ticker/repo.js";

interface AggregateInput { scheduledTime?: number }
interface AggregateOutput {
  rowsScanned: number;
  publishedCount: number;
  suppressedCount: number;
}

const spec: WorkflowSpec<AggregateInput, AggregateOutput> = {
  id: "ticker.aggregate",
  version: "1.0.0",
  description:
    "Hourly aggregator: scan last-30d completed audit runs, bucket by (category, host, geo), publish buckets that meet k-anonymity threshold.",
  finalNodeId: "publish",
  nodes: [
    {
      id: "scan",
      label: "Scan recent audit runs",
      timeoutMs: 30_000,
      handler: async (_input, ctx) => {
        const env = ctx.env as { LENS_D1?: unknown };
        const rows = await getAuditRunsForAggregation(env.LENS_D1 as never);
        ctx.log("info", "ticker.scan", { rows: rows.length });
        return rows;
      },
    },
    {
      id: "aggregate",
      inputsFrom: ["scan"],
      label: "Aggregate into k-anon buckets",
      timeoutMs: 5000,
      handler: async (rows, ctx) => {
        const typed = rows as Awaited<ReturnType<typeof getAuditRunsForAggregation>>;
        const result = aggregate(typed, K_ANON_MIN);
        ctx.log("info", "ticker.aggregate", {
          published: result.published.length,
          suppressed: result.suppressed,
        });
        return result;
      },
    },
    {
      id: "publish",
      inputsFrom: ["scan", "aggregate"],
      label: "Write ticker_events rows",
      timeoutMs: 30_000,
      handler: async (inputs, ctx) => {
        const { scan, aggregate: agg } = inputs as {
          scan: Awaited<ReturnType<typeof getAuditRunsForAggregation>>;
          aggregate: ReturnType<typeof aggregate>;
        };
        const env = ctx.env as { LENS_D1?: unknown };
        const count = await insertBuckets(env.LENS_D1 as never, agg.published);
        return {
          rowsScanned: scan.length,
          publishedCount: count,
          suppressedCount: agg.suppressed,
        };
      },
    },
  ],
};

registerWorkflow(spec);
export const tickerAggregateWorkflow = spec;
