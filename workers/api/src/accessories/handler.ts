// S7-W39 — HTTP glue for POST /accessories/discover.

import type { Context } from "hono";
import { isCompatible } from "./compat.js";
import { ACCESSORY_CATALOG } from "./fixtures.js";
import { rankAccessories } from "./rank.js";
import {
  DiscoverRequestSchema,
  type AccessoryCandidate,
  type AccessoryFixture,
  type DiscoverResponse,
  type ProductContext,
} from "./types.js";

interface EnvBindings {
  LENS_D1?: unknown;
}

interface PurchaseRow {
  id: string;
  user_id: string;
  product_name: string;
  brand: string | null;
  category: string | null;
}

function toCandidate(
  acc: AccessoryFixture,
  ranked: { utility: number; contributions: Record<string, number> } | null,
  compat: ReturnType<typeof isCompatible>,
): AccessoryCandidate {
  return {
    name: acc.name,
    category: acc.category,
    accessoryKind: acc.accessoryKind,
    brand: acc.brand,
    price: acc.price,
    url: acc.url,
    compat,
    utility: ranked?.utility ?? 0,
    contributions: ranked?.contributions ?? {},
    why: acc.why,
  };
}

export async function handleDiscover(
  c: Context<{ Bindings: EnvBindings; Variables: { userId?: string; anonUserId?: string } }>,
): Promise<Response> {
  const body = await c.req.json().catch(() => null);
  const parsed = DiscoverRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  const req = parsed.data;
  const limit = Math.min(req.limit ?? 5, 20);

  // Resolve product context: purchaseId (auth + F2 lookup) > productContext.
  let ctx: ProductContext;
  if (req.purchaseId) {
    const d1 = c.env.LENS_D1;
    if (!d1) return c.json({ error: "d1_unavailable" }, 503);
    const userId = c.get("userId") as string | undefined;
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const row = await (d1 as {
      prepare: (sql: string) => {
        bind: (...values: unknown[]) => { first: <T>() => Promise<T | null> };
      };
    })
      .prepare(`SELECT id, user_id, product_name, brand, category FROM purchases WHERE id = ? LIMIT 1`)
      .bind(req.purchaseId)
      .first<PurchaseRow>();
    if (!row) return c.json({ error: "not_found" }, 404);
    if (row.user_id !== userId) return c.json({ error: "forbidden" }, 403);
    if (!row.category) {
      return c.json({ error: "purchase_has_no_category" }, 422);
    }
    ctx = {
      category: row.category,
      ...(row.brand !== null ? { brand: row.brand } : {}),
      productName: row.product_name,
    };
  } else if (req.productContext) {
    ctx = req.productContext;
  } else {
    // Schema refine should catch this, defensive fallback.
    return c.json({ error: "invalid_input", issues: [{ message: "purchaseId or productContext required" }] }, 400);
  }

  const categoryFixtures = ACCESSORY_CATALOG[ctx.category] ?? [];
  const generatedAt = new Date().toISOString();

  if (categoryFixtures.length === 0) {
    const response: DiscoverResponse = {
      ok: true,
      source: "fixture",
      productContext: ctx,
      candidates: [],
      incompatible: [],
      reason: `no accessory fixtures for category "${ctx.category}"`,
      generatedAt,
    };
    return c.json(response);
  }

  // Compat gate.
  const passing: AccessoryFixture[] = [];
  const failing: AccessoryCandidate[] = [];
  const compatByName = new Map<string, ReturnType<typeof isCompatible>>();
  for (const acc of categoryFixtures) {
    const compat = isCompatible(acc, ctx);
    compatByName.set(acc.name, compat);
    if (compat.compatible) {
      passing.push(acc);
    } else {
      failing.push(toCandidate(acc, null, compat));
    }
  }

  const ranked = rankAccessories(passing, req.criteria);
  const candidates = ranked
    .slice(0, limit)
    .map((r) => toCandidate(r.accessory, r, compatByName.get(r.accessory.name)!));

  const response: DiscoverResponse = {
    ok: true,
    source: "fixture",
    productContext: ctx,
    candidates,
    incompatible: failing,
    generatedAt,
  };
  return c.json(response);
}
