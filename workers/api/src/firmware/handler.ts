// S7-W38 — HTTP glue for POST /firmware/scan.

import type { Context } from "hono";
import { createIntervention } from "../db/repos/interventions.js";
import { assessMatches } from "./assess.js";
import { matchFirmware } from "./matcher.js";
import { fetchAdvisories } from "./source.js";
import {
  FirmwareScanRequestSchema,
  type AssessedMatch,
  type FirmwareScanResponse,
  type PurchaseLike,
} from "./types.js";

interface EnvBindings {
  LENS_D1?: unknown;
  LENS_FIRMWARE_MODE?: string;
}

/**
 * POST /firmware/scan — scan the signed-in user's connected-device purchases
 * against the advisory dataset. Writes interventions for critical/high
 * matches; returns structured output for the dashboard card.
 */
export async function handleScan(
  c: Context<{ Bindings: EnvBindings; Variables: { userId?: string; anonUserId?: string } }>,
): Promise<Response> {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const userId = c.get("userId") as string | undefined;
  if (!userId) return c.json({ error: "unauthenticated" }, 401);

  const start = Date.now();
  const body = await c.req.json().catch(() => ({}));
  const parsed = FirmwareScanRequestSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }

  // Load purchases scoped to this user; optional filter by purchaseIds.
  const d1Typed = d1 as {
    prepare: (sql: string) => {
      bind: (...values: unknown[]) => {
        all: <T>() => Promise<{ results: T[] }>;
      };
    };
  };
  // Load the user's purchases; filter by purchaseIds in JS to keep memory-d1
  // shim simple (no IN (...) parser needed).
  const resAll = await d1Typed
    .prepare(
      `SELECT id, user_id, product_name, brand, category, purchased_at
       FROM purchases WHERE user_id = ? ORDER BY purchased_at DESC LIMIT 500`,
    )
    .bind(userId)
    .all<PurchaseLike>();
  let purchases: PurchaseLike[] = resAll.results ?? [];
  if (parsed.data.purchaseIds && parsed.data.purchaseIds.length > 0) {
    const allowed = new Set(parsed.data.purchaseIds);
    purchases = purchases.filter((p) => allowed.has(p.id));
  }

  const advisories = await fetchAdvisories({
    ...(c.env.LENS_FIRMWARE_MODE !== undefined ? { LENS_FIRMWARE_MODE: c.env.LENS_FIRMWARE_MODE } : {}),
  });
  const rawMatches = matchFirmware(advisories, purchases);
  const assessed = assessMatches(rawMatches);

  const interventions: FirmwareScanResponse["interventions"] = [];
  let critical = 0;
  let high = 0;
  let medium = 0;
  let low = 0;
  for (const m of assessed) {
    if (m.band === "critical") critical += 1;
    else if (m.band === "high") high += 1;
    else if (m.band === "medium") medium += 1;
    else if (m.band === "low") low += 1;
    if (!m.shouldNotify) continue;
    const row = await createIntervention(d1 as never, {
      userId,
      packSlug: "advisory/apply-firmware-update",
      payload: {
        advisory: m.advisory,
        score: m.score,
        reasons: m.reasons,
        band: m.band,
      },
      relatedPurchaseId: m.purchase.id,
    }).catch((e: Error) => {
      // Write failures are logged but don't fail the scan.
      console.error("[firmware.scan] intervention insert failed:", e.message);
      return null;
    });
    if (row) {
      interventions.push({
        interventionId: row.id,
        purchaseId: m.purchase.id,
        advisoryId: m.advisory.advisoryId,
        vendor: m.advisory.vendor,
        severity: m.advisory.severity,
        cvssScore: m.advisory.cvssScore,
        fixedFirmwareVersion: m.advisory.fixedFirmwareVersion,
        title: m.advisory.title,
        remediationSteps: m.advisory.remediationSteps,
        publishedAt: m.advisory.publishedAt,
        sourceUrl: m.advisory.sourceUrl,
      });
    }
  }

  const response: FirmwareScanResponse = {
    ok: true,
    scanned: purchases.length,
    matched: assessed.length,
    critical,
    high,
    medium,
    low,
    interventions,
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - start,
  };
  return c.json(response);
}

/**
 * runForUser — the cron path. Same logic as handleScan but takes (userId, d1, env)
 * directly. Used by workflow specs + per-user iterators in the weekly cron.
 */
export async function runForUser(
  userId: string,
  d1: unknown,
  env: EnvBindings,
): Promise<{ assessed: AssessedMatch[]; interventionCount: number }> {
  const d1Typed = d1 as {
    prepare: (sql: string) => {
      bind: (...values: unknown[]) => {
        all: <T>() => Promise<{ results: T[] }>;
      };
    };
  };
  const res = await d1Typed
    .prepare(
      `SELECT id, user_id, product_name, brand, category, purchased_at
       FROM purchases WHERE user_id = ? ORDER BY purchased_at DESC LIMIT 500`,
    )
    .bind(userId)
    .all<PurchaseLike>();
  const purchases = res.results ?? [];
  const advisories = await fetchAdvisories({
    ...(env.LENS_FIRMWARE_MODE !== undefined ? { LENS_FIRMWARE_MODE: env.LENS_FIRMWARE_MODE } : {}),
  });
  const assessed = assessMatches(matchFirmware(advisories, purchases));
  let interventionCount = 0;
  for (const m of assessed) {
    if (!m.shouldNotify) continue;
    await createIntervention(d1 as never, {
      userId,
      packSlug: "advisory/apply-firmware-update",
      payload: { advisory: m.advisory, score: m.score, reasons: m.reasons, band: m.band },
      relatedPurchaseId: m.purchase.id,
    }).catch((e: Error) => {
      console.error("[firmware.scan.cron] intervention insert failed:", e.message);
    });
    interventionCount += 1;
  }
  return { assessed, interventionCount };
}
