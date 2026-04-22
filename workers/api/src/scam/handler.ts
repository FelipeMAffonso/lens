// S4-W27 — POST /scam/assess HTTP glue.

import type { Context } from "hono";
import { assessScam } from "./assess.js";
import { ScamAssessRequestSchema } from "./types.js";

export async function handleScamAssess(
  c: Context<{ Bindings: Record<string, unknown> }>,
): Promise<Response> {
  const body = await c.req.json().catch(() => null);
  const parsed = ScamAssessRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  return c.json(assessScam(parsed.data));
}
