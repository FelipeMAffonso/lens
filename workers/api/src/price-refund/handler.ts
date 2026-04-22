// S6-W34 — HTTP glue for /price-refund/*.

import type { Context } from "hono";
import { createIntervention } from "../db/repos/interventions.js";
import { detectClaim } from "./detector.js";
import { draftClaim } from "./claim-drafter.js";
import { listPurchasesWithPendingPriceMatch, listRecentPurchases } from "./repo.js";
import { listWindows, windowFor } from "./windows.js";
import type { PurchaseLike, ScanOutput } from "./types.js";
import { ScanRequestSchema } from "./types.js";

interface EnvBindings {
  LENS_D1?: unknown;
}

/**
 * GET /price-refund/windows — documentation surface; public.
 */
export async function handleWindows(c: Context<{ Bindings: EnvBindings }>): Promise<Response> {
  return c.json({ windows: listWindows(), generatedAt: new Date().toISOString() });
}

/**
 * POST /price-refund/scan — walk the signed-in user's recent purchases,
 * compute a ClaimDecision per row. Never writes. Optional body:
 *   { overrides: [{ purchaseId, currentPrice }] }
 * supplies extension-known current prices for live rows.
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
  const parsed = ScanRequestSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  const overrideMap = new Map<string, number>();
  for (const o of parsed.data.overrides ?? []) overrideMap.set(o.purchaseId, o.currentPrice);

  const [purchases, alreadyFiled] = await Promise.all([
    listRecentPurchases(d1 as never, userId),
    listPurchasesWithPendingPriceMatch(d1 as never, userId),
  ]);

  const now = new Date();
  let eligible = 0;
  let ineligible = 0;
  const candidates: ScanOutput["candidates"] = [];
  for (const p of purchases) {
    const override = overrideMap.get(p.id);
    // Without an explicit current-price override, fall back to null so the
    // detector returns "current price unavailable". Production will replace
    // this with a /price-history fetch (not done in this handler to keep
    // the scan synchronous + deterministic).
    const currentPrice = override ?? null;
    const decision = detectClaim({
      purchase: p,
      currentPrice,
      now,
      window: windowFor(p.retailer),
    });
    candidates.push({
      purchaseId: p.id,
      decision,
      retailer: p.retailer,
      productName: p.productName,
    });
    if (decision.claim) eligible += 1;
    else ineligible += 1;
  }
  const output: ScanOutput = {
    elapsedMs: Date.now() - start,
    scanned: purchases.length,
    eligible,
    alreadyFiled: alreadyFiled.size,
    ineligible,
    candidates,
  };
  return c.json(output);
}

/**
 * POST /price-refund/:purchaseId/file — given an extension- or dashboard-
 * provided currentPrice, draft a claim and persist as an intervention row.
 */
export async function handleFile(
  c: Context<{ Bindings: EnvBindings; Variables: { userId?: string; anonUserId?: string } }>,
): Promise<Response> {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const userId = c.get("userId") as string | undefined;
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const purchaseId = c.req.param("purchaseId") ?? "";
  if (!purchaseId) return c.json({ error: "missing_purchase_id" }, 400);

  const body = (await c.req.json().catch(() => null)) as { currentPrice?: number } | null;
  if (body?.currentPrice === undefined || typeof body.currentPrice !== "number") {
    return c.json({ error: "invalid_input", expected: "currentPrice: number" }, 400);
  }
  const currentPrice = body.currentPrice;

  // Load purchase
  const row = await (d1 as never as {
    prepare: (s: string) => {
      bind: (...vs: unknown[]) => { first: <T>() => Promise<T | null> };
    };
  })
    .prepare(`SELECT * FROM purchases WHERE id = ? AND user_id = ? LIMIT 1`)
    .bind(purchaseId, userId)
    .first<{
      id: string;
      user_id: string;
      retailer: string | null;
      product_name: string;
      price: number | null;
      purchased_at: string;
      order_id: string | null;
    }>();
  if (!row) return c.json({ error: "not_found" }, 404);

  const purchase: PurchaseLike = {
    id: row.id,
    userId: row.user_id,
    retailer: row.retailer,
    productName: row.product_name,
    price: row.price,
    purchasedAt: row.purchased_at,
    orderId: row.order_id,
  };
  const decision = detectClaim({
    purchase,
    currentPrice,
    now: new Date(),
    window: windowFor(purchase.retailer),
  });
  if (!decision.claim) {
    return c.json({ error: "not_eligible", decision }, 422);
  }
  const draft = draftClaim({ purchase, decision });
  const intervention = await createIntervention(d1 as never, {
    userId,
    packSlug: "intervention/file-price-match-claim",
    payload: draft,
    relatedPurchaseId: purchase.id,
  });
  return c.json({ ok: true, intervention, draft, decision });
}
