// IMPROVEMENT_PLAN_V2 A-S15 — Manufacturer sitemap ingester.
// Rotates across ~30 major brand sites. Pulls each brand's sitemap.xml,
// filters down to product pages, upserts into sku_catalog with brand_slug
// correctly set. Populates brand_index with the brand on first visit.

import type { DatasetIngester, IngestionContext, IngestionReport } from "../framework.js";

const SOURCE_ID = "manufacturer-sitemaps";

interface Brand {
  slug: string;
  name: string;
  domain: string;
  sitemapUrl: string;
  productUrlPattern: RegExp;
}

// 30 brands, covering most popular product categories.
const BRANDS: Brand[] = [
  { slug: "apple", name: "Apple", domain: "apple.com", sitemapUrl: "https://www.apple.com/sitemap.xml", productUrlPattern: /\/shop\/buy-/ },
  { slug: "sony", name: "Sony", domain: "sony.com", sitemapUrl: "https://www.sony.com/sitemap.xml", productUrlPattern: /electronics\/.+\/[a-z0-9-]+\/[a-z0-9-]+$/i },
  { slug: "samsung", name: "Samsung", domain: "samsung.com", sitemapUrl: "https://www.samsung.com/us/sitemap.xml", productUrlPattern: /\/us\/.+\//i },
  { slug: "lg", name: "LG Electronics", domain: "lg.com", sitemapUrl: "https://www.lg.com/us/sitemap.xml", productUrlPattern: /\/us\/.+\/.+/ },
  { slug: "breville", name: "Breville", domain: "breville.com", sitemapUrl: "https://www.breville.com/us/en/sitemap.xml", productUrlPattern: /\/products\// },
  { slug: "dyson", name: "Dyson", domain: "dyson.com", sitemapUrl: "https://www.dyson.com/sitemap.xml", productUrlPattern: /\/products\// },
  { slug: "delonghi", name: "De'Longhi", domain: "delonghi.com", sitemapUrl: "https://www.delonghi.com/sitemap.xml", productUrlPattern: /\/products\// },
  { slug: "bose", name: "Bose", domain: "bose.com", sitemapUrl: "https://www.bose.com/sitemap.xml", productUrlPattern: /\/en_us\/products\// },
  { slug: "sennheiser", name: "Sennheiser", domain: "sennheiser.com", sitemapUrl: "https://www.sennheiser-hearing.com/sitemap.xml", productUrlPattern: /\/en-us\/catalog\// },
  { slug: "lenovo", name: "Lenovo", domain: "lenovo.com", sitemapUrl: "https://www.lenovo.com/us/en/sitemap.xml", productUrlPattern: /\/us\/en\/p\// },
  { slug: "dell", name: "Dell", domain: "dell.com", sitemapUrl: "https://www.dell.com/sitemap.xml", productUrlPattern: /\/en-us\/shop\// },
  { slug: "hp", name: "HP", domain: "hp.com", sitemapUrl: "https://www.hp.com/us-en/sitemap.xml", productUrlPattern: /\/product\// },
  { slug: "microsoft", name: "Microsoft", domain: "microsoft.com", sitemapUrl: "https://www.microsoft.com/en-us/sitemap.xml", productUrlPattern: /\/d\// },
  { slug: "google", name: "Google Store", domain: "store.google.com", sitemapUrl: "https://store.google.com/sitemap.xml", productUrlPattern: /\/product\// },
  { slug: "logitech", name: "Logitech", domain: "logitech.com", sitemapUrl: "https://www.logitech.com/en-us/sitemap.xml", productUrlPattern: /\/en-us\/products\// },
  { slug: "anker", name: "Anker", domain: "anker.com", sitemapUrl: "https://www.anker.com/sitemap.xml", productUrlPattern: /\/products\// },
  { slug: "ge", name: "GE Appliances", domain: "geappliances.com", sitemapUrl: "https://www.geappliances.com/sitemap.xml", productUrlPattern: /\/appliance\// },
  { slug: "whirlpool", name: "Whirlpool", domain: "whirlpool.com", sitemapUrl: "https://www.whirlpool.com/sitemap.xml", productUrlPattern: /\/p\// },
  { slug: "kenmore", name: "Kenmore", domain: "kenmore.com", sitemapUrl: "https://www.kenmore.com/sitemap.xml", productUrlPattern: /\/products\// },
  { slug: "bosch", name: "Bosch Home", domain: "bosch-home.com", sitemapUrl: "https://www.bosch-home.com/us/sitemap.xml", productUrlPattern: /\/products\// },
  { slug: "cuisinart", name: "Cuisinart", domain: "cuisinart.com", sitemapUrl: "https://www.cuisinart.com/sitemap.xml", productUrlPattern: /\/shopping\/appliances\// },
  { slug: "kitchenaid", name: "KitchenAid", domain: "kitchenaid.com", sitemapUrl: "https://www.kitchenaid.com/sitemap.xml", productUrlPattern: /\/p\// },
  { slug: "shark", name: "Shark", domain: "sharkclean.com", sitemapUrl: "https://www.sharkclean.com/sitemap.xml", productUrlPattern: /\/product\// },
  { slug: "irobot", name: "iRobot", domain: "irobot.com", sitemapUrl: "https://www.irobot.com/sitemap.xml", productUrlPattern: /\/roomba\/.+/i },
  { slug: "garmin", name: "Garmin", domain: "garmin.com", sitemapUrl: "https://www.garmin.com/en-US/sitemap.xml", productUrlPattern: /\/en-US\/p\// },
  { slug: "canon", name: "Canon", domain: "usa.canon.com", sitemapUrl: "https://www.usa.canon.com/sitemap.xml", productUrlPattern: /\/shop\/p\// },
  { slug: "nikon", name: "Nikon", domain: "nikonusa.com", sitemapUrl: "https://www.nikonusa.com/sitemap.xml", productUrlPattern: /\/en\/nikon-products\// },
  { slug: "peloton", name: "Peloton", domain: "onepeloton.com", sitemapUrl: "https://www.onepeloton.com/sitemap.xml", productUrlPattern: /\/shop\// },
  { slug: "fitbit", name: "Fitbit", domain: "fitbit.com", sitemapUrl: "https://www.fitbit.com/sitemap.xml", productUrlPattern: /\/global\/.+\/devices\// },
  { slug: "keurig", name: "Keurig", domain: "keurig.com", sitemapUrl: "https://www.keurig.com/sitemap.xml", productUrlPattern: /\/brewers\// },
];

const MAX_URLS_PER_RUN = 300;

export const manufacturerSitemapsIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 180_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = { rowsSeen: 0, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };
    const state = await readState(ctx);
    const brand = BRANDS[state.brandIndex % BRANDS.length]!;
    const logLines: string[] = [`brand=${brand.slug}`];

    // Ensure brand row exists (upsert).
    try {
      await ctx.env.LENS_D1!.prepare(
        `INSERT INTO brand_index (slug, name, domain, sitemap_url, last_refreshed_at)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(slug) DO UPDATE SET
           last_refreshed_at = datetime('now'),
           sitemap_url = excluded.sitemap_url`,
      ).bind(brand.slug, brand.name, brand.domain, brand.sitemapUrl).run();
    } catch (err) {
      if (counters.errors.length < 10) counters.errors.push(`brand_index upsert: ${(err as Error).message}`);
    }

    let xml = "";
    try {
      const res = await fetch(brand.sitemapUrl, {
        headers: { "User-Agent": "LensBot/1.0 (academic)" },
        signal: ctx.signal,
      });
      if (!res.ok) throw new Error(`http ${res.status}`);
      xml = await res.text();
    } catch (err) {
      counters.errors.push((err as Error).message);
      await writeState(ctx, { brandIndex: state.brandIndex + 1 });
      return counters;
    }

    // Follow through one level of child sitemap if needed.
    const allLocs = extractLocs(xml);
    let urls = allLocs.filter((u) => brand.productUrlPattern.test(u));
    if (urls.length === 0) {
      // Maybe the top-level is a sitemap index. Pick first child.
      const child = allLocs.find((u) => u.endsWith(".xml"));
      if (child) {
        logLines.push(`following child ${child}`);
        try {
          const res = await fetch(child, { headers: { "User-Agent": "LensBot/1.0 (academic)" }, signal: ctx.signal });
          if (res.ok) {
            const childXml = await res.text();
            urls = extractLocs(childXml).filter((u) => brand.productUrlPattern.test(u));
          }
        } catch (err) {
          if (counters.errors.length < 10) counters.errors.push(`child: ${(err as Error).message}`);
        }
      }
    }

    urls = urls.slice(0, MAX_URLS_PER_RUN);
    counters.rowsSeen = urls.length;
    logLines.push(`product urls: ${urls.length}`);

    const BATCH = 20;
    for (let i = 0; i < urls.length; i += BATCH) {
      if (ctx.signal.aborted) break;
      const stmts: unknown[] = [];
      for (const url of urls.slice(i, i + BATCH)) {
        const slug = url.split("/").filter(Boolean).pop() || url.slice(0, 80);
        const skuId = `${brand.slug}:${slug.slice(0, 100)}`;
        const name = slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO sku_catalog (id, canonical_name, brand_slug, first_seen_at, last_refreshed_at)
             VALUES (?, ?, ?, datetime('now'), datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
               last_refreshed_at = datetime('now')`,
          ).bind(skuId, name.slice(0, 200), brand.slug),
        );
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO sku_source_link (sku_id, source_id, external_id, external_url, observed_at, confidence, active)
             VALUES (?, ?, ?, ?, datetime('now'), 0.92, 1)
             ON CONFLICT(sku_id, source_id, external_id) DO UPDATE SET
               external_url = excluded.external_url,
               observed_at = datetime('now'),
               active = 1`,
          ).bind(skuId, SOURCE_ID, slug.slice(0, 100), url),
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

    await writeState(ctx, { brandIndex: state.brandIndex + 1 });
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

async function readState(ctx: IngestionContext): Promise<{ brandIndex: number }> {
  const row = await ctx.env.LENS_D1!.prepare("SELECT cursor_json FROM data_source WHERE id = ?")
    .bind(SOURCE_ID)
    .first<{ cursor_json: string | null }>();
  try {
    const p = JSON.parse(row?.cursor_json ?? "{}");
    return { brandIndex: typeof p.brandIndex === "number" ? p.brandIndex : 0 };
  } catch {
    return { brandIndex: 0 };
  }
}

async function writeState(ctx: IngestionContext, s: { brandIndex: number }): Promise<void> {
  await ctx.env.LENS_D1!.prepare("UPDATE data_source SET cursor_json = ? WHERE id = ?")
    .bind(JSON.stringify(s), SOURCE_ID)
    .run();
}