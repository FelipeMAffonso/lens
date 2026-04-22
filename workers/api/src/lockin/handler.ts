// S7-W40 — POST /lockin/compute handler.

import type { Context } from "hono";
import type { Env } from "../index.js";
import { LockinRequestSchema, type LockinResponse } from "./types.js";
import { computeLockin } from "./compute.js";
import { scrubTrackingParams } from "../url-scrub.js";

function scrubCitations(resp: LockinResponse): LockinResponse {
  const cleanedEcosystems = resp.ecosystems.map((e) => ({
    ...e,
    citations: e.citations
      .map((c) => {
        const cleaned = scrubTrackingParams(c.url);
        if (!cleaned) return null;
        return { ...c, url: cleaned };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null),
  }));
  return { ...resp, ecosystems: cleanedEcosystems };
}

export async function handleLockinCompute(
  c: Context<{ Bindings: Env }>,
): Promise<Response> {
  const body = await c.req.json().catch(() => null);
  const parsed = LockinRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  const resp = computeLockin(parsed.data.purchases);
  return c.json(scrubCitations(resp));
}
