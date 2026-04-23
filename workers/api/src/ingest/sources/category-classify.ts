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
const WIKIDATA_CLASS_TO_GPT: Record<string, string> = {
  "smartphone": "gpt:electronics-communications-telephony-mobile-phones-mobile-phones",
  "laptop": "gpt:electronics-computers-laptops",
  "tablet-computer": "gpt:electronics-computers-tablets",
  "personal-computer": "gpt:electronics-computers-desktops",
  "server": "gpt:electronics-computers-servers",
  "printer": "gpt:electronics-print-scan-fax-&-copy-printers-copiers-&-fax-machines-printers",
  "television": "gpt:electronics-video-televisions",
  "camera": "gpt:cameras-&-optics-cameras",
  "digital-camera": "gpt:cameras-&-optics-cameras-digital-cameras",
  "video-camera": "gpt:cameras-&-optics-camera-accessories",
  "headphones": "gpt:electronics-audio-audio-components-headphones",
  "earbuds": "gpt:electronics-audio-audio-components-headphones",
  "speaker": "gpt:electronics-audio-audio-components-speakers",
  "soundbar": "gpt:electronics-audio-audio-components-speakers",
  "turntable": "gpt:electronics-audio-audio-components-turntables",
  "coffee-maker": "gpt:home-&-garden-kitchen-&-dining-kitchen-appliances-coffee-makers-&-espresso-machines",
  "espresso-machine": "gpt:home-&-garden-kitchen-&-dining-kitchen-appliances-coffee-makers-&-espresso-machines",
  "blender": "gpt:home-&-garden-kitchen-&-dining-kitchen-appliances-blenders",
  "toaster": "gpt:home-&-garden-kitchen-&-dining-kitchen-appliances-toasters-&-grills",
  "microwave-oven": "gpt:home-&-garden-kitchen-&-dining-kitchen-appliances-microwave-ovens",
  "oven": "gpt:home-&-garden-kitchen-&-dining-kitchen-appliances-ovens",
  "refrigerator": "gpt:home-&-garden-household-appliances-refrigerators",
  "dishwasher": "gpt:home-&-garden-household-appliances-dishwashers",
  "washing-machine": "gpt:home-&-garden-household-appliances-laundry-appliances-washing-machines",
  "dryer": "gpt:home-&-garden-household-appliances-laundry-appliances-dryers",
  "vacuum-cleaner": "gpt:home-&-garden-household-appliances-floor-&-carpet-dryers",
  "robotic-vacuum-cleaner": "gpt:home-&-garden-household-appliances-floor-&-carpet-dryers",
  "router": "gpt:electronics-networking-wireless-routers",
  "game-console": "gpt:electronics-video-game-consoles",
  "video-game": "gpt:electronics-video-video-games",
  "gaming-controller": "gpt:electronics-video-video-game-consoles-accessories",
  "keyboard": "gpt:electronics-computers-computer-components-input-devices-keyboards",
  "computer-mouse": "gpt:electronics-computers-computer-components-input-devices-mice-&-trackballs",
  "monitor": "gpt:electronics-video-projectors",
  "backpack": "gpt:luggage-&-bags-backpacks",
  "suitcase": "gpt:luggage-&-bags-luggage-&-luggage-accessories",
  "shoe": "gpt:apparel-&-accessories-shoes",
  "running-shoe": "gpt:apparel-&-accessories-shoes-athletic-shoes",
  "watch": "gpt:apparel-&-accessories-jewelry-watches",
  "eyeglasses": "gpt:apparel-&-accessories-vision-care-eyewear",
  "sunglasses": "gpt:apparel-&-accessories-vision-care-sunglasses",
  "bicycle-helmet": "gpt:sporting-goods-outdoor-recreation-cycling-cycling-helmets",
  "baby-car-seat": "gpt:baby-&-toddler-baby-transport-accessories-car-seat-accessories",
  "stroller": "gpt:baby-&-toddler-baby-transport-baby-strollers",
  "toy": "gpt:toys-&-games-toys",
};

const PREFIX_DEFAULTS: Array<{ prefix: string; code: string }> = [
  { prefix: "fda510k:", code: "gpt:health-&-beauty-health-care" },
  { prefix: "steam:", code: "gpt:arts-&-entertainment-hobbies-&-creative-arts-toys-pc-games" },
  { prefix: "usda:", code: "gpt:food-beverages-&-tobacco-food-items" },
  { prefix: "off:", code: "gpt:food-beverages-&-tobacco-food-items" },
  { prefix: "obf:", code: "gpt:health-&-beauty-personal-care" },
  { prefix: "cisa-kev:", code: "gpt:electronics" },
  { prefix: "slickdeals:", code: "gpt:arts-&-entertainment" },
  { prefix: "dealnews:", code: "gpt:arts-&-entertainment" },
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

      if (!code) { counters.rowsSkipped++; continue; }

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
