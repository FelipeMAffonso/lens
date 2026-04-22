// CJ-W46 — HTTP glue for the values-overlay surface.

import type { Context } from "hono";
import { RerankRequestSchema, ValuesOverlaySchema } from "@lens/shared";
import { applyOverlay } from "./rerank.js";
import {
  findPreference,
  upsertPreference,
} from "../db/repos/preferences.js";

interface EnvBindings {
  LENS_D1?: unknown;
}

/**
 * POST /values-overlay/rerank — stateless. {candidates, overlay} → ranked output.
 */
export async function handleRerank(
  c: Context<{ Bindings: EnvBindings; Variables: { userId?: string; anonUserId?: string } }>,
): Promise<Response> {
  const body = await c.req.json().catch(() => null);
  const parsed = RerankRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  return c.json(applyOverlay(parsed.data.candidates, parsed.data.overlay));
}

interface PersistedOverlayPayload {
  category: string;
  overlay: unknown;
}

/**
 * PUT /values-overlay — persists the overlay into the user's preferences row
 * via the F2 `upsertPreference` repo. Stored as an override on the existing
 * criteria profile for {user|anon, category}.
 */
export async function handlePut(
  c: Context<{ Bindings: EnvBindings; Variables: { userId?: string; anonUserId?: string } }>,
): Promise<Response> {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const userId = c.get("userId") ?? null;
  const anonUserId = c.get("anonUserId") ?? null;
  if (!userId && !anonUserId) return c.json({ error: "unauthenticated" }, 401);

  const body = (await c.req.json().catch(() => null)) as PersistedOverlayPayload | null;
  if (!body || typeof body.category !== "string") {
    return c.json({ error: "invalid_input", expected: "category + overlay" }, 400);
  }
  const parsed = ValuesOverlaySchema.safeParse(body.overlay);
  if (!parsed.success) {
    return c.json({ error: "invalid_overlay", issues: parsed.error.issues }, 400);
  }

  const existing = await findPreference(d1 as never, {
    ...(userId ? { userId } : {}),
    ...(anonUserId ? { anonUserId } : {}),
    category: body.category,
  });
  // Reuse the stored criteria — overlay is additive to the existing pref row,
  // not a replacement. If there's no existing row yet, start with an empty
  // criteria array so the row can exist.
  const criteria = existing?.criteria_json ? JSON.parse(existing.criteria_json) : [];
  const row = await upsertPreference(d1 as never, {
    userId: userId ?? null,
    anonUserId: anonUserId ?? null,
    category: body.category,
    criteria,
    valuesOverlay: parsed.data,
  });
  return c.json({ ok: true, preference: row });
}

/**
 * GET /values-overlay?category=<slug> — reads back the persisted overlay.
 */
export async function handleGet(
  c: Context<{ Bindings: EnvBindings; Variables: { userId?: string; anonUserId?: string } }>,
): Promise<Response> {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const category = c.req.query("category");
  if (!category) return c.json({ error: "category_required" }, 400);
  const userId = c.get("userId") ?? null;
  const anonUserId = c.get("anonUserId") ?? null;
  if (!userId && !anonUserId) return c.json({ overlay: [], source: "empty" });
  const pref = await findPreference(d1 as never, {
    ...(userId ? { userId } : {}),
    ...(anonUserId ? { anonUserId } : {}),
    category,
  });
  if (!pref || !pref.values_overlay_json) return c.json({ overlay: [], source: "empty" });
  try {
    const overlay = JSON.parse(pref.values_overlay_json);
    return c.json({ overlay, source: "stored", category });
  } catch {
    return c.json({ overlay: [], source: "corrupt" });
  }
}
