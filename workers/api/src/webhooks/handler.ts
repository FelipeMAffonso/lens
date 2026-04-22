// F5 — webhook dispatch handler.

import type { Context } from "hono";
import { claimIdempotencyKey, recordIdempotencyResult } from "./idempotency.js";
import { findWebhook } from "./registry.js";
import { WorkflowEngine } from "../workflow/engine.js";
import { getWorkflow } from "../workflow/registry.js";
import { logger } from "../obs/log.js";

export async function handleWebhook(c: Context): Promise<Response> {
  const id = c.req.param("id") as string;
  const key = c.req.header("x-idempotency-key") ?? crypto.randomUUID();
  const payload = await c.req.json().catch(() => ({}));

  const hook = findWebhook(id);
  if (!hook) return c.json({ error: "unknown_webhook", id }, 404);

  // Idempotency check.
  const claim = await claimIdempotencyKey(c.env as never, id, key);
  if (!claim.fresh) {
    logger.info("webhook.idempotent", { webhookId: id, key });
    try {
      return c.json(JSON.parse(claim.cached));
    } catch {
      return c.json({ ok: true, replayed: true });
    }
  }

  let result: unknown;
  try {
    if (hook.workflowId) {
      const spec = getWorkflow(hook.workflowId);
      if (!spec) return c.json({ error: "workflow_missing", workflowId: hook.workflowId }, 500);
      const engine = new WorkflowEngine(c.env as never);
      result = await engine.run(spec, payload);
    } else if (hook.direct) {
      result = await hook.direct(payload);
    } else {
      return c.json({ error: "misconfigured_webhook" }, 500);
    }
    const body = JSON.stringify({ ok: true, result });
    await recordIdempotencyResult(c.env as never, id, key, body);
    return new Response(body, { headers: { "content-type": "application/json" } });
  } catch (err) {
    const e = err as Error;
    logger.error("webhook.failed", { webhookId: id, err: { message: e.message, name: e.name } });
    return c.json({ ok: false, error: e.message }, 500);
  }
}
