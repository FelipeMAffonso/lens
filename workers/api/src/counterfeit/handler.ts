// S3-W18 — POST /counterfeit/check HTTP glue.

import type { Context } from "hono";
import { assessCounterfeit } from "./assess.js";
import { CounterfeitRequestSchema } from "./types.js";

export async function handleCounterfeitCheck(
  c: Context<{ Bindings: Record<string, unknown> }>,
): Promise<Response> {
  const body = await c.req.json().catch(() => null);
  const parsed = CounterfeitRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  return c.json(assessCounterfeit(parsed.data));
}
