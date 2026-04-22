// S0-W5 — HTTP glue for the subscriptions surface.

import type { Context } from "hono";
import { classifyMessage } from "./classifier.js";
import {
  deleteById,
  getById,
  listByUser,
  listUpcomingRenewals,
  setActive,
  upsertFromClassified,
} from "./repo.js";
import { SubsScanRequestSchema } from "./types.js";

interface EnvBindings {
  LENS_D1?: unknown;
}

/**
 * POST /subs/scan — batch classify + upsert a list of Gmail-shaped messages.
 */
export async function handleScan(
  c: Context<{ Bindings: EnvBindings; Variables: { userId?: string; anonUserId?: string } }>,
): Promise<Response> {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const userId = c.get("userId") as string | undefined;
  if (!userId) return c.json({ error: "unauthenticated" }, 401);

  const body = await c.req.json().catch(() => null);
  const parsed = SubsScanRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }

  const start = Date.now();
  const matched: unknown[] = [];
  const unmatched: unknown[] = [];
  for (const msg of parsed.data.messages) {
    const result = classifyMessage(msg);
    if (!result.matched) {
      unmatched.push(result);
      continue;
    }
    const row = await upsertFromClassified(d1 as never, {
      userId,
      classified: result,
      source: "gmail",
      rawPayload: msg,
    });
    matched.push({ classified: result, row });
  }
  const elapsedMs = Date.now() - start;
  return c.json({
    ok: true,
    scanned: parsed.data.messages.length,
    matchedCount: matched.length,
    unmatchedCount: unmatched.length,
    matched,
    unmatched,
    elapsedMs,
  });
}

/**
 * GET /subs — list signed-in principal's subscriptions.
 */
export async function handleList(
  c: Context<{ Bindings: EnvBindings; Variables: { userId?: string; anonUserId?: string } }>,
): Promise<Response> {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const userId = c.get("userId") as string | undefined;
  if (!userId) return c.json({ subscriptions: [], count: 0 });
  const activeOnly = c.req.query("active") === "1";
  const rows = await listByUser(d1 as never, userId, { activeOnly });
  return c.json({ subscriptions: rows, count: rows.length });
}

/**
 * GET /subs/upcoming?days=7 — subscriptions renewing within N days.
 */
export async function handleUpcoming(
  c: Context<{ Bindings: EnvBindings; Variables: { userId?: string; anonUserId?: string } }>,
): Promise<Response> {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const userId = c.get("userId") as string | undefined;
  if (!userId) return c.json({ upcoming: [], count: 0 });
  const days = Math.min(Math.max(1, Number(c.req.query("days") ?? 7)), 90);
  const rows = await listUpcomingRenewals(d1 as never, userId, days);
  return c.json({ upcoming: rows, count: rows.length, windowDays: days });
}

/**
 * PATCH /subs/:id — toggle active state.
 */
export async function handlePatch(
  c: Context<{ Bindings: EnvBindings; Variables: { userId?: string; anonUserId?: string } }>,
): Promise<Response> {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const userId = c.get("userId") as string | undefined;
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const id = c.req.param("id") ?? "";
  if (!id) return c.json({ error: "missing_id" }, 400);
  const row = await getById(d1 as never, id);
  if (!row) return c.json({ error: "not_found" }, 404);
  if (row.user_id !== userId) return c.json({ error: "forbidden" }, 403);
  const body = (await c.req.json().catch(() => null)) as { active?: boolean } | null;
  if (body?.active === undefined) {
    return c.json({ error: "invalid_input", expected: "active: boolean" }, 400);
  }
  await setActive(d1 as never, id, body.active);
  return c.json({ ok: true, id, active: body.active });
}

/**
 * DELETE /subs/:id — permanent delete.
 */
export async function handleDelete(
  c: Context<{ Bindings: EnvBindings; Variables: { userId?: string; anonUserId?: string } }>,
): Promise<Response> {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const userId = c.get("userId") as string | undefined;
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const id = c.req.param("id") ?? "";
  if (!id) return c.json({ error: "missing_id" }, 400);
  const row = await getById(d1 as never, id);
  if (!row) return c.json({ error: "not_found" }, 404);
  if (row.user_id !== userId) return c.json({ error: "forbidden" }, 403);
  await deleteById(d1 as never, id);
  return c.json({ ok: true, id });
}

/**
 * POST /subs/:id/cancel-draft — stub of the cancel-intervention flow.
 * Later wires through intervention/draft-cancel-subscription pack.
 */
export async function handleCancelDraft(
  c: Context<{ Bindings: EnvBindings; Variables: { userId?: string; anonUserId?: string } }>,
): Promise<Response> {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const userId = c.get("userId") as string | undefined;
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const id = c.req.param("id") ?? "";
  if (!id) return c.json({ error: "missing_id" }, 400);
  const row = await getById(d1 as never, id);
  if (!row || row.user_id !== userId) return c.json({ error: "not_found" }, 404);
  // Stub — a real draft would pull intervention/draft-cancel-subscription
  // pack template and substitute service + account-id + cancellation-url.
  return c.json({
    ok: true,
    draft: {
      service: row.service,
      instruction: `Open ${row.service} → Account → Billing → Cancel. Lens pre-fills the cancellation form once the pack surface ships.`,
      interventionSlug: "intervention/draft-cancel-subscription",
    },
  });
}
