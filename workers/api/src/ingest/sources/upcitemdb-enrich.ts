// IMPROVEMENT_PLAN_V2 A-S23 — UPCitemdb cross-retailer enrichment.
// Free trial endpoint: GET https://api.upcitemdb.com/prod/trial/lookup?upc=<N>
// Returns per-UPC: title, brand, model, dimensions, weight, category,
// lowest/highest recorded price, image URLs, and merchant offers with
// current prices from multiple retailers.
//
// Lens uses this to:
// - Enrich under-imaged sku_catalog rows (image_url population)
// - Record cross-retailer prices in sku_source_link + price_history
//   so triangulated_price actually has N>1 sources for many SKUs
// - Bridge wikidata/fda510k/off SKUs that happen to share a UPC.
//
// Rate: ~1 req / 6s on free trial. Per run we touch 4 SKUs.

import type { DatasetIngester, IngestionContext, IngestionReport } from "../framework.js";
import { ensureBrands } from "../framework.js";

const SOURCE_ID = "upcitemdb";
const PER_RUN = 4;

interface UPCOffer {
  merchant?: string; domain?: string; price?: number; list_price?: number;
  currency?: string; link?: string; availability?: string;
}
interface UPCItem {
  ean?: string; upc?: string; title?: string; brand?: string; model?: string;
  color?: string; size?: string; dimension?: string; weight?: string;
  category?: string; images?: string[]; offers?: UPCOffer[];
  lowest_recorded_price?: number; highest_recorded_price?: number;
}
interface UPCResp { code?: string; total?: number; items?: UPCItem[] }

export const upcitemdbEnrichIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 120_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = { rowsSeen: 0, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };
    if (!ctx.env.LENS_D1) return counters;

    // SKUs with a UPC (or EAN used as UPC) that haven't been enriched yet,
    // i.e. no upcitemdb source_link and/or no image_url.
    const { results } = await ctx.env.LENS_D1.prepare(
      `SELECT sc.id, COALESCE(sc.upc, sc.ean, sc.gtin) AS code
         FROM sku_catalog sc
    LEFT JOIN sku_source_link ssl
           ON ssl.sku_id = sc.id AND ssl.source_id = 'upcitemdb'
        WHERE ssl.sku_id IS NULL
          AND COALESCE(sc.upc, sc.ean, sc.gtin) IS NOT NULL
          AND LENGTH(COALESCE(sc.upc, sc.ean, sc.gtin)) BETWEEN 8 AND 14
          AND sc.status = 'active'
        ORDER BY sc.last_refreshed_at DESC
        LIMIT ?`,
    ).bind(PER_RUN).all<{ id: string; code: string }>();

    const rows = results ?? [];
    counters.rowsSeen = rows.length;
    if (rows.length === 0) {
      counters.log = "no UPC-bearing SKUs to enrich";
      return counters;
    }

    const brandMap = new Map<string, string>();
    const stmts: unknown[] = [];
    // Track merchants seen in THIS run so we insert their synthetic
    // data_source rows BEFORE the main batch. D1 batch() runs all
    // statements in a single transaction but FK checks fire per-row
    // at insert time, so the parent row has to exist already.
    const merchantSeen = new Map<string, { label: string; link?: string; domain?: string }>();

    for (const r of rows) {
      if (ctx.signal.aborted) break;
      let body: UPCResp;
      try {
        const res = await fetch(
          `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(r.code)}`,
          {
            headers: {
              "User-Agent": "LensBot/1.0 (welfare audit; github.com/FelipeMAffonso/lens)",
              Accept: "application/json",
            },
            signal: ctx.signal,
          },
        );
        if (res.status === 429 || res.status === 403) {
          counters.errors.push(`${r.code}: rate-limited ${res.status}`);
          break; // stop early on rate limit
        }
        if (!res.ok) { counters.errors.push(`${r.code}: http ${res.status}`); continue; }
        body = (await res.json()) as UPCResp;
      } catch (err) {
        counters.errors.push(`${r.code}: ${(err as Error).message}`);
        continue;
      }

      const item = body.items?.[0];
      if (!item) { counters.rowsSkipped++; continue; }

      if (item.brand) {
        const slug = item.brand.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
        if (slug) brandMap.set(slug, item.brand);
      }

      // Update base sku_catalog row with image + maybe brand if we're still missing.
      stmts.push(
        ctx.env.LENS_D1!.prepare(
          `UPDATE sku_catalog SET
             image_url = COALESCE(image_url, ?),
             brand_slug = COALESCE(NULLIF(brand_slug, 'unknown'), ?),
             specs_json = json_patch(COALESCE(specs_json, '{}'), ?)
           WHERE id = ?`,
        ).bind(
          item.images?.[0] ?? null,
          item.brand ? item.brand.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60) : null,
          JSON.stringify({
            category: item.category,
            dimension: item.dimension,
            weight: item.weight,
            color: item.color,
            size: item.size,
            lowestPrice: item.lowest_recorded_price,
            highestPrice: item.highest_recorded_price,
          }),
          r.id,
        ),
      );

      // Record a per-merchant price observation for every listed offer.
      // Each `upcitemdb:<merchant>` pseudo-source needs a data_source row
      // to satisfy sku_source_link.source_id FK. We insert-or-ignore the
      // row synthetically the first time we see each merchant — this is
      // what lets triangulation see 2-5 retailer prices per UPC'd SKU.
      const offers = item.offers ?? [];
      const observed = new Date().toISOString().slice(0, 19);
      for (const off of offers.slice(0, 6)) {
        if (off.price == null) continue;
        const priceCents = Math.round(off.price * 100);
        const merchantSlug = (off.domain ?? off.merchant ?? "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
        const merchantSourceId = `upcitemdb:${merchantSlug}`;
        // Remember this merchant for the pre-batch data_source upsert.
        if (!merchantSeen.has(merchantSourceId)) {
          merchantSeen.set(merchantSourceId, {
            label: off.merchant ?? off.domain ?? merchantSlug,
            link: off.link,
            domain: off.domain,
          });
        }
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO sku_source_link (sku_id, source_id, external_id, external_url, specs_json, price_cents, currency, observed_at, confidence, active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0.7, 1)
             ON CONFLICT(sku_id, source_id, external_id) DO UPDATE SET
               external_url = excluded.external_url,
               price_cents = excluded.price_cents,
               specs_json = excluded.specs_json,
               observed_at = excluded.observed_at,
               active = 1`,
          ).bind(
            r.id, merchantSourceId, `${merchantSlug}:${r.code}`,
            off.link ?? null,
            JSON.stringify({ merchant: off.merchant, domain: off.domain, listPrice: off.list_price, availability: off.availability }).slice(0, 2000),
            priceCents, off.currency || "USD", observed,
          ),
        );
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT OR IGNORE INTO price_history (sku_id, source_id, observed_at, price_cents, currency, on_sale, sale_pct)
             VALUES (?, ?, ?, ?, ?, 0, NULL)`,
          ).bind(r.id, merchantSourceId, observed, priceCents, off.currency || "USD"),
        );
      }

      // One row from upcitemdb itself so we record that we touched this SKU.
      stmts.push(
        ctx.env.LENS_D1!.prepare(
          `INSERT INTO sku_source_link (sku_id, source_id, external_id, external_url, specs_json, observed_at, confidence, active)
           VALUES (?, ?, ?, ?, ?, datetime('now'), 0.8, 1)
           ON CONFLICT(sku_id, source_id, external_id) DO UPDATE SET
             specs_json = excluded.specs_json,
             observed_at = excluded.observed_at,
             active = 1`,
        ).bind(
          r.id, SOURCE_ID, r.code,
          `https://www.upcitemdb.com/upc/${encodeURIComponent(r.code)}`,
          JSON.stringify({ title: item.title, brand: item.brand, images: item.images, category: item.category }).slice(0, 4000),
        ),
      );
      counters.rowsUpserted++;
    }

    try { await ensureBrands(ctx.env, brandMap); } catch (err) {
      if (counters.errors.length < 5) counters.errors.push(`ensureBrands: ${(err as Error).message}`);
    }
    // Ensure every synthetic `upcitemdb:<merchant>` pseudo-source exists in
    // data_source so the batched sku_source_link inserts satisfy the FK.
    // Must happen before the main batch — D1 FK checks fire per-row.
    if (merchantSeen.size > 0) {
      const preBatch: unknown[] = [];
      for (const [id, meta] of merchantSeen) {
        preBatch.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT OR IGNORE INTO data_source (id, name, type, base_url, status, cadence_minutes, description, created_at)
             VALUES (?, ?, 'scrape', ?, 'derived', 1440, ?, datetime('now'))`,
          ).bind(
            id,
            `UPCitemdb → ${meta.label}`.slice(0, 120),
            meta.link ?? `https://${meta.domain ?? id.replace(/^upcitemdb:/, "")}`,
            `Cross-retailer price observation from UPCitemdb for ${meta.label}. Derived pseudo-source.`.slice(0, 400),
          ),
        );
      }
      try {
        await (ctx.env.LENS_D1 as unknown as { batch(s: unknown[]): Promise<unknown[]> }).batch(preBatch);
      } catch (err) {
        if (counters.errors.length < 5) counters.errors.push(`merchant-prebatch: ${(err as Error).message}`);
      }
    }
    if (stmts.length > 0) {
      try {
        await (ctx.env.LENS_D1 as unknown as { batch(s: unknown[]): Promise<unknown[]> }).batch(stmts);
      } catch (err) {
        counters.errors.push(`batch: ${(err as Error).message}`);
      }
    }
    counters.log = `enriched=${counters.rowsUpserted} skipped=${counters.rowsSkipped} errs=${counters.errors.length}`;
    return counters;
  },
};
