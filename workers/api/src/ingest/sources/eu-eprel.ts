// IMPROVEMENT_PLAN_V2 A-S26 — EU EPREL ingester (EU energy-efficiency product registry).
// ~500K products registered for EU sale with full spec sheets + energy labels.
// Public REST API: https://eprel.ec.europa.eu/api/public/product/search

import { ensureBrands, type DatasetIngester, type IngestionContext, type IngestionReport } from "../framework.js";

const SOURCE_ID = "eu-eprel";
const PAGE_SIZE = 100;

// Product groups covered by EPREL. Rotation.
const PRODUCT_GROUPS = [
  "refrigeratingappliances",
  "washingmachines2019",
  "dishwashers2019",
  "electronicdisplays",
  "householdtumbledrivers",
  "lighting",
  "spaceheaters",
  "waterheaters",
  "airconditioners",
  "vacuumcleaners",
];

interface EprelResp {
  hits?: Array<{
    productGroup?: string;
    modelIdentifier?: string;
    supplier?: { name?: string };
    energyClass?: string;
    onMarketStartDate?: string;
    eprelRegistrationNumber?: string;
    eanCodes?: string[];
    tradeNames?: string[];
  }>;
  totalHits?: number;
}

export const euEprelIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 180_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = { rowsSeen: 0, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };
    const state = await readState(ctx);
    const group = PRODUCT_GROUPS[state.groupIndex % PRODUCT_GROUPS.length]!;
    const offset = state.offset;
    const url = `https://eprel.ec.europa.eu/api/public/product/search/${group}?_sort=onMarketStartDate%20DESC&_size=${PAGE_SIZE}&_from=${offset}`;

    let body: EprelResp;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "LensBot/1.0 (felipe@lens-b1h.pages.dev)", Accept: "application/json" },
        signal: ctx.signal,
      });
      if (!res.ok) throw new Error(`http ${res.status}`);
      body = (await res.json()) as EprelResp;
    } catch (err) {
      counters.errors.push((err as Error).message);
      return counters;
    }
    const hits = body.hits ?? [];
    counters.rowsSeen = hits.length;

    const brands = new Map<string, string>();
    for (const h of hits) {
      const name = h.supplier?.name?.trim();
      if (!name) continue;
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
      if (slug && !brands.has(slug)) brands.set(slug, name);
    }
    await ensureBrands(ctx.env, brands);

    const BATCH = 12;
    for (let i = 0; i < hits.length; i += BATCH) {
      if (ctx.signal.aborted) break;
      const stmts: unknown[] = [];
      for (const h of hits.slice(i, i + BATCH)) {
        if (!h.modelIdentifier || !h.eprelRegistrationNumber) {
          counters.rowsSkipped++;
          continue;
        }
        const supplier = h.supplier?.name ?? "";
        const brandSlug = supplier.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "unknown";
        const ean = (h.eanCodes ?? [])[0] ?? null;
        const skuId = `eprel:${h.eprelRegistrationNumber}`;
        const tradeName = (h.tradeNames ?? [])[0] ?? h.modelIdentifier;
        const specsJson = JSON.stringify({
          eprel_registration: h.eprelRegistrationNumber,
          product_group: group,
          energy_class: h.energyClass ?? null,
          on_market_start: h.onMarketStartDate ?? null,
          supplier,
        });
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO sku_catalog (id, canonical_name, brand_slug, model_code, ean, specs_json, first_seen_at, last_refreshed_at)
             VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
               canonical_name = excluded.canonical_name,
               specs_json = excluded.specs_json,
               last_refreshed_at = datetime('now')`,
          ).bind(
            skuId,
            `${supplier} ${tradeName}`.trim().slice(0, 200),
            brandSlug,
            h.modelIdentifier.slice(0, 120),
            ean,
            specsJson,
          ),
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
          ).bind(
            skuId,
            SOURCE_ID,
            h.eprelRegistrationNumber,
            `https://eprel.ec.europa.eu/screen/product/${group}/${h.eprelRegistrationNumber}`,
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

    const exhausted = hits.length < PAGE_SIZE;
    await writeState(ctx, exhausted
      ? { groupIndex: state.groupIndex + 1, offset: 0 }
      : { groupIndex: state.groupIndex, offset: offset + hits.length });

    return counters;
  },
};

async function readState(ctx: IngestionContext): Promise<{ groupIndex: number; offset: number }> {
  const row = await ctx.env.LENS_D1!.prepare("SELECT last_error FROM data_source WHERE id = ?")
    .bind(SOURCE_ID)
    .first<{ last_error: string | null }>();
  try {
    const p = JSON.parse(row?.last_error ?? "{}");
    return {
      groupIndex: typeof p.groupIndex === "number" ? p.groupIndex : 0,
      offset: typeof p.offset === "number" ? p.offset : 0,
    };
  } catch {
    return { groupIndex: 0, offset: 0 };
  }
}

async function writeState(ctx: IngestionContext, s: { groupIndex: number; offset: number }): Promise<void> {
  await ctx.env.LENS_D1!.prepare("UPDATE data_source SET last_error = ? WHERE id = ?")
    .bind(JSON.stringify(s), SOURCE_ID)
    .run();
}