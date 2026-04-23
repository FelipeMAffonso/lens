// IMPROVEMENT_PLAN_V2 A-S10 — OpenBeautyFacts ingester.
// Same shape as OpenFoodFacts; cosmetics/beauty barcodes + ingredient data.

import type { DatasetIngester, IngestionContext, IngestionReport } from "../framework.js";

const SOURCE_ID = "openbeautyfacts";
const PAGE_SIZE = 100;

interface BeautyPage {
  products: Array<{
    code?: string;
    product_name?: string;
    brands?: string;
    image_url?: string;
    categories?: string;
    countries?: string;
  }>;
}

export const openBeautyFactsIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 180_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = { rowsSeen: 0, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };
    const page = await readPage(ctx);
    const url = `https://world.openbeautyfacts.org/api/v2/search?page=${page}&page_size=${PAGE_SIZE}&fields=code,product_name,brands,image_url,categories,countries`;

    let data: BeautyPage;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "LensBot/1.0" }, signal: ctx.signal });
      if (!res.ok) throw new Error(`http ${res.status}`);
      data = (await res.json()) as BeautyPage;
    } catch (err) {
      counters.errors.push((err as Error).message);
      return counters;
    }
    const rows = data.products ?? [];
    counters.rowsSeen = rows.length;

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
        const skuId = `obf:${ean}`;
        const specsJson = JSON.stringify({ categories: r.categories ?? null, countries: r.countries ?? null });
        stmts.push(
          ctx.env.LENS_D1!.prepare(
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
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO sku_source_link (sku_id, source_id, external_id, external_url, specs_json, observed_at, confidence, active)
             VALUES (?, ?, ?, ?, ?, datetime('now'), 0.85, 1)
             ON CONFLICT(sku_id, source_id, external_id) DO UPDATE SET
               external_url = excluded.external_url,
               observed_at = datetime('now'),
               active = 1`,
          ).bind(skuId, SOURCE_ID, ean, `https://world.openbeautyfacts.org/product/${ean}`, specsJson),
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
    await writePage(ctx, page + 1);
    return counters;
  },
};

async function readPage(ctx: IngestionContext): Promise<number> {
  const row = await ctx.env.LENS_D1!.prepare("SELECT last_error FROM data_source WHERE id = ?")
    .bind(SOURCE_ID)
    .first<{ last_error: string | null }>();
  try {
    const p = JSON.parse(row?.last_error ?? "{}");
    return typeof p.page === "number" ? p.page : 1;
  } catch {
    return 1;
  }
}

async function writePage(ctx: IngestionContext, page: number): Promise<void> {
  await ctx.env.LENS_D1!.prepare("UPDATE data_source SET last_error = ? WHERE id = ?")
    .bind(JSON.stringify({ page }), SOURCE_ID)
    .run();
}