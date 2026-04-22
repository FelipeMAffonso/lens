// F4 — Cloudflare Cron Trigger dispatcher.
// Cloudflare invokes `scheduled()` with a `ScheduledController` whose `cron`
// field contains the 5-field pattern. We match it in the registry, acquire the
// KV lock, and run the corresponding workflow.

import { WorkflowEngine } from "../workflow/engine.js";
import { getWorkflow } from "../workflow/registry.js";
import { findCronJobs, type CronJob } from "./jobs.js";
import { withLock } from "./lock.js";
import { logger } from "../obs/log.js";

export interface ScheduledCtx {
  cron: string;
  scheduledTime: number;
}

export interface DispatchEnv {
  LENS_KV?: unknown;
  LENS_D1?: unknown;
  [k: string]: unknown;
}

/**
 * Handle one cron firing. Idempotent via KV lock with 14-min TTL (shorter than
 * the shortest cron interval of 15m, so the next tick can acquire if this one
 * stalled).
 */
export async function dispatchCron(ctrl: ScheduledCtx, env: DispatchEnv): Promise<void> {
  const jobs = findCronJobs(ctrl.cron);
  if (jobs.length === 0) {
    logger.warn("cron.unmatched", { pattern: ctrl.cron });
    return;
  }
  for (const job of jobs) {
    await runJob(job, env, ctrl);
  }
}

async function runJob(job: CronJob, env: DispatchEnv, ctrl: ScheduledCtx): Promise<void> {
  const spec = getWorkflow(job.workflowId);
  if (!spec) {
    logger.warn("cron.workflow-missing", {
      pattern: ctrl.cron,
      workflowId: job.workflowId,
    });
    return;
  }
  const lockKey = `${job.workflowId}:${Math.floor(ctrl.scheduledTime / 60_000)}`;
  const outcome = await withLock(env as { LENS_KV?: never }, lockKey, 14 * 60, async () => {
    const engine = new WorkflowEngine(env as never);
    const input = job.input ? job.input() : { scheduledTime: ctrl.scheduledTime };
    return await engine.run(spec, input);
  });
  if (outcome.ran === false) {
    logger.info("cron.locked", { workflowId: job.workflowId, pattern: ctrl.cron });
  } else {
    logger.info("cron.done", { workflowId: job.workflowId, pattern: ctrl.cron });
  }
}
