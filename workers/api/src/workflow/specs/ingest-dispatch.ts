// IMPROVEMENT_PLAN_V2 Phase A2 — ingest-dispatch workflow.
//
// Fires on the `*/15 * * * *` cron (shared with email.poll). Reads the
// `data_source` registry, picks ingesters whose `last_run_at + cadence` is
// in the past, runs up to two in parallel. Each run is bounded internally
// by `framework.runIngester`. Safe to invoke from manual admin endpoints.

import { dispatchDueIngesters } from "../../ingest/dispatcher.js";
import { registerWorkflow } from "../registry.js";
import type { WorkflowSpec } from "../spec.js";

interface IngestDispatchInput {
  scheduledTime?: number;
}

interface IngestDispatchOutput {
  attempted: string[];
  results: Array<{ sourceId: string; status: string; rowsUpserted: number; durationMs: number }>;
}

const spec: WorkflowSpec<IngestDispatchInput, IngestDispatchOutput> = {
  id: "ingest.dispatch",
  version: "1.0.0",
  description:
    "Every 15 min: pick due data-source ingesters (CPSC recalls, FCC, EPA Energy Star, etc.) and run up to 2 in parallel. Populates sku_catalog + recall + related tables from public data feeds.",
  finalNodeId: "dispatch",
  nodes: [
    {
      id: "dispatch",
      label: "Pick due ingesters and run them",
      timeoutMs: 270_000, // slightly under 5-min worker cron budget
      handler: async (_input, ctx) => {
        const env = ctx.env as never;
        const result = await dispatchDueIngesters(env);
        ctx.log("info", "ingest.dispatch.done", {
          attempted: result.attempted,
          results: result.results,
        });
        return result;
      },
    },
  ],
};

registerWorkflow(spec);
export const ingestDispatchWorkflow = spec;