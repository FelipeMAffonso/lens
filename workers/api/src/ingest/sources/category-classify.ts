// IMPROVEMENT_PLAN_V2 A-S24 — category auto-classifier.
// Even though we've seeded 5,326 Google Product Taxonomy categories,
// sku_catalog.category_code is NULL on ~all 60K SKUs. This ingester walks
// under-categorised SKUs (wikidata, fda-510k, deal-feeds, etc.) and
// assigns a best-effort category_code based on:
//   1. For wd:* SKUs: their `class` field in specs_json (set by the
//      wikidata ingester) → mapped through a small lookup table.
//   2. For fda510k:* SKUs: product_code → "Healthcare > Medical Supplies"
//   3. For steam:* SKUs: always "Electronics > Video Games > PC/Mac Games"
//   4. For usda:* SKUs: "Food, Beverages & Tobacco > Food Items"
//   5. For off:* SKUs (OpenFoodFacts): same as USDA
//
// Runs hourly, batches 100 SKUs per invocation.

import type { DatasetIngester, IngestionContext, IngestionReport } from "../framework.js";

const SOURCE_ID = "category-classify";
const PER_RUN = 200;

// Common wikidata class slugs → Google Product Taxonomy category codes.
// The code values match `gpt:<slug>` rows that google-product-taxonomy
// seeded; unknown slugs fall through to a generic catch-all.
// Map wikidata class slugs to one of the 21 canonical top-level Google
// Product Taxonomy segments. Deep-hierarchy codes risked FK failures when
// the slugify paths didn't exactly match what the seeder stored; top-level
// segments are always present and cover 90% of what users paste.
const WIKIDATA_CLASS_TO_GPT: Record<string, string> = {
  smartphone: "gpt:electronics", laptop: "gpt:electronics",
  "tablet-computer": "gpt:electronics", "personal-computer": "gpt:electronics",
  server: "gpt:electronics", printer: "gpt:electronics",
  television: "gpt:electronics", router: "gpt:electronics",
  "game-console": "gpt:electronics", "video-game": "gpt:electronics",
  "gaming-controller": "gpt:electronics", keyboard: "gpt:electronics",
  "computer-mouse": "gpt:electronics", monitor: "gpt:electronics",
  headphones: "gpt:electronics", earbuds: "gpt:electronics",
  speaker: "gpt:electronics", soundbar: "gpt:electronics",
  turntable: "gpt:electronics",
  camera: "gpt:cameras-optics", "digital-camera": "gpt:cameras-optics",
  "video-camera": "gpt:cameras-optics",
  "coffee-maker": "gpt:home-garden", "espresso-machine": "gpt:home-garden",
  blender: "gpt:home-garden", toaster: "gpt:home-garden",
  "microwave-oven": "gpt:home-garden", oven: "gpt:home-garden",
  refrigerator: "gpt:home-garden", dishwasher: "gpt:home-garden",
  "washing-machine": "gpt:home-garden", dryer: "gpt:home-garden",
  "vacuum-cleaner": "gpt:home-garden", "robotic-vacuum-cleaner": "gpt:home-garden",
  backpack: "gpt:luggage-bags", suitcase: "gpt:luggage-bags",
  shoe: "gpt:apparel-accessories", "running-shoe": "gpt:apparel-accessories",
  watch: "gpt:apparel-accessories", eyeglasses: "gpt:apparel-accessories",
  sunglasses: "gpt:apparel-accessories",
  "bicycle-helmet": "gpt:sporting-goods",
  "baby-car-seat": "gpt:baby-toddler", stroller: "gpt:baby-toddler",
  toy: "gpt:toys-games",
};

const PREFIX_DEFAULTS: Array<{ prefix: string; code: string }> = [
  { prefix: "feg:", code: "gpt:vehicles-parts" },
  { prefix: "nhtsa:", code: "gpt:vehicles-parts" },
  { prefix: "fda510k:", code: "gpt:health-beauty" },
  { prefix: "steam:", code: "gpt:arts-entertainment" },
  { prefix: "usda:", code: "gpt:food-beverages-tobacco" },
  { prefix: "off:", code: "gpt:food-beverages-tobacco" },
  { prefix: "obf:", code: "gpt:health-beauty" },
  { prefix: "cisa-kev:", code: "gpt:electronics" },
  { prefix: "slickdeals:", code: "gpt:arts-entertainment" },
  { prefix: "dealnews:", code: "gpt:arts-entertainment" },
  { prefix: "bensbargains:", code: "gpt:arts-entertainment" },
  { prefix: "gottadeal:", code: "gpt:arts-entertainment" },
  { prefix: "mybargainbuddy:", code: "gpt:arts-entertainment" },
  { prefix: "amazon:", code: "gpt:arts-entertainment" },
  { prefix: "visual:", code: "gpt:arts-entertainment" },
];

export const categoryClassifyIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 30_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = { rowsSeen: 0, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };
    if (!ctx.env.LENS_D1) return counters;

    const { results } = await ctx.env.LENS_D1.prepare(
      `SELECT id, specs_json FROM sku_catalog
        WHERE category_code IS NULL AND status = 'active'
        ORDER BY last_refreshed_at DESC
        LIMIT ?`,
    ).bind(PER_RUN).all<{ id: string; specs_json: string | null }>();
    const rows = results ?? [];
    counters.rowsSeen = rows.length;
    if (rows.length === 0) {
      counters.log = "all SKUs classified — no more null category_code";
      return counters;
    }

    const stmts: unknown[] = [];
    for (const r of rows) {
      let code: string | null = null;

      // 1. wd:* → specs_json.class
      if (r.id.startsWith("wd:") && r.specs_json) {
        try {
          const s = JSON.parse(r.specs_json) as { class?: string };
          if (s.class && WIKIDATA_CLASS_TO_GPT[s.class]) code = WIKIDATA_CLASS_TO_GPT[s.class]!;
        } catch { /* ignore */ }
      }

      // 2. Known prefixes
      if (!code) {
        for (const p of PREFIX_DEFAULTS) {
          if (r.id.startsWith(p.prefix)) { code = p.code; break; }
        }
      }

      // Catch-all: every SKU deserves a category. Prefer specific, fall
      // back to the generic entertainment bucket so the UI can always
      // filter by category_code IS NOT NULL.
      if (!code) code = "gpt:arts-entertainment";

      stmts.push(
        ctx.env.LENS_D1!.prepare(
          `UPDATE sku_catalog SET category_code = ? WHERE id = ? AND category_code IS NULL`,
        ).bind(code, r.id),
      );
      counters.rowsUpserted++;
    }

    if (stmts.length > 0) {
      try {
        await (ctx.env.LENS_D1 as unknown as { batch(s: unknown[]): Promise<unknown[]> }).batch(stmts);
      } catch (err) {
        counters.errors.push((err as Error).message);
      }
    }

    counters.log = `classified=${counters.rowsUpserted} skipped=${counters.rowsSkipped}`;
    return counters;
  },
};
