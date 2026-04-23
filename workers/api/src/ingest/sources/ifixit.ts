// IMPROVEMENT_PLAN_V2 A-S18 — iFixit repairability ingester.
// Free public API. No auth needed for the /api/2.0/wikis and /categories
// endpoints. Harvests repairability scores for category/device pages and
// links them to sku_catalog via brand+model token match.

import { ensureBrands, type DatasetIngester, type IngestionContext, type IngestionReport } from "../framework.js";

const SOURCE_ID = "ifixit";
const PAGE_LIMIT = 100;

interface IFixitWiki {
  wikiid: string | number;
  title: string;
  url: string;
  summary: string;
  image?: { medium?: string };
  difficulty?: string;
  repairability?: number;
  type?: string;
}

export const ifixitIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 120_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = { rowsSeen: 0, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };
    const offset = await readOffset(ctx);
    const url = `https://www.ifixit.com/api/2.0/wikis/CATEGORY?offset=${offset}&limit=${PAGE_LIMIT}`;

    let wikis: IFixitWiki[] = [];
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "LensBot/1.0 (academic)", Accept: "application/json" },
        signal: ctx.signal,
      });
      if (!res.ok) throw new Error(`http ${res.status}`);
      wikis = (await res.json()) as IFixitWiki[];
    } catch (err) {
      counters.errors.push((err as Error).message);
      return counters;
    }
    counters.rowsSeen = wikis.length;

    await ensureBrands(ctx.env, new Map([["ifixit", "iFixit"]]));

    const BATCH = 15;
    for (let i = 0; i < wikis.length; i += BATCH) {
      if (ctx.signal.aborted) break;
      const stmts: unknown[] = [];
      for (const w of wikis.slice(i, i + BATCH)) {
        const wid = w.wikiid == null ? "" : String(w.wikiid);
        if (!wid || !w.title) {
          counters.rowsSkipped++;
          continue;
        }
        const skuId = `ifixit:${wid}`;
        const specsJson = JSON.stringify({
          ifixit_wiki_id: wid,
          type: w.type ?? null,
          difficulty: w.difficulty ?? null,
          repairability: w.repairability ?? null,
          summary: w.summary ?? null,
        });
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO sku_catalog (id, canonical_name, brand_slug, model_code, image_url, summary, specs_json, first_seen_at, last_refreshed_at)
             VALUES (?, ?, 'ifixit', ?, ?, ?, ?, datetime('now'), datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
               canonical_name = excluded.canonical_name,
               specs_json = excluded.specs_json,
               last_refreshed_at = datetime('now')`,
          ).bind(
            skuId,
            w.title.slice(0, 200),
            wid.slice(0, 120),
            w.image?.medium ?? null,
            (w.summary ?? "").slice(0, 1000),
            specsJson,
          ),
        );
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO sku_source_link (sku_id, source_id, external_id, external_url, specs_json, observed_at, confidence, active)
             VALUES (?, ?, ?, ?, ?, datetime('now'), 0.92, 1)
             ON CONFLICT(sku_id, source_id, external_id) DO UPDATE SET
               external_url = excluded.external_url,
               specs_json = excluded.specs_json,
               observed_at = datetime('now'),
               active = 1`,
          ).bind(skuId, SOURCE_ID, wid, w.url ?? `https://www.ifixit.com/Device/${wid}`, specsJson),
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

    await writeOffset(ctx, wikis.length === PAGE_LIMIT ? offset + PAGE_LIMIT : 0);
    return counters;
  },
};

async function readOffset(ctx: IngestionContext): Promise<number> {
  const row = await ctx.env.LENS_D1!.prepare("SELECT last_error FROM data_source WHERE id = ?")
    .bind(SOURCE_ID)
    .first<{ last_error: string | null }>();
  try {
    const p = JSON.parse(row?.last_error ?? "{}");
    return typeof p.offset === "number" ? p.offset : 0;
  } catch {
    return 0;
  }
}

async function writeOffset(ctx: IngestionContext, offset: number): Promise<void> {
  await ctx.env.LENS_D1!.prepare("UPDATE data_source SET last_error = ? WHERE id = ?")
    .bind(JSON.stringify({ offset }), SOURCE_ID)
    .run();
}