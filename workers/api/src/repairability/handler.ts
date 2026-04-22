// S7-W41 — POST /repairability/lookup.

import type { Context } from "hono";
import type { Env } from "../index.js";
import { matchFixture, toResponse } from "./score.js";
import { RepairabilityRequestSchema, type RepairabilityResponse } from "./types.js";
import { fetchIFixitRepairability } from "./ifixit.js";
import { scrubTrackingParams } from "../url-scrub.js";

function scrubCitations(resp: RepairabilityResponse): RepairabilityResponse {
  // Defense in depth: all citation URLs pass through the tracking-param
  // scrubber before leaving the worker. Any citation whose URL cannot be
  // parsed is dropped (judge P3 parity with other endpoints).
  const cleanCitations = resp.citations
    .map((c) => {
      const cleaned = scrubTrackingParams(c.url);
      if (!cleaned) return null;
      return { ...c, url: cleaned };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);
  return { ...resp, citations: cleanCitations };
}

export async function handleRepairabilityLookup(
  c: Context<{ Bindings: Env }>,
): Promise<Response> {
  const body = await c.req.json().catch(() => null);
  const parsed = RepairabilityRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  const req = parsed.data;
  const generatedAt = new Date().toISOString();

  // Pass 1: fixture match.
  const fx = matchFixture(req);
  if (fx) {
    return c.json(scrubCitations(toResponse(req, fx, generatedAt)));
  }

  // Pass 2: optional live iFixit lookup. Returns null when IFIXIT_API_KEY
  // is absent or the lookup fails.
  const live = await fetchIFixitRepairability(req, c.env);
  if (live) {
    return c.json(scrubCitations(live));
  }

  // No match anywhere.
  return c.json(scrubCitations(toResponse(req, null, generatedAt)));
}
