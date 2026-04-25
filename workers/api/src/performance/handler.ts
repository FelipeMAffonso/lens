// S6-W37 — HTTP glue for the performance surface.
// POST /purchase/:id/performance  → record rating + run Layer-4 updater
// GET  /purchase/:id/performance  → read prior rating (or null)
// GET  /performance/history       → list user's ratings

import type { Context } from "hono";
import { findPreference, upsertPreference } from "../db/repos/preferences.js";
import { applyWeightMapToCriteriaJson, criteriaJsonToWeightMap } from "../preferences/inference.js";
import { getByPurchase, listByUser, upsertRating } from "./repo.js";
import { PerformanceRequestSchema, type PerformanceResponse, type PreferenceUpdate } from "./types.js";
import { applyPerformanceUpdate } from "./updater.js";

interface EnvBindings {
  LENS_D1?: unknown;
}

interface PurchaseRow {
  id: string;
  user_id: string;
  category: string | null;
}

/**
 * POST /purchase/:id/performance — record satisfaction + update preferences.
 */
export async function handleRecord(
  c: Context<{ Bindings: EnvBindings; Variables: { userId?: string; anonUserId?: string } }>,
): Promise<Response> {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const userId = c.get("userId") as string | undefined;
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const purchaseId = c.req.param("id") ?? "";
  if (!purchaseId) return c.json({ error: "missing_id" }, 400);

  const body = await c.req.json().catch(() => null);
  const parsed = PerformanceRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  const req = parsed.data;

  const d1Typed = d1 as {
    prepare: (sql: string) => {
      bind: (...values: unknown[]) => { first: <T>() => Promise<T | null> };
    };
  };
  const purchase = await d1Typed
    .prepare(`SELECT id, user_id, category FROM purchases WHERE id = ? LIMIT 1`)
    .bind(purchaseId)
    .first<PurchaseRow>();
  if (!purchase) return c.json({ error: "not_found" }, 404);
  if (purchase.user_id !== userId) return c.json({ error: "forbidden" }, 403);

  // Load the preference row for this category, if any.
  let preferenceUpdate: PreferenceUpdate;
  if (purchase.category) {
    const pref = await findPreference(d1 as never, { userId, category: purchase.category });
    if (pref) {
      const weights = criteriaJsonToWeightMap(pref.criteria_json);
      if (Object.keys(weights).length > 0) {
        preferenceUpdate = applyPerformanceUpdate({
          weights,
          overallRating: req.overallRating,
          wouldBuyAgain: req.wouldBuyAgain,
          ...(req.criterionFeedback ? { criterionFeedback: req.criterionFeedback } : {}),
          category: purchase.category,
        });
        if (preferenceUpdate.applied && preferenceUpdate.after) {
          const nextCriteria = applyWeightMapToCriteriaJson(pref.criteria_json, preferenceUpdate.after);
          await upsertPreference(d1 as never, {
            userId,
            anonUserId: null,
            category: purchase.category,
            criteria: nextCriteria,
          });
        }
      } else {
        preferenceUpdate = {
          applied: false,
          category: purchase.category,
          reason: "preference row found but criteria_json had no numeric weights",
        };
      }
    } else {
      preferenceUpdate = {
        applied: false,
        category: purchase.category,
        reason: "no prior preference row — stored rating only",
      };
    }
  } else {
    preferenceUpdate = {
      applied: false,
      reason: "purchase has no category — stored rating only",
    };
  }

  const row = await upsertRating(d1 as never, {
    userId,
    purchaseId: purchase.id,
    overallRating: req.overallRating,
    wouldBuyAgain: req.wouldBuyAgain,
    ...(req.criterionFeedback ? { criterionFeedback: req.criterionFeedback } : {}),
    ...(req.notes !== undefined ? { notes: req.notes } : {}),
    preferenceSnapshot: preferenceUpdate,
    category: purchase.category,
  });

  const response: PerformanceResponse = {
    ok: true,
    ratingId: row.id,
    preferenceUpdate,
    createdAt: row.created_at,
  };
  return c.json(response);
}

/**
 * GET /purchase/:id/performance — read prior rating (or null).
 */
export async function handleRead(
  c: Context<{ Bindings: EnvBindings; Variables: { userId?: string; anonUserId?: string } }>,
): Promise<Response> {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const userId = c.get("userId") as string | undefined;
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const purchaseId = c.req.param("id") ?? "";
  if (!purchaseId) return c.json({ error: "missing_id" }, 400);
  const row = await getByPurchase(d1 as never, userId, purchaseId);
  return c.json({ rating: row });
}

/**
 * GET /performance/history — list user's ratings, newest first.
 */
export async function handleHistory(
  c: Context<{ Bindings: EnvBindings; Variables: { userId?: string; anonUserId?: string } }>,
): Promise<Response> {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const userId = c.get("userId") as string | undefined;
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const limit = Math.min(Math.max(1, Number(c.req.query("limit") ?? 200)), 500);
  const rows = await listByUser(d1 as never, userId, { limit });
  return c.json({ ratings: rows, count: rows.length });
}
