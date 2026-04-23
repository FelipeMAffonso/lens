// IMPROVEMENT_PLAN_V2 A8 — Wikidata consumer-product SPARQL ingester.
// Free query endpoint: https://query.wikidata.org/sparql
// Pulls rows from the P31 class "consumer product" subtree in slices.
//
// Strategy: fetch a few thousand rows per run, rotate across sub-classes
// (smartphones, laptops, headphones, coffee machines, refrigerators, TVs,
// vacuum cleaners, cars, etc.). Each row provides a Q-id, label, manufacturer,
// model-code, image (P18), and class.

import type { DatasetIngester, IngestionContext, IngestionReport } from "../framework.js";

const SOURCE_ID = "wikidata";

// Expanded Wikidata consumer-product class roster (50+). Each is a valid
// Wikidata Q-id for a "type of product" class. The ingester rotates through
// them — one class per run — so over 50 runs every category is seeded.
const CLASSES = [
  { qid: "Q3331189", slug: "smartphone" },
  { qid: "Q3962278", slug: "laptop" },
  { qid: "Q186263", slug: "headphones" },
  { qid: "Q726687", slug: "coffee-maker" },
  { qid: "Q37137", slug: "refrigerator" },
  { qid: "Q18711", slug: "television-set" },
  { qid: "Q1421086", slug: "vacuum-cleaner" },
  { qid: "Q2095", slug: "food" },
  { qid: "Q273493", slug: "espresso-machine" },
  { qid: "Q1420", slug: "car" },
  { qid: "Q1183543", slug: "e-reader" },
  { qid: "Q3966", slug: "computer-monitor" },
  { qid: "Q11367", slug: "camera" },
  { qid: "Q157815", slug: "digital-camera" },
  { qid: "Q3966", slug: "monitor" },
  { qid: "Q82753", slug: "computer" },
  { qid: "Q864572", slug: "tablet-computer" },
  { qid: "Q2487799", slug: "smartwatch" },
  { qid: "Q488481", slug: "router" },
  { qid: "Q82811", slug: "printer" },
  { qid: "Q28877", slug: "microwave-oven" },
  { qid: "Q16822979", slug: "air-purifier" },
  { qid: "Q241907", slug: "air-conditioner" },
  { qid: "Q11441", slug: "bicycle" },
  { qid: "Q1303384", slug: "electric-bicycle" },
  { qid: "Q1088", slug: "motorcycle" },
  { qid: "Q93260", slug: "bed" },
  { qid: "Q14745", slug: "chair" },
  { qid: "Q1357516", slug: "desk" },
  { qid: "Q39546", slug: "tool" },
  { qid: "Q165955", slug: "drill" },
  { qid: "Q193389", slug: "lawn-mower" },
  { qid: "Q170430", slug: "washing-machine" },
  { qid: "Q186517", slug: "dishwasher" },
  { qid: "Q185187", slug: "oven" },
  { qid: "Q18706", slug: "toaster" },
  { qid: "Q208460", slug: "blender" },
  { qid: "Q214609", slug: "kettle" },
  { qid: "Q815060", slug: "stand-mixer" },
  { qid: "Q7214", slug: "piano" },
  { qid: "Q6607", slug: "guitar" },
  { qid: "Q234262", slug: "keyboard-synth" },
  { qid: "Q4887", slug: "speaker" },
  { qid: "Q26706", slug: "soundbar" },
  { qid: "Q177413", slug: "turntable" },
  { qid: "Q213550", slug: "backpack" },
  { qid: "Q48619", slug: "suitcase" },
  { qid: "Q43196", slug: "shoe" },
  { qid: "Q1074055", slug: "running-shoe" },
  { qid: "Q1357523", slug: "watch" },
  { qid: "Q42213", slug: "eyeglasses" },
  { qid: "Q49697", slug: "sunglasses" },
  { qid: "Q157555", slug: "bicycle-helmet" },
  { qid: "Q188809", slug: "baby-car-seat" },
  { qid: "Q192142", slug: "stroller" },
  { qid: "Q11006", slug: "toy" },
];

const LIMIT = 5000; // bumped from 2000 after cursor_json fix so each run actually advances a real window

export const wikidataIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 240_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = { rowsSeen: 0, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };
    const logLines: string[] = [];
    const state = await readState(ctx);
    const cls = CLASSES[state.index % CLASSES.length]!;
    const offset = state.offset;
    logLines.push(`class=${cls.slug} offset=${offset}`);

    const sparql = `
      SELECT ?item ?itemLabel ?mfg ?mfgLabel ?modelCode ?image WHERE {
        ?item wdt:P31 wd:${cls.qid} .
        OPTIONAL { ?item wdt:P176 ?mfg . }
        OPTIONAL { ?item wdt:P1071 ?modelCode . }
        OPTIONAL { ?item wdt:P18 ?image . }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
      LIMIT ${LIMIT}
      OFFSET ${offset}
    `;
    const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`;

    let body: { results?: { bindings?: Array<Record<string, { value?: string }>> } };
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/sparql-results+json",
          "User-Agent": "LensBot/1.0 (felipe@lens-b1h.pages.dev)",
        },
        signal: ctx.signal,
      });
      if (!res.ok) throw new Error(`http ${res.status}`);
      body = (await res.json()) as typeof body;
    } catch (err) {
      counters.errors.push((err as Error).message);
      counters.log = logLines.join("\n");
      return counters;
    }
    const rows = body.results?.bindings ?? [];
    counters.rowsSeen = rows.length;

    // Upsert every unique brand FIRST so the sku_catalog FK holds.
    const uniqueBrands = new Map<string, string>();
    for (const r of rows) {
      const mfg = r.mfgLabel?.value ?? "";
      const slug = mfg.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
      if (!uniqueBrands.has(slug)) uniqueBrands.set(slug, mfg || slug);
    }
    const brandStmts = Array.from(uniqueBrands.entries()).map(([slug, name]) =>
      ctx.env.LENS_D1!.prepare(
        "INSERT INTO brand_index (slug, name) VALUES (?, ?) ON CONFLICT(slug) DO NOTHING",
      ).bind(slug, name.slice(0, 200)),
    );
    if (brandStmts.length > 0) {
      try {
        await (ctx.env.LENS_D1 as unknown as { batch(s: unknown[]): Promise<unknown[]> }).batch(brandStmts);
      } catch (err) {
        logLines.push(`brand upsert: ${(err as Error).message}`);
      }
    }

    const BATCH = 12;
    for (let i = 0; i < rows.length; i += BATCH) {
      if (ctx.signal.aborted) break;
      const stmts: unknown[] = [];
      for (const r of rows.slice(i, i + BATCH)) {
        const qid = r.item?.value?.split("/").pop();
        const label = r.itemLabel?.value;
        if (!qid || !label || qid.startsWith("Q") === false) {
          counters.rowsSkipped++;
          continue;
        }
        const mfg = r.mfgLabel?.value ?? "";
        const brand = mfg.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
        const skuId = `wd:${qid}`;
        const specsJson = JSON.stringify({
          wikidata_qid: qid,
          class: cls.slug,
          manufacturer_qid: r.mfg?.value?.split("/").pop() ?? null,
        });
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO sku_catalog (id, canonical_name, brand_slug, model_code, image_url, specs_json, first_seen_at, last_refreshed_at)
             VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
               canonical_name = excluded.canonical_name,
               image_url = excluded.image_url,
               specs_json = excluded.specs_json,
               last_refreshed_at = datetime('now')`,
          ).bind(skuId, label.slice(0, 200), brand, r.modelCode?.value ?? null, r.image?.value ?? null, specsJson),
        );
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO sku_source_link (sku_id, source_id, external_id, external_url, specs_json, observed_at, confidence, active)
             VALUES (?, ?, ?, ?, ?, datetime('now'), 0.8, 1)
             ON CONFLICT(sku_id, source_id, external_id) DO UPDATE SET
               external_url = excluded.external_url,
               specs_json = excluded.specs_json,
               observed_at = datetime('now'),
               active = 1`,
          ).bind(skuId, SOURCE_ID, qid, `https://www.wikidata.org/wiki/${qid}`, specsJson),
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

    const nextOffset = rows.length === LIMIT ? offset + LIMIT : 0;
    const nextIndex = rows.length === LIMIT ? state.index : state.index + 1;
    await writeState(ctx, { index: nextIndex, offset: nextOffset });
    counters.log = logLines.join("\n");
    return counters;
  },
};

async function readState(ctx: IngestionContext): Promise<{ index: number; offset: number }> {
  const row = await ctx.env.LENS_D1!.prepare("SELECT cursor_json FROM data_source WHERE id = ?")
    .bind(SOURCE_ID)
    .first<{ cursor_json: string | null }>();
  try {
    const p = JSON.parse(row?.cursor_json ?? "{}");
    return {
      index: typeof p.index === "number" ? p.index : 0,
      offset: typeof p.offset === "number" ? p.offset : 0,
    };
  } catch {
    return { index: 0, offset: 0 };
  }
}

async function writeState(ctx: IngestionContext, s: { index: number; offset: number }): Promise<void> {
  await ctx.env.LENS_D1!.prepare("UPDATE data_source SET cursor_json = ? WHERE id = ?")
    .bind(JSON.stringify(s), SOURCE_ID)
    .run();
}