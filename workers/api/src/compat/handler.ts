// S4-W23 — HTTP glue for /compat/check.

import type { Context } from "hono";
import { checkCompat } from "./check.js";
import { ruleCount } from "./rules.js";
import { CompatRequestSchema } from "./types.js";

export async function handleCompatCheck(
  c: Context<{ Bindings: Record<string, unknown> }>,
): Promise<Response> {
  const body = await c.req.json().catch(() => null);
  const parsed = CompatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  const result = checkCompat(parsed.data);
  return c.json(result);
}

export function handleCompatInfo(c: Context): Response {
  return c.json({
    rules: ruleCount(),
    note: "POST /compat/check with {target, equipment} to run the compatibility rule library.",
    generatedAt: new Date().toISOString(),
  });
}
