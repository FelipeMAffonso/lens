// IMPROVEMENT_PLAN_V2 A-S16 — Keepa price-history ingester.
// Keepa is the canonical price-history source for Amazon (since 2015).
// Paid API — requires KEEPA_API_KEY. On each run, picks up to 50 SKUs from
// sku_catalog that have an asin and either no price history or stale
// history (> 7d), fetches full 90-day series per SKU, writes to
// price_history (one row per observation day).

import type { DatasetIngester, IngestionContext, IngestionReport } from "../framework.js";

const SOURCE_ID = "keepa";
const BATCH_SIZE = 50;

interface KeepaResp {
  products?: Array<{
    asin?: string;
    title?: string;
    csv?: Array<Array<number> | null>; // [AMAZON, NEW, USED, ...] each series [minute_offset, price_cents, ...]
  }>;
}

export const keepaIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 180_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = { rowsSeen: 0, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };
    const logLines: string[] = [];

    const apiKey = (ctx.env as unknown as Record<string, string | undefined>).KEEPA_API_KEY;
    if (!apiKey) {
      counters.log = "KEEPA_API_KEY not set — keepa ingester skipping this run.";
      return counters;
    }

    // Pick SKUs with ASINs that haven't been refreshed in 7 days.
    const { results } = await ctx.env.LENS_D1!.prepare(
      `SELECT sc.id, sc.asin FROM sku_catalog sc
         LEFT JOIN price_history ph ON ph.sku_id = sc.id AND ph.source_id = 'keepa'
        WHERE sc.asin IS NOT NULL
          AND (ph.observed_at IS NULL OR ph.observed_at < datetime('now', '-7 days'))
        GROUP BY sc.id
        ORDER BY MAX(COALESCE(ph.observed_at, '1970-01-01')) ASC
        LIMIT ?`,
    ).bind(BATCH_SIZE).all<{ id: string; asin: string }>();
    const targets = results ?? [];
    counters.rowsSeen = targets.length;
    logLines.push(`targets: ${targets.length}`);

    if (targets.length === 0) {
      counters.log = "no SKUs need refresh";
      return counters;
    }

    const asinList = targets.map((t) => t.asin).join(",");
    const url = `https://api.keepa.com/product?key=${apiKey}&domain=1&asin=${asinList}&history=1&days=90`;

    let body: KeepaResp;
    try {
      const res = await fetch(url, { signal: ctx.signal });
      if (!res.ok) throw new Error(`http ${res.status}`);
      body = (await res.json()) as KeepaResp;
    } catch (err) {
      counters.errors.push((err as Error).message);
      counters.log = logLines.join("\n");
      return counters;
    }

    const BATCH = 20;
    const allRows: Array<{ skuId: string; observedAt: string; priceCents: number }> = [];
    for (const p of body.products ?? []) {
      if (!p.asin) continue;
      const target = targets.find((t) => t.asin === p.asin);
      if (!target) continue;
      const amazonSeries = p.csv?.[0]; // AMAZON price history
      if (!Array.isArray(amazonSeries)) {
        counters.rowsSkipped++;
        continue;
      }
      // Series format: [minuteOffsetFromEpoch, priceCents, minuteOffset, priceCents, ...]
      // priceCents = -1 means out of stock (skip).
      for (let i = 0; i + 1 < amazonSeries.length; i += 2) {
        const minute = amazonSeries[i]!;
        const priceCents = amazonSeries[i + 1]!;
        if (priceCents <= 0) continue;
        // Keepa minute offset from 2011-01-01 00:00 UTC
        const t = new Date((minute * 60 + 21564000 * 60) * 1000);
        allRows.push({ skuId: target.id, observedAt: t.toISOString().slice(0, 19), priceCents });
      }
    }
    logLines.push(`rows to insert: ${allRows.length}`);

    for (let i = 0; i < allRows.length; i += BATCH) {
      if (ctx.signal.aborted) break;
      const stmts: unknown[] = [];
      for (const r of allRows.slice(i, i + BATCH)) {
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO price_history (sku_id, source_id, observed_at, price_cents, currency)
             VALUES (?, ?, ?, ?, 'USD')`,
          ).bind(r.skuId, SOURCE_ID, r.observedAt, r.priceCents),
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

    counters.log = logLines.join("\n");
    return counters;
  },
};
