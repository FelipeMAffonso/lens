// IMPROVEMENT_PLAN_V2 A-S19 — Reddit /r/BuyItForLife + /r/ProductReviews ingester.
// Free read-only endpoint: https://www.reddit.com/r/<sub>/new.json?limit=100
// Produces `sku_source_link` rows attributing community validation (upvotes,
// mentions) to a SKU when the post title contains a brand+model. Cheap way
// to layer in revealed-community-preference signal.

import type { DatasetIngester, IngestionContext, IngestionReport } from "../framework.js";

const SOURCE_ID = "reddit";
const SUBS = ["BuyItForLife", "ProductReviews", "espresso", "headphones", "laptops", "AppleWhatYear", "smartphones"];

interface RedditListing {
  data?: {
    children?: Array<{
      data?: {
        id?: string;
        title?: string;
        selftext?: string;
        ups?: number;
        num_comments?: number;
        created_utc?: number;
        permalink?: string;
        subreddit?: string;
      };
    }>;
  };
}

export const redditBiflIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 120_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = { rowsSeen: 0, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };
    const subIndex = await readIdx(ctx);
    const sub = SUBS[subIndex % SUBS.length]!;
    const url = `https://www.reddit.com/r/${sub}/new.json?limit=100`;

    let body: RedditListing;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "LensBot/1.0 (academic)" }, signal: ctx.signal });
      if (!res.ok) throw new Error(`http ${res.status}`);
      body = (await res.json()) as RedditListing;
    } catch (err) {
      counters.errors.push((err as Error).message);
      return counters;
    }
    const posts = body.data?.children ?? [];
    counters.rowsSeen = posts.length;

    // Load known brands once so we can tokenize.
    const brandRows = await ctx.env.LENS_D1!.prepare("SELECT slug, name FROM brand_index").all<{
      slug: string;
      name: string;
    }>();
    const brands = brandRows.results ?? [];

    const BATCH = 15;
    for (let i = 0; i < posts.length; i += BATCH) {
      if (ctx.signal.aborted) break;
      const stmts: unknown[] = [];
      for (const p of posts.slice(i, i + BATCH)) {
        const d = p.data ?? {};
        const title = (d.title ?? "").trim();
        const id = d.id ?? "";
        if (!id || !title) {
          counters.rowsSkipped++;
          continue;
        }
        // Match a brand in the title — cheapest signal.
        const lower = title.toLowerCase();
        const brandHit = brands.find((b) => lower.includes(b.name.toLowerCase()) || lower.includes(b.slug));
        if (!brandHit) {
          counters.rowsSkipped++;
          continue;
        }
        // Write an anonymous sku_source_link row attached to a synthetic
        // community-signal SKU — for now we just log the fact. The triangulation
        // engine (A12) later joins these by brand slug.
        const externalId = `reddit:${id}`;
        const external_url = `https://www.reddit.com${d.permalink ?? `/r/${sub}/comments/${id}`}`;
        const specsJson = JSON.stringify({
          subreddit: d.subreddit ?? sub,
          title,
          ups: d.ups ?? 0,
          num_comments: d.num_comments ?? 0,
          created_utc: d.created_utc ?? 0,
        });
        const skuId = `reddit-community:${brandHit.slug}`;
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO sku_catalog (id, canonical_name, brand_slug, first_seen_at, last_refreshed_at)
             VALUES (?, ?, ?, datetime('now'), datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
               last_refreshed_at = datetime('now')`,
          ).bind(skuId, `${brandHit.name} community signal`, brandHit.slug),
        );
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO sku_source_link (sku_id, source_id, external_id, external_url, specs_json, observed_at, confidence, active)
             VALUES (?, ?, ?, ?, ?, datetime('now'), 0.6, 1)
             ON CONFLICT(sku_id, source_id, external_id) DO UPDATE SET
               specs_json = excluded.specs_json,
               observed_at = datetime('now'),
               active = 1`,
          ).bind(skuId, SOURCE_ID, externalId, external_url, specsJson),
        );
      }
      if (stmts.length === 0) continue;
      try {
        await (ctx.env.LENS_D1 as unknown as { batch(s: unknown[]): Promise<unknown[]> }).batch(stmts);
        counters.rowsUpserted += stmts.length / 2;
      } catch (err) {
        if (counters.errors.length < 10) counters.errors.push((err as Error).message);
      }
      if ((i / BATCH) % 10 === 0) await ctx.progress({});
    }

    await writeIdx(ctx, subIndex + 1);
    return counters;
  },
};

async function readIdx(ctx: IngestionContext): Promise<number> {
  const row = await ctx.env.LENS_D1!.prepare("SELECT last_error FROM data_source WHERE id = ?")
    .bind(SOURCE_ID)
    .first<{ last_error: string | null }>();
  try {
    const p = JSON.parse(row?.last_error ?? "{}");
    return typeof p.idx === "number" ? p.idx : 0;
  } catch {
    return 0;
  }
}

async function writeIdx(ctx: IngestionContext, idx: number): Promise<void> {
  await ctx.env.LENS_D1!.prepare("UPDATE data_source SET last_error = ? WHERE id = ?")
    .bind(JSON.stringify({ idx }), SOURCE_ID)
    .run();
}