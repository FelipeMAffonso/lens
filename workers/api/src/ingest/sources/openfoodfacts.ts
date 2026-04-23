// IMPROVEMENT_PLAN_V2 A7 — OpenFoodFacts ingester.
// Free, rate-friendly. Pagination via page+page_size. One page = 100 rows.
// Runs every ~10 min — over a day ingests ~15K SKUs with barcode + brand +
// category + image_url + ingredients.

import type { Env } from "../../index.js";
import { ensureBrands, type DatasetIngester, type IngestionContext, type IngestionReport } from "../framework.js";

const SOURCE_ID = "openfoodfacts";
const PAGE_SIZE = 100;

interface OffPage {
  products: Array<{
    _id?: string;
    code?: string;                      // EAN-13 usually
    product_name?: string;
    brands?: string;
    image_url?: string;
    categories?: string;
    countries?: string;
    nutriscore_grade?: string;
    nova_group?: number;
  }>;
  count?: number;
  page?: number;
  page_size?: number;
  page_count?: number;
}

export const openFoodFactsIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 180_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = { rowsSeen: 0, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };
    const logLines: string[] = [];

    const page = (await readState(ctx.env)) || 1;
    const url = `https://world.openfoodfacts.org/api/v2/search?page=${page}&page_size=${PAGE_SIZE}&fields=code,product_name,brands,image_url,categories,countries,nutriscore_grade,nova_group`;
    logLines.push(`page=${page}`);

    let data: OffPage;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "LensBot/1.0 (felipe@lens-b1h.pages.dev)" }, signal: ctx.signal });
      if (!res.ok) throw new Error(`http ${res.status}`);
      data = (await res.json()) as OffPage;
    } catch (err) {
      counters.errors.push((err as Error).message);
      counters.log = logLines.join("\n");
      return counters;
    }
    const rows = data.products ?? [];
    counters.rowsSeen = rows.length;

    const brands = new Map<string, string>();
    for (const r of rows) {
      const raw = (r.brands ?? "").split(",")[0]?.trim() ?? "";
      const slug = raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
      if (!brands.has(slug)) brands.set(slug, raw || slug);
    }
    await ensureBrands(ctx.env, brands);

    const BATCH = 12;
    for (let i = 0; i < rows.length; i += BATCH) {
      if (ctx.signal.aborted) break;
      const stmts: unknown[] = [];
      for (const r of rows.slice(i, i + BATCH)) {
        const ean = (r.code ?? "").replace(/\D/g, "");
        if (!ean || !r.product_name) {
          counters.rowsSkipped++;
          continue;
        }
        const brand = (r.brands ?? "").split(",")[0]?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
        const skuId = `off:${ean}`;
        const specsJson = JSON.stringify({
          categories: r.categories ?? null,
          countries: r.countries ?? null,
          nutriscore_grade: r.nutriscore_grade ?? null,
          nova_group: r.nova_group ?? null,
        });
        stmts.push(
          env(ctx).prepare(
            `INSERT INTO sku_catalog (id, canonical_name, brand_slug, ean, gtin, image_url, specs_json, first_seen_at, last_refreshed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
               canonical_name = excluded.canonical_name,
               image_url = excluded.image_url,
               specs_json = excluded.specs_json,
               last_refreshed_at = datetime('now')`,
          ).bind(skuId, r.product_name.slice(0, 200), brand, ean, ean, r.image_url ?? null, specsJson),
        );
        stmts.push(
          env(ctx).prepare(
            `INSERT INTO sku_source_link (sku_id, source_id, external_id, external_url, specs_json, observed_at, confidence, active)
             VALUES (?, ?, ?, ?, ?, datetime('now'), 0.85, 1)
             ON CONFLICT(sku_id, source_id, external_id) DO UPDATE SET
               external_url = excluded.external_url,
               specs_json = excluded.specs_json,
               observed_at = datetime('now'),
               active = 1`,
          ).bind(skuId, SOURCE_ID, ean, `https://world.openfoodfacts.org/product/${ean}`, specsJson),
        );
      }
      if (stmts.length === 0) continue;
      try {
        await (ctx.env.LENS_D1 as unknown as { batch(s: unknown[]): Promise<unknown[]> }).batch(stmts);
        counters.rowsUpserted += stmts.length / 2;
      } catch (err) {
        if (counters.errors.length < 10) counters.errors.push((err as Error).message);
      }
      if ((i / BATCH) % 20 === 0) await ctx.progress({});
    }
    await writeState(ctx.env, page + 1);
    logLines.push(`next page: ${page + 1}`);
    counters.log = logLines.join("\n");
    return counters;
  },
};

function env(ctx: IngestionContext) {
  if (!ctx.env.LENS_D1) throw new Error("LENS_D1 required");
  return ctx.env.LENS_D1;
}

async function readState(env: Env): Promise<number> {
  const row = await env.LENS_D1!.prepare("SELECT last_error FROM data_source WHERE id = ?")
    .bind(SOURCE_ID)
    .first<{ last_error: string | null }>();
  try {
    const p = JSON.parse(row?.last_error ?? "{}");
    return typeof p.page === "number" ? p.page : 1;
  } catch {
    return 1;
  }
}

async function writeState(env: Env, page: number): Promise<void> {
  await env.LENS_D1!.prepare("UPDATE data_source SET last_error = ? WHERE id = ?")
    .bind(JSON.stringify({ page }), SOURCE_ID)
    .run();
}