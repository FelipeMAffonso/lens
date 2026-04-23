// IMPROVEMENT_PLAN_V2 A13c — /compare/products endpoint.
// Side-by-side comparison of 2-4 SKUs. Pulls each SKU's sources, specs,
// triangulated price, recall history, price series. Designed for the UI's
// "compare these three" surface and for MCP clients.

import type { Context } from "hono";
import { z } from "zod";
import type { Env } from "../index.js";

export const CompareRequestSchema = z.object({
  skuIds: z.array(z.string().min(1).max(200)).min(2).max(6),
});

interface SkuRow {
  id: string;
  canonical_name: string;
  brand_slug: string | null;
  model_code: string | null;
  category_code: string | null;
  image_url: string | null;
  specs_json: string | null;
  asin: string | null;
  last_refreshed_at: string;
}

export async function handleCompare(c: Context<{ Bindings: Env }>): Promise<Response> {
  const raw = c.req.query("skus") ?? "";
  const skuIds = raw.split(",").map((s) => s.trim()).filter(Boolean);

  const parsed = CompareRequestSchema.safeParse({ skuIds });
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  if (!c.env.LENS_D1) {
    return c.json({ error: "bootstrapping", message: "D1 not bound" }, 503);
  }

  const placeholders = parsed.data.skuIds.map(() => "?").join(",");

  // Core SKU rows.
  const { results: rows } = await c.env.LENS_D1.prepare(
    `SELECT id, canonical_name, brand_slug, model_code, category_code,
            image_url, specs_json, asin, last_refreshed_at
       FROM sku_catalog
      WHERE id IN (${placeholders})`,
  ).bind(...parsed.data.skuIds).all<SkuRow>();

  // Triangulated prices.
  const { results: prices } = await c.env.LENS_D1.prepare(
    `SELECT sku_id, median_cents, p25_cents, p75_cents, n_sources
       FROM triangulated_price
      WHERE sku_id IN (${placeholders})`,
  ).bind(...parsed.data.skuIds).all<{
    sku_id: string;
    median_cents: number;
    p25_cents: number | null;
    p75_cents: number | null;
    n_sources: number;
  }>();
  const priceBy = new Map(prices?.map((p) => [p.sku_id, p]) ?? []);

  // Source links grouped by sku.
  const { results: links } = await c.env.LENS_D1.prepare(
    `SELECT sku_id, source_id, external_url, price_cents, confidence, observed_at
       FROM sku_source_link
      WHERE sku_id IN (${placeholders}) AND active = 1
      ORDER BY observed_at DESC`,
  ).bind(...parsed.data.skuIds).all<{
    sku_id: string;
    source_id: string;
    external_url: string | null;
    price_cents: number | null;
    confidence: number;
    observed_at: string;
  }>();
  const sourcesBySku = new Map<string, Array<Record<string, unknown>>>();
  for (const l of links ?? []) {
    const list = sourcesBySku.get(l.sku_id) ?? [];
    list.push({
      sourceId: l.source_id,
      url: l.external_url,
      priceCents: l.price_cents,
      confidence: l.confidence,
      observedAt: l.observed_at,
    });
    sourcesBySku.set(l.sku_id, list);
  }

  // Recall matches.
  const { results: recalls } = await c.env.LENS_D1.prepare(
    `SELECT ras.sku_id, r.id, r.title, r.severity, r.hazard, r.url, r.published_at
       FROM recall_affects_sku ras
       JOIN recall r ON r.id = ras.recall_id
      WHERE ras.sku_id IN (${placeholders})
      ORDER BY r.published_at DESC`,
  ).bind(...parsed.data.skuIds).all<{
    sku_id: string;
    id: string;
    title: string;
    severity: string;
    hazard: string | null;
    url: string;
    published_at: string;
  }>();
  const recallsBySku = new Map<string, Array<Record<string, unknown>>>();
  for (const r of recalls ?? []) {
    const list = recallsBySku.get(r.sku_id) ?? [];
    list.push({ id: r.id, title: r.title, severity: r.severity, hazard: r.hazard, url: r.url, publishedAt: r.published_at });
    recallsBySku.set(r.sku_id, list);
  }

  // Recent price series (last 30 observations per sku for mini sparkline).
  const { results: series } = await c.env.LENS_D1.prepare(
    `SELECT sku_id, observed_at, price_cents
       FROM price_history
      WHERE sku_id IN (${placeholders})
      ORDER BY observed_at DESC
      LIMIT 500`,
  ).bind(...parsed.data.skuIds).all<{ sku_id: string; observed_at: string; price_cents: number }>();
  const seriesBySku = new Map<string, Array<{ at: string; cents: number }>>();
  for (const s of series ?? []) {
    const list = seriesBySku.get(s.sku_id) ?? [];
    if (list.length < 30) list.push({ at: s.observed_at, cents: s.price_cents });
    seriesBySku.set(s.sku_id, list);
  }

  const products = (rows ?? []).map((r) => {
    let specs: unknown = null;
    try {
      specs = r.specs_json ? JSON.parse(r.specs_json) : null;
    } catch {
      specs = null;
    }
    const price = priceBy.get(r.id);
    return {
      id: r.id,
      name: r.canonical_name,
      brand: r.brand_slug,
      model: r.model_code,
      category: r.category_code,
      imageUrl: r.image_url,
      asin: r.asin,
      specs,
      triangulatedPrice: price
        ? {
            medianCents: price.median_cents,
            p25Cents: price.p25_cents,
            p75Cents: price.p75_cents,
            nSources: price.n_sources,
          }
        : null,
      sources: sourcesBySku.get(r.id) ?? [],
      recalls: recallsBySku.get(r.id) ?? [],
      priceHistory: seriesBySku.get(r.id) ?? [],
      lastRefreshedAt: r.last_refreshed_at,
    };
  });

  // Build the shared-spec comparison matrix.
  const allKeys = new Set<string>();
  for (const p of products) {
    if (p.specs && typeof p.specs === "object") {
      for (const k of Object.keys(p.specs)) allKeys.add(k);
    }
  }
  const matrix = Array.from(allKeys)
    .sort()
    .map((key) => ({
      key,
      values: products.map((p) => {
        const specs = p.specs as Record<string, unknown> | null;
        return specs && key in specs ? specs[key] : null;
      }),
    }));

  return c.json({
    products,
    sharedSpecMatrix: matrix,
    requested: parsed.data.skuIds,
    returned: products.map((p) => p.id),
    missing: parsed.data.skuIds.filter((id) => !products.find((p) => p.id === id)),
  });
}