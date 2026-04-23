// IMPROVEMENT_PLAN_V2 A7b — USDA Branded Foods Database ingester.
// FDC API: https://api.nal.usda.gov/fdc/v1/foods/search?dataType=Branded
// Requires USDA_FDC_KEY (free, 1000/h). Without a key we fall back to the
// 250-result public endpoint which still seeds initial inventory.

import { ensureBrands, type DatasetIngester, type IngestionContext, type IngestionReport } from "../framework.js";

const SOURCE_ID = "usda-foods";
const PAGE_SIZE = 200;

export const usdaFoodsIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 180_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = { rowsSeen: 0, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };
    const logLines: string[] = [];
    const page = await readPage(ctx);
    const apiKey = (ctx.env as Record<string, string | undefined>).USDA_FDC_KEY ?? "DEMO_KEY";
    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}&dataType=Branded&pageSize=${PAGE_SIZE}&pageNumber=${page}`;
    logLines.push(`page=${page}`);

    let body: { foods?: Array<Record<string, string | number | null>>; totalHits?: number };
    try {
      const res = await fetch(url, { headers: { "User-Agent": "LensBot/1.0" }, signal: ctx.signal });
      if (!res.ok) throw new Error(`http ${res.status}`);
      body = (await res.json()) as typeof body;
    } catch (err) {
      counters.errors.push((err as Error).message);
      counters.log = logLines.join("\n");
      return counters;
    }
    const foods = body.foods ?? [];
    counters.rowsSeen = foods.length;

    // Upsert brands first so FK constraint on sku_catalog.brand_slug holds.
    const brands = new Map<string, string>();
    for (const f of foods) {
      const raw = ((f.brandOwner as string | undefined) ?? (f.brandName as string | undefined) ?? "").trim();
      const slug = raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
      if (!brands.has(slug)) brands.set(slug, raw || slug);
    }
    await ensureBrands(ctx.env, brands);

    const BATCH = 12;
    for (let i = 0; i < foods.length; i += BATCH) {
      if (ctx.signal.aborted) break;
      const stmts: unknown[] = [];
      for (const f of foods.slice(i, i + BATCH)) {
        const fdcId = String(f.fdcId ?? "");
        const gtin = String(f.gtinUpc ?? "").replace(/\D/g, "");
        const name = (f.description as string | undefined)?.trim();
        const brandRaw = (f.brandOwner as string | undefined) ?? (f.brandName as string | undefined) ?? "";
        if (!fdcId || !name) {
          counters.rowsSkipped++;
          continue;
        }
        const brand = brandRaw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
        const skuId = `usda:${fdcId}`;
        const specsJson = JSON.stringify({
          ingredients: f.ingredients ?? null,
          serving: f.servingSize ?? null,
          serving_unit: f.servingSizeUnit ?? null,
          category: f.foodCategory ?? null,
          published: f.publicationDate ?? null,
          data_source: "USDA FDC Branded Foods",
        });
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO sku_catalog (id, canonical_name, brand_slug, gtin, upc, specs_json, first_seen_at, last_refreshed_at)
             VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
               canonical_name = excluded.canonical_name,
               gtin = excluded.gtin,
               upc = excluded.upc,
               specs_json = excluded.specs_json,
               last_refreshed_at = datetime('now')`,
          ).bind(skuId, name.slice(0, 200), brand, gtin || null, gtin.length === 12 ? gtin : null, specsJson),
        );
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO sku_source_link (sku_id, source_id, external_id, external_url, specs_json, observed_at, confidence, active)
             VALUES (?, ?, ?, ?, ?, datetime('now'), 0.95, 1)
             ON CONFLICT(sku_id, source_id, external_id) DO UPDATE SET
               external_url = excluded.external_url,
               specs_json = excluded.specs_json,
               observed_at = datetime('now'),
               active = 1`,
          ).bind(skuId, SOURCE_ID, fdcId, `https://fdc.nal.usda.gov/fdc-app.html#/food-details/${fdcId}/nutrients`, specsJson),
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
    const exhausted = foods.length < PAGE_SIZE;
    await writePage(ctx, exhausted ? 1 : page + 1);
    logLines.push(`next page: ${exhausted ? 1 : page + 1}`);
    counters.log = logLines.join("\n");
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