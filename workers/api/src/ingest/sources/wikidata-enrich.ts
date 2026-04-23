// IMPROVEMENT_PLAN_V2 A-S11b — Wikidata deep-enricher.
// The base `wikidata` ingester pulls 5 fields per entity (label, mfg,
// model-code, image, class). Wikidata actually has 30-100 P-value claims
// per product — weight, dimensions, materials, UPC/EAN/GTIN, country of
// origin, release date, official website, CE markings, colour, MPN,
// brand, etc. This enricher sweeps under-specced `wd:*` SKUs and pulls
// their full entity JSON so every piece of Wikidata-known spec lands on
// the sku_catalog row (promoted to dedicated columns where schema allows).
//
// Endpoint: https://www.wikidata.org/wiki/Special:EntityData/<Q>.json
// Subrequest budget: 15 entities per run (well under CF Worker limits).

import type { DatasetIngester, IngestionContext, IngestionReport } from "../framework.js";
import { ensureBrands } from "../framework.js";

const SOURCE_ID = "wikidata-enrich";
const ENTITIES_PER_RUN = 15;

// Properties we care about. Wikidata P-numbers.
const PROPS: Record<string, string> = {
  P31: "instance_of",
  P279: "subclass_of",
  P176: "manufacturer",
  P1071: "model_code",
  P18: "image",
  P1716: "brand",
  P495: "country_of_origin",
  P2048: "height",
  P2049: "width",
  P2067: "mass",
  P4134: "depth",
  P2665: "weight", // alternative
  P577: "publication_date",
  P571: "inception",
  P1476: "title",
  P856: "official_website",
  P6108: "mpn",
  P3916: "upc",
  P2819: "ean",
  P3771: "gtin",
  P625: "coordinates",
  P17: "country",
  P1075: "materials",
  P805: "statement_about",
  P462: "color",
  P4092: "battery_life",
  P1366: "replaced_by",
  P1365: "replaces",
  P2897: "cpu_frequency",
  P2928: "ram",
  P3252: "storage",
  P2746: "display_resolution",
  P1909: "fcc_id",
  P275: "copyright_license",
  P275_alt: "license",
};

interface WdEntity {
  entities?: Record<string, {
    labels?: Record<string, { value?: string }>;
    claims?: Record<string, Array<{
      mainsnak?: { datavalue?: { value?: unknown; type?: string } };
    }>>;
  }>;
}

interface ExtractedClaims {
  [key: string]: string | number | boolean | null;
}

export const wikidataEnrichIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 120_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = { rowsSeen: 0, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };
    if (!ctx.env.LENS_D1) return counters;

    // Pick under-specced wd:* SKUs: small specs_json or no UPC/EAN/asin.
    const { results } = await ctx.env.LENS_D1.prepare(
      `SELECT id, specs_json FROM sku_catalog
        WHERE id LIKE 'wd:%'
          AND (specs_json IS NULL OR LENGTH(specs_json) < 200 OR upc IS NULL)
          AND status = 'active'
        ORDER BY last_refreshed_at ASC
        LIMIT ?`,
    ).bind(ENTITIES_PER_RUN).all<{ id: string; specs_json: string | null }>();

    const rows = results ?? [];
    counters.rowsSeen = rows.length;
    if (rows.length === 0) {
      counters.log = "nothing under-specced — all wd:* SKUs enriched";
      return counters;
    }

    // Fetch entities in parallel.
    const pending = rows.map(async (r) => {
      const qid = r.id.replace(/^wd:/, "");
      try {
        const res = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`, {
          headers: {
            "User-Agent": "LensBot/1.0 (welfare-audit research; github.com/FelipeMAffonso/lens)",
            Accept: "application/json",
          },
          signal: ctx.signal,
        });
        if (!res.ok) return { r, claims: null, err: `http ${res.status}` };
        const body = (await res.json()) as WdEntity;
        const ent = body.entities?.[qid];
        if (!ent) return { r, claims: null, err: "no_entity" };
        return { r, claims: extractClaims(ent), err: null };
      } catch (err) {
        return { r, claims: null, err: (err as Error).message };
      }
    });

    const resolved = await Promise.all(pending);
    const brandMap = new Map<string, string>();
    const stmts: unknown[] = [];

    for (const { r, claims, err } of resolved) {
      if (!claims) {
        if (err && counters.errors.length < 10) counters.errors.push(`${r.id}: ${err}`);
        counters.rowsSkipped++;
        continue;
      }

      const brandLabel = (claims["brand_label"] as string | null)
        ?? (claims["manufacturer_label"] as string | null);
      if (brandLabel) {
        const slug = brandLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
        if (slug) brandMap.set(slug, brandLabel);
      }

      // Merge claims into existing specs_json.
      let existing: Record<string, unknown> = {};
      try { if (r.specs_json) existing = JSON.parse(r.specs_json); } catch { /* ignore */ }
      const merged = { ...existing, ...claims };
      const mergedJson = JSON.stringify(merged).slice(0, 16_000);

      const upc = (claims["upc"] as string | null) ?? null;
      const ean = (claims["ean"] as string | null) ?? null;
      const gtin = (claims["gtin"] as string | null) ?? null;
      const fccId = (claims["fcc_id"] as string | null) ?? null;
      const modelCode = (claims["model_code"] as string | null) ?? null;
      const imageUrl = (claims["image"] as string | null) ?? null;
      const brandSlug = brandLabel
        ? brandLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || null
        : null;

      stmts.push(
        ctx.env.LENS_D1!.prepare(
          `UPDATE sku_catalog SET
             specs_json = ?,
             upc = COALESCE(?, upc),
             ean = COALESCE(?, ean),
             gtin = COALESCE(?, gtin),
             fcc_id = COALESCE(?, fcc_id),
             model_code = COALESCE(?, model_code),
             image_url = COALESCE(?, image_url),
             brand_slug = COALESCE(?, brand_slug),
             last_refreshed_at = datetime('now')
           WHERE id = ?`,
        ).bind(mergedJson, upc, ean, gtin, fccId, modelCode, imageUrl, brandSlug, r.id),
      );
      counters.rowsUpserted++;
    }

    try { await ensureBrands(ctx.env, brandMap); } catch (err) {
      if (counters.errors.length < 5) counters.errors.push(`ensureBrands: ${(err as Error).message}`);
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

// --- Claim extractor ---

function extractClaims(
  ent: NonNullable<NonNullable<WdEntity["entities"]>[string]>,
): ExtractedClaims {
  const out: ExtractedClaims = {};
  const claims = ent.claims ?? {};
  for (const [pid, alias] of Object.entries(PROPS)) {
    const rawPid = pid.replace(/_alt$/, "");
    const statements = claims[rawPid];
    if (!statements || !statements[0]) continue;
    const dv = statements[0].mainsnak?.datavalue;
    if (!dv) continue;
    const v = dv.value;
    const type = dv.type;
    if (type === "string" && typeof v === "string") {
      out[alias] = v;
    } else if (type === "monolingualtext" && v && typeof v === "object") {
      const mt = v as { text?: string };
      if (mt.text) out[alias] = mt.text;
    } else if (type === "time" && v && typeof v === "object") {
      const tt = v as { time?: string };
      if (tt.time) out[alias] = tt.time.replace(/^\+/, "").slice(0, 10);
    } else if (type === "quantity" && v && typeof v === "object") {
      const qq = v as { amount?: string; unit?: string };
      if (qq.amount) {
        const n = parseFloat(qq.amount);
        if (Number.isFinite(n)) out[alias] = n;
      }
    } else if (type === "wikibase-entityid" && v && typeof v === "object") {
      const ee = v as { id?: string };
      if (ee.id) {
        out[alias + "_qid"] = ee.id;
        // Resolve label from entity's own labels section if it's self-ref, else leave Q-id.
        const label = ent.labels?.en?.value;
        if (label && pid === "P31") out[alias + "_label"] = label;
      }
    } else if (type === "globecoordinate" && v && typeof v === "object") {
      const cc = v as { latitude?: number; longitude?: number };
      if (cc.latitude != null && cc.longitude != null) {
        out[alias] = `${cc.latitude},${cc.longitude}`;
      }
    }
  }
  return out;
}
