// IMPROVEMENT_PLAN_V2 A-S14 — Retailer sitemap ingester.
// Retailers publish sitemap.xml files listing every product URL. Public;
// robots.txt allows /sitemap*.xml for all major retailers. Per run, this
// ingester fetches ONE sitemap index file (rotating) and extracts product
// URLs. Each URL becomes a sku_catalog row with brand_slug = retailer, the
// URL as external_url. The enricher cron later hits each URL with the
// per-host parser (S3-W15) to fill in name/price/specs.

import { ensureBrands, type DatasetIngester, type IngestionContext, type IngestionReport } from "../framework.js";

const SOURCE_ID = "retailer-sitemaps";

interface Retailer {
  slug: string;
  name: string;
  sitemapIndexUrl: string;
  productUrlPattern: RegExp; // to filter only product URLs
  extractAsin?: (url: string) => string | null;
}

const RETAILERS: Retailer[] = [
  {
    slug: "amazon",
    name: "Amazon",
    sitemapIndexUrl: "https://www.amazon.com/sitemap.xml",
    productUrlPattern: /\/dp\/([A-Z0-9]{10})/,
    extractAsin: (url) => {
      const m = url.match(/\/dp\/([A-Z0-9]{10})/);
      return m ? m[1]! : null;
    },
  },
  {
    slug: "bestbuy",
    name: "Best Buy",
    sitemapIndexUrl: "https://www.bestbuy.com/sitemap.xml",
    // Best Buy sitemaps drop the ?skuId= query string — the canonical in
    // the sitemap is "/site/.../NNNNNN.p". The regex tolerates both.
    productUrlPattern: /\/site\/.+\/(\d{7,9})\.p(?:\?|$)/,
  },
  {
    slug: "walmart",
    name: "Walmart",
    sitemapIndexUrl: "https://www.walmart.com/sitemap.xml",
    productUrlPattern: /\/ip\/.+\/(\d+)/,
  },
  {
    slug: "target",
    name: "Target",
    sitemapIndexUrl: "https://www.target.com/sitemap.xml",
    productUrlPattern: /\/p\/.+\/A-(\d+)/,
  },
  {
    slug: "homedepot",
    name: "The Home Depot",
    sitemapIndexUrl: "https://www.homedepot.com/sitemap.xml",
    productUrlPattern: /\/p\/.+\/(\d+)/,
  },
  {
    slug: "costco",
    name: "Costco",
    sitemapIndexUrl: "https://www.costco.com/sitemap_product.xml",
    productUrlPattern: /\.product\.(\d+)\.html/,
  },
];

const MAX_URLS_PER_RUN = 500;

export const retailerSitemapsIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 180_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = { rowsSeen: 0, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };
    const state = await readState(ctx);
    const retailer = RETAILERS[state.retailerIndex % RETAILERS.length]!;

    const logLines: string[] = [`retailer=${retailer.slug} childIndex=${state.childIndex}`];

    // Step 1: fetch the sitemap index for this retailer.
    let indexXml = "";
    try {
      const res = await fetch(retailer.sitemapIndexUrl, {
        headers: { "User-Agent": "LensBot/1.0 (academic)" },
        signal: ctx.signal,
      });
      if (!res.ok) throw new Error(`index http ${res.status}`);
      indexXml = await res.text();
    } catch (err) {
      counters.errors.push(`index fetch: ${(err as Error).message}`);
      counters.log = logLines.join("\n");
      // Advance to the next retailer so we don't retry the bot-blocking
      // one (e.g. Amazon 500) forever. Without this, a single 500-prone
      // retailer at the top of the list pins the cursor and every other
      // retailer's sitemap stays unreached.
      await writeState(ctx, { retailerIndex: state.retailerIndex + 1, childIndex: 0 });
      return counters;
    }

    // Step 2: extract child sitemaps or product URLs from the index.
    const childUrls = extractLocs(indexXml).filter((u) => u.includes(".xml"));
    const productUrls = extractLocs(indexXml).filter((u) => retailer.productUrlPattern.test(u));

    let urls: string[] = productUrls;
    // If the index points to child sitemaps, fetch one.
    if (urls.length === 0 && childUrls.length > 0) {
      const child = childUrls[state.childIndex % childUrls.length]!;
      logLines.push(`fetching child ${child}`);
      try {
        const res = await fetch(child, {
          headers: { "User-Agent": "LensBot/1.0 (academic)" },
          signal: ctx.signal,
        });
        if (!res.ok) throw new Error(`child http ${res.status}`);
        // Best Buy / Walmart / Home Depot often publish *.xml.gz — application-
        // level gzip, not transport-level. The CF Worker fetch() only auto-
        // decompresses Content-Encoding. For .gz files we have to inflate the
        // body manually with DecompressionStream.
        const isGz = /\.gz(?:$|[?#])/i.test(child)
          || (res.headers.get("content-type") ?? "").toLowerCase().includes("gzip");
        let childXml: string;
        if (isGz && typeof DecompressionStream !== "undefined" && res.body) {
          const decompressed = res.body.pipeThrough(new DecompressionStream("gzip"));
          childXml = await new Response(decompressed).text();
        } else {
          childXml = await res.text();
        }
        urls = extractLocs(childXml).filter((u) => retailer.productUrlPattern.test(u));
      } catch (err) {
        counters.errors.push(`child fetch: ${(err as Error).message}`);
      }
    }

    urls = urls.slice(0, MAX_URLS_PER_RUN);
    counters.rowsSeen = urls.length;
    logLines.push(`product urls: ${urls.length}`);

    // Ensure the retailer brand exists in brand_index before inserts.
    await ensureBrands(ctx.env, new Map([[retailer.slug, retailer.name]]));

    const BATCH = 20;
    for (let i = 0; i < urls.length; i += BATCH) {
      if (ctx.signal.aborted) break;
      const stmts: unknown[] = [];
      for (const url of urls.slice(i, i + BATCH)) {
        const productId = extractId(url, retailer);
        if (!productId) {
          counters.rowsSkipped++;
          continue;
        }
        const skuId = `${retailer.slug}:${productId}`;
        const asin = retailer.extractAsin?.(url) ?? null;
        const name = humanizeFromUrl(url);
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO sku_catalog (id, canonical_name, brand_slug, asin, first_seen_at, last_refreshed_at)
             VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
               last_refreshed_at = datetime('now')`,
          ).bind(skuId, name.slice(0, 200), retailer.slug, asin),
        );
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO sku_source_link (sku_id, source_id, external_id, external_url, observed_at, confidence, active)
             VALUES (?, ?, ?, ?, datetime('now'), 0.7, 1)
             ON CONFLICT(sku_id, source_id, external_id) DO UPDATE SET
               external_url = excluded.external_url,
               observed_at = datetime('now'),
               active = 1`,
          ).bind(skuId, SOURCE_ID, productId, url),
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

    // Advance: next retailer if we exhausted the children.
    const moreChildren = childUrls.length > 0 && state.childIndex + 1 < childUrls.length;
    const next = moreChildren
      ? { retailerIndex: state.retailerIndex, childIndex: state.childIndex + 1 }
      : { retailerIndex: state.retailerIndex + 1, childIndex: 0 };
    await writeState(ctx, next);

    counters.log = logLines.join("\n");
    return counters;
  },
};

function extractLocs(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>([^<]+)<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1]!.trim());
  return out;
}

function extractId(url: string, r: Retailer): string | null {
  const m = url.match(r.productUrlPattern);
  return m ? m[1]! : null;
}

function humanizeFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const slug = parts.find((p) => p.length > 8 && /[a-z]/i.test(p));
    if (!slug) return u.hostname;
    return slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return url.slice(0, 80);
  }
}

async function readState(ctx: IngestionContext): Promise<{ retailerIndex: number; childIndex: number }> {
  const row = await ctx.env.LENS_D1!.prepare("SELECT cursor_json FROM data_source WHERE id = ?")
    .bind(SOURCE_ID)
    .first<{ cursor_json: string | null }>();
  try {
    const p = JSON.parse(row?.cursor_json ?? "{}");
    return {
      retailerIndex: typeof p.retailerIndex === "number" ? p.retailerIndex : 0,
      childIndex: typeof p.childIndex === "number" ? p.childIndex : 0,
    };
  } catch {
    return { retailerIndex: 0, childIndex: 0 };
  }
}

async function writeState(ctx: IngestionContext, s: { retailerIndex: number; childIndex: number }): Promise<void> {
  await ctx.env.LENS_D1!.prepare("UPDATE data_source SET cursor_json = ? WHERE id = ?")
    .bind(JSON.stringify(s), SOURCE_ID)
    .run();
}