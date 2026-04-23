// IMPROVEMENT_PLAN_V2 A-S22d — Slickdeals price tracker.
// Per user 2026-04-23: "people are mostly interested about price". Slickdeals
// is the canonical crowd-curated deals aggregator; their public RSS feed
// returns the hot-deals list with each item shaped as:
//   <title>{product} ${price} {retailer}.com</title>
//   <link>slickdeals.net/f/{id}-{slug}?utm_source=rss</link>
//   <content:encoded>... image + body ...</content:encoded>
// We parse titles → extract product, price, retailer — upsert to
// sku_catalog + sku_source_link + price_history so triangulated_price
// picks up a real currently-discounted observation.
//
// Rotates through a small curated query list so we sweep categories
// relevant to consumer shopping (laptop, headphones, tv, vacuum,
// espresso, mattress, monitor, router, shoes, camera).

import type { DatasetIngester, IngestionContext, IngestionReport } from "../framework.js";
import { ensureBrands } from "../framework.js";

const SOURCE_ID = "slickdeals";
const QUERIES = [
  "", // "hot deals" firehose
  "laptop", "headphones", "tv", "vacuum", "espresso", "mattress",
  "monitor", "router", "camera", "earbuds", "chair", "blender",
  "soundbar", "coffee", "keyboard", "mouse", "ssd",
];

interface SlickItem { title: string; link: string }

export const slickdealsIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 60_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = { rowsSeen: 0, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };
    const state = await readCursor(ctx);
    const q = QUERIES[state.idx % QUERIES.length]!;
    const url = q
      ? `https://slickdeals.net/newsearch.php?src=SearchBarV2&rss=1&q=${encodeURIComponent(q)}`
      : `https://slickdeals.net/newsearch.php?src=SearchBarV2&rss=1`;

    let xml = "";
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "LensBot/1.0 (welfare-audit research)", Accept: "application/rss+xml" },
        signal: ctx.signal,
      });
      if (!res.ok) throw new Error(`http ${res.status}`);
      xml = await res.text();
    } catch (err) {
      counters.errors.push((err as Error).message);
      return counters;
    }

    const items = extractItems(xml);
    counters.rowsSeen = items.length;
    counters.log = `q="${q}" items=${items.length}`;

    // Pass 1 — collect brand/retailer slugs for ensureBrands.
    const brandMap = new Map<string, string>();
    const parsed = items.map((it) => {
      const p = parseTitle(it.title);
      if (p.retailer) brandMap.set(slugify(p.retailer), p.retailer);
      return { ...it, ...p };
    });
    try { await ensureBrands(ctx.env, brandMap); } catch (err) {
      if (counters.errors.length < 5) counters.errors.push(`ensureBrands: ${(err as Error).message}`);
    }

    const BATCH = 20;
    for (let i = 0; i < parsed.length; i += BATCH) {
      if (ctx.signal.aborted) break;
      const stmts: unknown[] = [];
      for (const p of parsed.slice(i, i + BATCH)) {
        if (!p.product) { counters.rowsSkipped++; continue; }
        const skuId = `slickdeals:${slugify(p.product).slice(0, 80)}`;
        const specs = { retailer: p.retailer, priceCents: p.priceCents, dealUrl: p.link };
        const observed = new Date().toISOString().slice(0, 19);
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO sku_catalog (id, canonical_name, brand_slug, specs_json, first_seen_at, last_refreshed_at)
             VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
               canonical_name = excluded.canonical_name,
               specs_json = excluded.specs_json,
               last_refreshed_at = datetime('now')`,
          ).bind(skuId, p.product.slice(0, 200), p.retailer ? slugify(p.retailer) : "unknown", JSON.stringify(specs).slice(0, 8_000)),
        );
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO sku_source_link (sku_id, source_id, external_id, external_url, specs_json, price_cents, currency, observed_at, confidence, active)
             VALUES (?, ?, ?, ?, ?, ?, 'USD', ?, 0.7, 1)
             ON CONFLICT(sku_id, source_id, external_id) DO UPDATE SET
               external_url = excluded.external_url,
               price_cents = excluded.price_cents,
               specs_json = excluded.specs_json,
               observed_at = excluded.observed_at,
               active = 1`,
          ).bind(
            skuId, SOURCE_ID, skuId, p.link,
            JSON.stringify(specs).slice(0, 8_000),
            p.priceCents ?? null, observed,
          ),
        );
        if (p.priceCents != null) {
          stmts.push(
            ctx.env.LENS_D1!.prepare(
              `INSERT OR IGNORE INTO price_history (sku_id, source_id, observed_at, price_cents, currency, on_sale, sale_pct)
               VALUES (?, ?, ?, ?, 'USD', 1, NULL)`,
            ).bind(skuId, SOURCE_ID, observed, p.priceCents),
          );
        }
      }
      if (stmts.length === 0) continue;
      try {
        await (ctx.env.LENS_D1 as unknown as { batch(s: unknown[]): Promise<unknown[]> }).batch(stmts);
        counters.rowsUpserted += stmts.length;
      } catch (err) {
        if (counters.errors.length < 10) counters.errors.push((err as Error).message);
      }
    }

    await writeCursor(ctx, { idx: state.idx + 1 });
    return counters;
  },
};

// ------ parsers ------

function extractItems(xml: string): SlickItem[] {
  const out: SlickItem[] = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1]!;
    const title = grab(block, "title") ?? "";
    const link = grab(block, "link") ?? "";
    if (title && link) out.push({ title: cdata(title).trim(), link: cdata(link).trim() });
  }
  return out;
}

function grab(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  return m ? m[1]! : null;
}

function cdata(s: string): string {
  return s.replace(/^\s*<!\[CDATA\[/, "").replace(/\]\]>\s*$/, "");
}

function parseTitle(title: string): { product: string; priceCents?: number; retailer?: string } {
  // Typical Slickdeals title:
  //   "Dell 15.6" 2K Touchscreen Laptop ... $599.99 Bestbuy.com"
  //   "[SPY] Anker 725 Charger $19.99 + Free Shipping @Amazon"
  //   "Free sample — Kind bars"
  let product = title;
  let priceCents: number | undefined;
  let retailer: string | undefined;

  // Retailer: trailing "Amazon.com", "Bestbuy.com", "@Amazon", etc.
  const retailRe = /\b(?:@|at\s+)?([A-Z][A-Za-z0-9]{2,}(?:\.(?:com|net|org|co))?)\s*$/i;
  const rm = product.match(retailRe);
  if (rm && /amazon|bestbuy|walmart|target|costco|ebay|homedepot|lowes|macy|nordstrom|newegg|rei|dell|hp|apple|bhphoto|aliexpress|temu|samsclub|wayfair|adorama|microcenter/i.test(rm[1]!)) {
    retailer = rm[1]!.replace(/\.(com|net|org|co)$/i, "");
    product = product.slice(0, rm.index).replace(/[\s@]+$/, "").trim();
  }

  // Price: "$599.99", "$19.99"
  const priceRe = /\$([0-9]{1,4}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/;
  const pm = product.match(priceRe);
  if (pm) {
    const raw = pm[1]!.replace(/,/g, "");
    const n = parseFloat(raw);
    if (!Number.isNaN(n)) priceCents = Math.round(n * 100);
    product = product.replace(priceRe, "").trim();
  }

  // Strip leading tags like "[SPY]", "[ShopRunner]"
  product = product.replace(/^\[[^\]]*\]\s*/, "").trim();
  // Strip trailing " + Free Shipping", separators
  product = product.replace(/\s*\+\s*free\s+shipping.*$/i, "").replace(/\s+@\s*$/, "").trim();

  return { product, priceCents, retailer };
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "unknown";
}

// ------ cursor ------

async function readCursor(ctx: IngestionContext): Promise<{ idx: number }> {
  const row = await ctx.env.LENS_D1!.prepare("SELECT cursor_json FROM data_source WHERE id = ?")
    .bind(SOURCE_ID)
    .first<{ cursor_json: string | null }>();
  try {
    const p = JSON.parse(row?.cursor_json ?? "{}");
    return { idx: typeof p.idx === "number" ? p.idx : 0 };
  } catch {
    return { idx: 0 };
  }
}

async function writeCursor(ctx: IngestionContext, c: { idx: number }): Promise<void> {
  await ctx.env.LENS_D1!.prepare("UPDATE data_source SET cursor_json = ? WHERE id = ?")
    .bind(JSON.stringify(c), SOURCE_ID)
    .run();
}
