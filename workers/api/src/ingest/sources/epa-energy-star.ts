// IMPROVEMENT_PLAN_V2 A6 — EPA Energy Star ingester.
//
// data.energystar.gov is a Socrata Open-Data portal. Each certified-product
// category has its own dataset: TVs, refrigerators, dishwashers, monitors,
// washing machines, dryers, computers, laptops, HVAC, water heaters, etc.
// A Socrata endpoint returns paginated JSON with `$limit` and `$offset`.
//
// We seed the 10 highest-volume appliance categories and iterate them in
// round-robin. Each per-run fetches 1000 rows from the current category.

import type { Env } from "../../index.js";
import { ensureBrands, type DatasetIngester, type IngestionContext, type IngestionReport } from "../framework.js";

const SOURCE_ID = "epa-energy-star";

interface EnergyStarDataset {
  resourceId: string;    // Socrata resource id
  category: string;       // internal category slug
  nameField: string;      // column for model name
  brandField: string;     // column for brand
}

// Subset of the Energy Star product-category datasets. These five alone
// cover ~300K products.
const DATASETS: EnergyStarDataset[] = [
  { resourceId: "j7nq-iepp", category: "televisions",      nameField: "model_number",   brandField: "brand_name" },
  { resourceId: "xvpf-7zcs", category: "refrigerators",    nameField: "model_number",   brandField: "brand_name" },
  { resourceId: "ptuu-izng", category: "dishwashers",      nameField: "model_number",   brandField: "brand_name" },
  { resourceId: "fi9n-xkf3", category: "monitors",         nameField: "model_name",     brandField: "brand_name" },
  { resourceId: "2g7i-etws", category: "laptops",          nameField: "model_name",     brandField: "brand_name" },
];

const PAGE_SIZE = 1000;

export const epaEnergyStarIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 240_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = { rowsSeen: 0, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };
    const logLines: string[] = [];

    const state = await readState(ctx.env);
    const ds = DATASETS[state.datasetIndex % DATASETS.length]!;
    const offset = state.offset;
    const url = `https://data.energystar.gov/resource/${ds.resourceId}.json?$limit=${PAGE_SIZE}&$offset=${offset}`;
    logLines.push(`dataset=${ds.category} offset=${offset}`);

    let rows: Record<string, string>[] = [];
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "LensBot/1.0" },
        signal: ctx.signal,
      });
      if (!res.ok) throw new Error(`http ${res.status}`);
      rows = (await res.json()) as Record<string, string>[];
    } catch (err) {
      counters.errors.push((err as Error).message);
      counters.log = logLines.join("\n");
      return counters;
    }
    counters.rowsSeen = rows.length;
    logLines.push(`rows returned: ${rows.length}`);

    const brands = new Map<string, string>();
    for (const r of rows) {
      const raw = (r[ds.brandField] ?? r.brand_name ?? r.manufacturer ?? "").trim();
      const slug = raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
      if (!brands.has(slug)) brands.set(slug, raw || slug);
    }
    await ensureBrands(ctx.env, brands);

    const BATCH = 12;
    for (let i = 0; i < rows.length; i += BATCH) {
      if (ctx.signal.aborted) break;
      const chunk = rows.slice(i, i + BATCH);
      const stmts: unknown[] = [];
      for (const r of chunk) {
        const n = normalize(r, ds);
        if (!n) {
          counters.rowsSkipped++;
          continue;
        }
        stmts.push(upsertSku(ctx.env, n));
        stmts.push(upsertSourceLink(ctx.env, n));
      }
      if (stmts.length === 0) continue;
      try {
        await (ctx.env.LENS_D1 as unknown as { batch(s: unknown[]): Promise<unknown[]> }).batch(stmts);
        counters.rowsUpserted += stmts.length / 2;
      } catch (err) {
        if (counters.errors.length < 10) counters.errors.push(`batch: ${(err as Error).message}`);
      }
      if ((i / BATCH) % 20 === 0) await ctx.progress({});
    }

    // Advance round-robin.
    const exhausted = rows.length < PAGE_SIZE;
    const next = exhausted
      ? { datasetIndex: state.datasetIndex + 1, offset: 0 }
      : { datasetIndex: state.datasetIndex, offset: offset + rows.length };
    await writeState(ctx.env, next);
    logLines.push(`next: dataset#${next.datasetIndex} offset=${next.offset}`);

    counters.log = logLines.join("\n");
    return counters;
  },
};

interface Normalized {
  skuId: string;
  brand: string;
  model: string;
  name: string;
  category: string;
  specsJson: string;
  externalId: string;
  externalUrl: string;
}

function normalize(r: Record<string, string>, ds: EnergyStarDataset): Normalized | null {
  const brandRaw = r[ds.brandField] ?? r.brand_name ?? r.manufacturer ?? "";
  const model = r[ds.nameField] ?? r.model_number ?? r.model_name ?? "";
  if (!brandRaw || !model) return null;
  const brand = brandRaw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const externalId = `${ds.resourceId}:${model}`;
  const skuId = `energy-star:${brand}:${model.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const name = `${brandRaw} ${model}`.trim();
  const specsJson = JSON.stringify(Object.fromEntries(
    Object.entries(r).filter(([_, v]) => typeof v === "string" && v.length < 500),
  ));
  return {
    skuId,
    brand,
    model: model.slice(0, 120),
    name: name.slice(0, 200),
    category: ds.category,
    specsJson,
    externalId,
    externalUrl: `https://www.energystar.gov/productfinder/product/certified-${ds.category}/results?formId=${encodeURIComponent(model)}`,
  };
}

function upsertSku(env: Env, n: Normalized) {
  return env.LENS_D1!.prepare(
    `INSERT INTO sku_catalog (id, canonical_name, brand_slug, model_code, specs_json, first_seen_at, last_refreshed_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       canonical_name = excluded.canonical_name,
       specs_json = excluded.specs_json,
       last_refreshed_at = datetime('now')`,
  ).bind(n.skuId, n.name, n.brand, n.model, n.specsJson);
}

function upsertSourceLink(env: Env, n: Normalized) {
  return env.LENS_D1!.prepare(
    `INSERT INTO sku_source_link (sku_id, source_id, external_id, external_url, specs_json, observed_at, confidence, active)
     VALUES (?, ?, ?, ?, ?, datetime('now'), 0.98, 1)
     ON CONFLICT(sku_id, source_id, external_id) DO UPDATE SET
       external_url = excluded.external_url,
       specs_json = excluded.specs_json,
       observed_at = datetime('now'),
       active = 1`,
  ).bind(n.skuId, SOURCE_ID, n.externalId, n.externalUrl, n.specsJson);
}

// --- state blob (stashed in last_error) ---
async function readState(env: Env): Promise<{ datasetIndex: number; offset: number }> {
  const row = await env.LENS_D1!.prepare("SELECT last_error FROM data_source WHERE id = ?")
    .bind(SOURCE_ID)
    .first<{ last_error: string | null }>();
  try {
    const p = JSON.parse(row?.last_error ?? "{}");
    return {
      datasetIndex: typeof p.datasetIndex === "number" ? p.datasetIndex : 0,
      offset: typeof p.offset === "number" ? p.offset : 0,
    };
  } catch {
    return { datasetIndex: 0, offset: 0 };
  }
}

async function writeState(env: Env, s: { datasetIndex: number; offset: number }): Promise<void> {
  await env.LENS_D1!.prepare("UPDATE data_source SET last_error = ? WHERE id = ?")
    .bind(JSON.stringify(s), SOURCE_ID)
    .run();
}