// Shared helpers for RSS-style price-deal ingesters
// (slickdeals, bensbargains, dealnews, gottadeal, mybargainbuddy).
// Each of those feeds publishes titles like:
//   "Dell 15.6 2K Touchscreen Laptop $599.99 Bestbuy.com"
//   "[SPY] Anker 725 Charger $19.99 + Free Shipping @Amazon"
//   "Samsung 65-inch QLED TV - $749.99 at BestBuy.com"
// so one parser covers them all. Each ingester just configures its SOURCE_ID
// + feed URL and hands off to ingestDealRss().

import type { DatasetIngester, IngestionContext, IngestionReport } from "../framework.js";
import { ensureBrands } from "../framework.js";

export interface DealRssConfig {
  id: string;                // data_source.id
  feedUrls: string[];        // one or more feeds (rotated per run via cursor)
  maxDurationMs?: number;
}

interface Parsed {
  link: string;
  title: string;
  product: string;
  priceCents?: number;
  retailer?: string;
}

export function makeDealRssIngester(cfg: DealRssConfig): DatasetIngester {
  return {
    id: cfg.id,
    maxDurationMs: cfg.maxDurationMs ?? 60_000,
    async run(ctx: IngestionContext): Promise<IngestionReport> {
      const counters: IngestionReport = { rowsSeen: 0, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };
      const state = await readCursor(ctx, cfg.id);
      const url = cfg.feedUrls[state.idx % cfg.feedUrls.length]!;

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
        await writeCursor(ctx, cfg.id, { idx: state.idx + 1 });
        return counters;
      }

      const items = extractItems(xml);
      counters.rowsSeen = items.length;
      counters.log = `feed="${url}" items=${items.length}`;

      const brandMap = new Map<string, string>();
      const parsed: Parsed[] = items.map((it) => {
        const p = parseTitle(it.title);
        if (p.retailer) brandMap.set(slugify(p.retailer), p.retailer);
        return { link: it.link, title: it.title, ...p };
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
          const skuId = `${cfg.id}:${slugify(p.product).slice(0, 80)}`;
          const specs = { retailer: p.retailer, priceCents: p.priceCents, dealUrl: p.link, sourceTitle: p.title };
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
            ).bind(skuId, cfg.id, skuId, p.link, JSON.stringify(specs).slice(0, 8_000), p.priceCents ?? null, observed),
          );
          if (p.priceCents != null) {
            stmts.push(
              ctx.env.LENS_D1!.prepare(
                `INSERT OR IGNORE INTO price_history (sku_id, source_id, observed_at, price_cents, currency, on_sale, sale_pct)
                 VALUES (?, ?, ?, ?, 'USD', 1, NULL)`,
              ).bind(skuId, cfg.id, observed, p.priceCents),
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

      await writeCursor(ctx, cfg.id, { idx: state.idx + 1 });
      return counters;
    },
  };
}

// ------- RSS + title parser -------

function extractItems(xml: string): Array<{ title: string; link: string }> {
  const out: Array<{ title: string; link: string }> = [];
  const re = /<item[\s>][\s\S]*?<\/item>/gi;
  const blocks = xml.match(re) ?? [];
  for (const b of blocks) {
    const title = cdata(grab(b, "title") ?? "").trim();
    const link = cdata(grab(b, "link") ?? "").trim();
    if (title && link) out.push({ title, link });
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

export function parseTitle(title: string): { product: string; priceCents?: number; retailer?: string } {
  let product = title;
  let priceCents: number | undefined;
  let retailer: string | undefined;

  const retailRe = /\b(?:@|at\s+|via\s+)?([A-Z][A-Za-z0-9&'-]{2,}(?:\.(?:com|net|org|co))?)\s*\.?\s*$/i;
  const rm = product.match(retailRe);
  if (rm && /amazon|bestbuy|walmart|target|costco|ebay|homedepot|lowes|macy|nordstrom|newegg|rei|dell|hp|apple|bhphoto|aliexpress|temu|samsclub|wayfair|adorama|microcenter|staples|officedepot|zappos|nordstromrack|kohls|sears|nike|adidas|nordvpn|shein|dollartree|dollargeneral|gap|uniqlo|vitacost/i.test(rm[1]!)) {
    retailer = rm[1]!.replace(/\.(com|net|org|co)$/i, "");
    product = product.slice(0, rm.index).replace(/[\s@.,-]+$/, "").trim();
  }

  const priceRe = /\$([0-9]{1,4}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/;
  const pm = product.match(priceRe);
  if (pm) {
    const raw = pm[1]!.replace(/,/g, "");
    const n = parseFloat(raw);
    if (!Number.isNaN(n)) priceCents = Math.round(n * 100);
    product = product.replace(priceRe, "").trim();
  }

  product = product.replace(/^\[[^\]]*\]\s*/, "").trim();
  product = product.replace(/\s*\+\s*free\s+shipping.*$/i, "").replace(/\s+@\s*$/, "").trim();
  // Strip trailing dangling hyphens / dots left by cuts above.
  product = product.replace(/[\s\-.,]+$/, "");

  return {
    product,
    ...(priceCents !== undefined ? { priceCents } : {}),
    ...(retailer !== undefined ? { retailer } : {}),
  };
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "unknown";
}

// ------- shared cursor in cursor_json -------

async function readCursor(ctx: IngestionContext, id: string): Promise<{ idx: number }> {
  const row = await ctx.env.LENS_D1!.prepare("SELECT cursor_json FROM data_source WHERE id = ?")
    .bind(id)
    .first<{ cursor_json: string | null }>();
  try {
    const p = JSON.parse(row?.cursor_json ?? "{}");
    return { idx: typeof p.idx === "number" ? p.idx : 0 };
  } catch {
    return { idx: 0 };
  }
}

async function writeCursor(ctx: IngestionContext, id: string, c: { idx: number }): Promise<void> {
  await ctx.env.LENS_D1!.prepare("UPDATE data_source SET cursor_json = ? WHERE id = ?")
    .bind(JSON.stringify(c), id)
    .run();
}
