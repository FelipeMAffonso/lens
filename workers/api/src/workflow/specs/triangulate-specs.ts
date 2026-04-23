// IMPROVEMENT_PLAN_V2 A12b — spec triangulation workflow, hourly cron.

import { registerWorkflow } from "../registry.js";
import type { WorkflowSpec } from "../spec.js";
import { runSpecTriangulation } from "../../triangulate/specs.js";

interface Input { scheduledTime?: number }
interface Output {
  skusProcessed: number;
  specsWritten: number;
  discrepanciesLogged: number;
}

const spec: WorkflowSpec<Input, Output> = {
  id: "triangulate.specs",
  version: "1.0.0",
  description:
    "Hourly: consensus across sku_source_link.specs_json → sku_spec, log disagreements >15% numeric delta to discrepancy_log.",
  finalNodeId: "run",
  nodes: [
    {
      id: "run",
      label: "Recompute triangulated specs",
      timeoutMs: 270_000,
      handler: async (_input, ctx) => {
        const env = ctx.env as never;
        const result = await runSpecTriangulation(env);
        ctx.log("info", "triangulate.specs.done", result as unknown as Record<string, unknown>);
        return result;
      },
    },
  ],
};

registerWorkflow(spec);
export const triangulateSpecsWorkflow = spec;
