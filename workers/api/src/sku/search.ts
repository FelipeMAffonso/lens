// IMPROVEMENT_PLAN_V2 A13 + B1 — /sku/search endpoint.
// Queries the indexed sku_catalog (populated by Phase A ingesters) via
// FTS5 fuzzy match, filters by category, returns top N with triangulated
// price when available. Target p99 latency: <50ms.
//
// Audit workflow's search stage calls this FIRST (before falling back to
// the slow web_search path). When the catalog has coverage, end-to-end
// audit drops from 20s+ to <8s.

import type { Context } from "hono";
import { z } from "zod";
import type { Env } from "../index.js";

export const SkuSearchRequestSchema = z.object({
  q: z.string().min(1).max(400),
  category: z.string().max(200).optional(),
  brand: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(50).default(10),
  includeSources: z.boolean().default(false),
});

export type SkuSearchRequest = z.infer<typeof SkuSearchRequestSchema>;

interface SkuRow {
  id: string;
  canonical_name: string;
  brand_slug: string | null;
  model_code: string | null;
  category_code: string | null;
  image_url: string | null;
  summary: string | null;
  specs_json: string | null;
  asin: string | null;
  upc: string | null;
  ean: string | null;
  fcc_id: string | null;
  last_refreshed_at: string;
  median_cents?: number | null;
  n_sources?: number | null;
}

/**
 * Public search endpoint. Returns triangulated SKU rows matching the query.
 * Falls back gracefully when FTS5 is empty (bootstrap) — returns `{skus: [], bootstrapping: true}`.
 */
export async function handleSkuSearch(c: Context<{ Bindings: Env }>): Promise<Response> {
  const q = c.req.query("q") ?? "";
  const category = c.req.query("category");
  const brand = c.req.query("brand");
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 10), 1), 50);
  const includeSources = c.req.query("includeSources") === "1";

  const parsed = SkuSearchRequestSchema.safeParse({ q, category, brand, limit, includeSources });
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  if (!c.env.LENS_D1) {
    return c.json({ skus: [], bootstrapping: true, message: "D1 not bound" });
  }

  const fts_q = escapeFts(parsed.data.q);
  const filters: string[] = [];
  const binds: unknown[] = [fts_q];
  if (parsed.data.brand) {
    filters.push("sc.brand_slug = ?");
    binds.push(parsed.data.brand);
  }
  if (parsed.data.category) {
    filters.push("sc.category_code = ?");
    binds.push(parsed.data.category);
  }
  const where = filters.length > 0 ? "AND " + filters.join(" AND ") : "";

  try {
    const { results } = await c.env.LENS_D1.prepare(
      `SELECT sc.id, sc.canonical_name, sc.brand_slug, sc.model_code, sc.category_code,
              sc.image_url, sc.summary, sc.specs_json, sc.asin, sc.upc, sc.ean, sc.fcc_id,
              sc.last_refreshed_at,
              tp.median_cents, tp.n_sources
         FROM sku_fts
         JOIN sku_catalog sc ON sc.id = sku_fts.sku_id
         LEFT JOIN triangulated_price tp ON tp.sku_id = sc.id
        WHERE sku_fts MATCH ?
          AND sc.status = 'active'
          ${where}
        ORDER BY bm25(sku_fts), sc.last_refreshed_at DESC
        LIMIT ${parsed.data.limit}`,
    ).bind(...binds).all<SkuRow>();

    const skus = (results ?? []).map(shape);
    const enriched = includeSources ? await attachSources(c.env, skus) : skus;
    return c.json({ skus: enriched, q: parsed.data.q, count: enriched.length });
  } catch (err) {
    // FTS table may not be populated yet.
    console.warn("[/sku/search] fallback to LIKE:", (err as Error).message);
    try {
      const like = `%${parsed.data.q.replace(/[%_]/g, "")}%`;
      const binds2: unknown[] = [like, like];
      if (parsed.data.brand) binds2.push(parsed.data.brand);
      if (parsed.data.category) binds2.push(parsed.data.category);
      const { results } = await c.env.LENS_D1.prepare(
        `SELECT sc.id, sc.canonical_name, sc.brand_slug, sc.model_code, sc.category_code,
                sc.image_url, sc.summary, sc.specs_json, sc.asin, sc.upc, sc.ean, sc.fcc_id,
                sc.last_refreshed_at,
                tp.median_cents, tp.n_sources
           FROM sku_catalog sc
           LEFT JOIN triangulated_price tp ON tp.sku_id = sc.id
          WHERE (sc.canonical_name LIKE ? OR sc.brand_slug LIKE ?)
            AND sc.status = 'active'
            ${parsed.data.brand ? "AND sc.brand_slug = ?" : ""}
            ${parsed.data.category ? "AND sc.category_code = ?" : ""}
          ORDER BY sc.last_refreshed_at DESC
          LIMIT ${parsed.data.limit}`,
      ).bind(...binds2).all<SkuRow>();
      const skus = (results ?? []).map(shape);
      const enriched = includeSources ? await attachSources(c.env, skus) : skus;
      return c.json({ skus: enriched, q: parsed.data.q, count: enriched.length, fallback: "like" });
    } catch (err2) {
      return c.json({ skus: [], bootstrapping: true, message: (err2 as Error).message });
    }
  }
}

function escapeFts(s: string): string {
  // FTS5 supports prefix matches with trailing *. Strip control chars.
  return s
    .replace(/[\x00-\x1f]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, '""')}"*`)
    .join(" ");
}

function shape(r: SkuRow): Record<string, unknown> {
  let specs: unknown = null;
  try {
    specs = r.specs_json ? JSON.parse(r.specs_json) : null;
  } catch {
    specs = null;
  }
  return {
    id: r.id,
    name: r.canonical_name,
    brand: r.brand_slug,
    model: r.model_code,
    category: r.category_code,
    imageUrl: r.image_url,
    summary: r.summary,
    specs,
    asin: r.asin,
    upc: r.upc,
    ean: r.ean,
    fccId: r.fcc_id,
    priceMedianCents: r.median_cents ?? null,
    priceSources: r.n_sources ?? 0,
    lastRefreshedAt: r.last_refreshed_at,
  };
}

async function attachSources(env: Env, skus: Array<Record<string, unknown>>): Promise<Array<Record<string, unknown>>> {
  if (skus.length === 0) return skus;
  const ids = skus.map((s) => s.id as string);
  const placeholders = ids.map(() => "?").join(",");
  const { results } = await env.LENS_D1!.prepare(
    `SELECT sku_id, source_id, external_url, observed_at, confidence
       FROM sku_source_link
      WHERE sku_id IN (${placeholders})
      ORDER BY observed_at DESC`,
  ).bind(...ids).all<{
    sku_id: string;
    source_id: string;
    external_url: string | null;
    observed_at: string;
    confidence: number;
  }>();
  const bySku = new Map<string, Array<Record<string, unknown>>>();
  for (const r of results ?? []) {
    const list = bySku.get(r.sku_id) ?? [];
    list.push({
      sourceId: r.source_id,
      url: r.external_url,
      observedAt: r.observed_at,
      confidence: r.confidence,
    });
    bySku.set(r.sku_id, list);
  }
  return skus.map((s) => ({ ...s, sources: bySku.get(s.id as string) ?? [] }));
}