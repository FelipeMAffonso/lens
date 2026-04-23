// IMPROVEMENT_PLAN_V2 A12 — triangulation workflow, fires on the hourly cron.

import { registerWorkflow } from "../registry.js";
import type { WorkflowSpec } from "../spec.js";
import { runPriceTriangulation } from "../../triangulate/price.js";

interface Input { scheduledTime?: number }
interface Output {
  skusProcessed: number;
  pricesWritten: number;
  discrepanciesLogged: number;
}

const spec: WorkflowSpec<Input, Output> = {
  id: "triangulate.price",
  version: "1.0.0",
  description: "Hourly: recompute triangulated_price from sku_source_link. Log discrepancies ≥15%.",
  finalNodeId: "run",
  nodes: [
    {
      id: "run",
      label: "Recompute triangulated prices",
      timeoutMs: 270_000,
      handler: async (_input, ctx) => {
        const env = ctx.env as never;
        const result = await runPriceTriangulation(env);
        ctx.log("info", "triangulate.price.done", result as unknown as Record<string, unknown>);
        return result;
      },
    },
  ],
};

registerWorkflow(spec);
export const triangulatePriceWorkflow = spec;