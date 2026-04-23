// VISION #22 — weekly digest workflow. Hourly cron fires; handler checks
// whether any user's (send_day, send_hour_utc) matches NOW and
// last_sent_at was >6d ago. Selective per run.

import { registerWorkflow } from "../registry.js";
import type { WorkflowSpec } from "../spec.js";
import { runDigestCron } from "../../digest/handler.js";

interface In { scheduledTime?: number }
interface Out { scanned: number; sent: number; errors: number }

const spec: WorkflowSpec<In, Out> = {
  id: "digest.send",
  version: "1.0.0",
  description: "Hourly: select users whose digest cadence matches now, send the weekly digest via Resend.",
  finalNodeId: "run",
  nodes: [
    {
      id: "run",
      label: "Send digests for users whose (day,hour) matches now",
      timeoutMs: 270_000,
      handler: async (_i, ctx) => {
        const env = ctx.env as never;
        const r = await runDigestCron(env);
        ctx.log("info", "digest.send.done", r as unknown as Record<string, unknown>);
        return r;
      },
    },
  ],
};

registerWorkflow(spec);
export const digestSendWorkflow = spec;