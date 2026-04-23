// IMPROVEMENT_PLAN_V2 A-S3 — EPA fueleconomy.gov vehicle ingester.
// Public vehicle spec API. ~40K vehicles since 1984.
// Cascading API: /menu/year → /menu/make?year=Y → /menu/model?year=Y&make=M
// Per-run: fetch one make-year slice, ~50 vehicles.

import type { DatasetIngester, IngestionContext, IngestionReport } from "../framework.js";

const SOURCE_ID = "epa-fueleconomy";

const POPULAR_MAKES = [
  "Ford", "Chevrolet", "Toyota", "Honda", "Nissan", "Hyundai", "Kia",
  "Volkswagen", "BMW", "Mercedes-Benz", "Subaru", "Mazda", "Tesla",
  "Jeep", "Dodge", "Chrysler", "Acura", "Lexus", "Audi", "Volvo",
  "GMC", "Buick", "Cadillac", "Lincoln", "Mitsubishi", "Infiniti",
];

export const epaFuelEconomyIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 180_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = { rowsSeen: 0, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };
    const state = await readState(ctx);
    const year = 1984 + (state.yearIndex % (new Date().getFullYear() - 1984 + 1));
    const make = POPULAR_MAKES[state.makeIndex % POPULAR_MAKES.length]!;
    const logLines: string[] = [`year=${year} make=${make}`];

    // Vehicle models for this year+make
    const modelsUrl = `https://www.fueleconomy.gov/ws/rest/vehicle/menu/model?year=${year}&make=${encodeURIComponent(make)}`;
    let modelsXml = "";
    try {
      const res = await fetch(modelsUrl, { headers: { Accept: "application/xml" }, signal: ctx.signal });
      if (!res.ok) throw new Error(`models http ${res.status}`);
      modelsXml = await res.text();
    } catch (err) {
      counters.errors.push((err as Error).message);
      await advance(ctx, state);
      return counters;
    }
    const models = extractTag(modelsXml, "value");
    counters.rowsSeen = models.length;
    logLines.push(`models: ${models.length}`);

    // For each model, we could fetch vehicle IDs, but that's another request
    // per model. For now, persist one row per (year, make, model) with minimal
    // specs. Enricher can fill in MPG later.
    const BATCH = 15;
    for (let i = 0; i < models.length; i += BATCH) {
      if (ctx.signal.aborted) break;
      const stmts: unknown[] = [];
      for (const model of models.slice(i, i + BATCH)) {
        const brandSlug = make.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const modelSlug = model.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const skuId = `feg:${year}:${brandSlug}:${modelSlug}`;
        const specsJson = JSON.stringify({
          year,
          make,
          model,
          source: "EPA fueleconomy.gov",
        });
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO sku_catalog (id, canonical_name, brand_slug, model_code, specs_json, first_seen_at, last_refreshed_at)
             VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
               specs_json = excluded.specs_json,
               last_refreshed_at = datetime('now')`,
          ).bind(skuId, `${year} ${make} ${model}`.slice(0, 200), brandSlug, model.slice(0, 120), specsJson),
        );
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO sku_source_link (sku_id, source_id, external_id, external_url, specs_json, observed_at, confidence, active)
             VALUES (?, ?, ?, ?, ?, datetime('now'), 0.9, 1)
             ON CONFLICT(sku_id, source_id, external_id) DO UPDATE SET
               external_url = excluded.external_url,
               specs_json = excluded.specs_json,
               observed_at = datetime('now'),
               active = 1`,
          ).bind(
            skuId,
            SOURCE_ID,
            `${year}:${make}:${model}`.slice(0, 120),
            `https://www.fueleconomy.gov/feg/findacar.shtml?searchbtn=Advanced+Search&make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&year=${year}`,
            specsJson,
          ),
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

    await advance(ctx, state);
    counters.log = logLines.join("\n");
    return counters;
  },
};

function extractTag(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>([^<]+)</${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1]!.trim());
  return out;
}

async function readState(ctx: IngestionContext): Promise<{ yearIndex: number; makeIndex: number }> {
  const row = await ctx.env.LENS_D1!.prepare("SELECT last_error FROM data_source WHERE id = ?")
    .bind(SOURCE_ID)
    .first<{ last_error: string | null }>();
  try {
    const p = JSON.parse(row?.last_error ?? "{}");
    return {
      yearIndex: typeof p.yearIndex === "number" ? p.yearIndex : 40, // start at year 2024
      makeIndex: typeof p.makeIndex === "number" ? p.makeIndex : 0,
    };
  } catch {
    return { yearIndex: 40, makeIndex: 0 };
  }
}

async function advance(ctx: IngestionContext, s: { yearIndex: number; makeIndex: number }): Promise<void> {
  const next = { yearIndex: s.yearIndex, makeIndex: s.makeIndex + 1 };
  if (next.makeIndex >= POPULAR_MAKES.length) {
    next.makeIndex = 0;
    next.yearIndex -= 1;
    if (next.yearIndex < 0) next.yearIndex = 40; // loop back to recent
  }
  await ctx.env.LENS_D1!.prepare("UPDATE data_source SET last_error = ? WHERE id = ?")
    .bind(JSON.stringify(next), SOURCE_ID)
    .run();
}