// VISION #20 — Gmail receipt poller workflow.
import { registerWorkflow } from "../registry.js";
import type { WorkflowSpec } from "../spec.js";
import { runGmailPoll } from "../../gmail/poller.js";

interface In { scheduledTime?: number }
interface Out { usersScanned: number; messagesSeen: number; receiptsPersisted: number; errors: string[] }

const spec: WorkflowSpec<In, Out> = {
  id: "gmail.poll",
  version: "1.0.0",
  description: "Every 2h: scan each authorized Gmail inbox for retailer receipts, persist to purchases. Read-only scope.",
  finalNodeId: "run",
  nodes: [
    {
      id: "run",
      label: "Poll Gmail for new receipts across authorized users",
      timeoutMs: 270_000,
      handler: async (_i, ctx) => {
        const env = ctx.env as never;
        const r = await runGmailPoll(env);
        ctx.log("info", "gmail.poll.done", r as unknown as Record<string, unknown>);
        return r;
      },
    },
  ],
};

registerWorkflow(spec);
export const gmailPollWorkflow = spec;