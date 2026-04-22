// F4 — recall-watch STUB workflow spec. Registers the workflow ID so the cron
// dispatcher can route firings to it. Full implementation of CPSC/NHTSA/FDA
// feed parsing + cross-reference with purchases lands in block S6-W33.

import type { WorkflowSpec } from "../spec.js";
import { registerWorkflow } from "../registry.js";

const spec: WorkflowSpec<{ scheduledTime: number }, { ok: true; note: string }> = {
  id: "recall.watch",
  version: "0.1.0-stub",
  description:
    "Stub: poll CPSC/NHTSA/FDA recall feeds + cross-reference with user purchase history. Real implementation in S6-W33.",
  finalNodeId: "noop",
  nodes: [
    {
      id: "noop",
      label: "Recall-watch stub",
      timeoutMs: 5000,
      handler: async (input, ctx) => {
        ctx.log("info", "recall.watch:fired", input as Record<string, unknown>);
        return {
          ok: true as const,
          note: "stub — real CPSC/NHTSA/FDA fetch lands in S6-W33",
        };
      },
    },
  ],
};

registerWorkflow(spec);

export const recallWatchWorkflow = spec;
