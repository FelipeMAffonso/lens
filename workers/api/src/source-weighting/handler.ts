// S2-W13 — HTTP glue for /source-weighting.

import type { Context } from "hono";
import { findPreference, upsertPreference } from "../db/repos/preferences.js";
import { normalizeWeighting } from "./normalize.js";
import {
  DEFAULT_WEIGHTING,
  GLOBAL_CATEGORY,
  PutRequestSchema,
  type GetResponse,
  type PutResponse,
  type SourceWeighting,
} from "./types.js";

interface EnvBindings {
  LENS_D1?: unknown;
}

function principal(c: { get: (key: string) => unknown }): {
  userId: string | null;
  anonUserId: string | null;
} {
  return {
    userId: (c.get("userId") as string | undefined) ?? null,
    anonUserId: (c.get("anonUserId") as string | undefined) ?? null,
  };
}

export async function handleGet(
  c: Context<{ Bindings: EnvBindings; Variables: { userId?: string; anonUserId?: string } }>,
): Promise<Response> {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const { userId, anonUserId } = principal(c);
  const response: GetResponse = {
    category: null,
    source: "default",
    weighting: DEFAULT_WEIGHTING,
  };
  if (!userId && !anonUserId) return c.json(response);

  const category = c.req.query("category");
  if (category) {
    const row = await findPreference(d1 as never, {
      ...(userId ? { userId } : {}),
      ...(anonUserId ? { anonUserId } : {}),
      category,
    });
    const parsed = parseWeightingFromRow(row?.source_weighting_json);
    if (parsed) {
      return c.json<GetResponse>({ category, source: "category", weighting: parsed });
    }
  }
  // Fallback to _global
  const globalRow = await findPreference(d1 as never, {
    ...(userId ? { userId } : {}),
    ...(anonUserId ? { anonUserId } : {}),
    category: GLOBAL_CATEGORY,
  });
  const globalWeighting = parseWeightingFromRow(globalRow?.source_weighting_json);
  if (globalWeighting) {
    return c.json<GetResponse>({ category: category ?? null, source: "global", weighting: globalWeighting });
  }
  return c.json<GetResponse>({ category: category ?? null, source: "default", weighting: DEFAULT_WEIGHTING });
}

export async function handlePut(
  c: Context<{ Bindings: EnvBindings; Variables: { userId?: string; anonUserId?: string } }>,
): Promise<Response> {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const { userId, anonUserId } = principal(c);
  if (!userId && !anonUserId) return c.json({ error: "unauthenticated" }, 401);

  const body = await c.req.json().catch(() => null);
  const parsed = PutRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  const category = parsed.data.category ?? GLOBAL_CATEGORY;
  const { weighting, normalized } = normalizeWeighting({
    vendor: parsed.data.vendor,
    independent: parsed.data.independent,
  });

  // Preserve any existing criteria on the row so we don't wipe a user's
  // category preference profile just because they edited their slider.
  const existing = await findPreference(d1 as never, {
    ...(userId ? { userId } : {}),
    ...(anonUserId ? { anonUserId } : {}),
    category,
  });
  const criteria = existing?.criteria_json ? JSON.parse(existing.criteria_json) : [];
  await upsertPreference(d1 as never, {
    userId: userId ?? null,
    anonUserId: anonUserId ?? null,
    category,
    criteria,
    sourceWeighting: weighting,
  });
  const response: PutResponse = {
    ok: true,
    category,
    weighting,
    normalized,
  };
  return c.json(response);
}

function parseWeightingFromRow(json: string | null | undefined): SourceWeighting | null {
  if (!json) return null;
  try {
    const obj = JSON.parse(json) as Partial<SourceWeighting>;
    if (typeof obj.vendor === "number" && typeof obj.independent === "number") {
      return { vendor: obj.vendor, independent: obj.independent };
    }
  } catch {
    // fall through
  }
  return null;
}
