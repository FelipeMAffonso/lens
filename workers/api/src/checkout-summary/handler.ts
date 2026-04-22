// S4-W28 — HTTP glue for /checkout/summary.

import type { Context } from "hono";
import { composeSummary } from "./compose.js";
import { CheckoutSummaryRequestSchema } from "./types.js";

export async function handleCheckoutSummary(
  c: Context<{ Bindings: Record<string, unknown> }>,
): Promise<Response> {
  const body = await c.req.json().catch(() => null);
  const parsed = CheckoutSummaryRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  return c.json(composeSummary(parsed.data));
}
