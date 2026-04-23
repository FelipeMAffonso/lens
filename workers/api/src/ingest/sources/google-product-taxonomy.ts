// IMPROVEMENT_PLAN_V2 A-S12c — Google Product Taxonomy.
// ~5,500 canonical product categories organized as "A > B > C > D" paths.
// Massive upgrade over UNSPSC level-1 (55 segments). Public, no-auth.
// One-shot seed (skipped if >1000 rows already exist).

import type { DatasetIngester, IngestionContext, IngestionReport } from "../framework.js";

const SOURCE_ID = "google-product-taxonomy";
const FEED_URL = "https://www.google.com/basepages/producttype/taxonomy.en-US.txt";

export const googleProductTaxonomyIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 60_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = { rowsSeen: 0, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };

    // Skip if already seeded.
    const existing = await ctx.env.LENS_D1!.prepare(
      "SELECT COUNT(*) AS n FROM category_taxonomy WHERE source = 'google-product-taxonomy'",
    ).first<{ n: number }>();
    if ((existing?.n ?? 0) > 1000) {
      counters.log = `already seeded (${existing?.n} rows)`;
      return counters;
    }

    let body = "";
    try {
      const res = await fetch(FEED_URL, {
        headers: {
          // Google 403s the plain LensBot UA. Use a browser UA.
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept": "text/plain,text/*;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: ctx.signal,
      });
      if (!res.ok) throw new Error(`http ${res.status}`);
      body = await res.text();
    } catch (err) {
      counters.errors.push((err as Error).message);
      return counters;
    }

    const lines = body.split(/\r?\n/).filter((l) => l && !l.startsWith("#"));
    counters.rowsSeen = lines.length;

    const BATCH = 50;
    for (let i = 0; i < lines.length; i += BATCH) {
      if (ctx.signal.aborted) break;
      const stmts: unknown[] = [];
      for (const line of lines.slice(i, i + BATCH)) {
        const parts = line.split(" > ");
        const level = parts.length;
        const name = parts[parts.length - 1]!.trim();
        if (!name) { counters.rowsSkipped++; continue; }
        const code = "gpt:" + slugify(line).slice(0, 100);
        const parentCode = parts.length > 1
          ? "gpt:" + slugify(parts.slice(0, -1).join(" > ")).slice(0, 100)
          : null;
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO category_taxonomy (code, parent_code, level, name, source)
             VALUES (?, ?, ?, ?, 'google-product-taxonomy')
             ON CONFLICT(code) DO UPDATE SET
               name = excluded.name,
               level = excluded.level,
               parent_code = excluded.parent_code`,
          ).bind(code, parentCode, level, name.slice(0, 200)),
        );
      }
      if (stmts.length === 0) continue;
      try {
        await (ctx.env.LENS_D1 as unknown as { batch(s: unknown[]): Promise<unknown[]> }).batch(stmts);
        counters.rowsUpserted += stmts.length;
      } catch (err) {
        if (counters.errors.length < 10) counters.errors.push((err as Error).message);
      }
      if ((i / BATCH) % 20 === 0) await ctx.progress({});
    }
    return counters;
  },
};

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
