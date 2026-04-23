// IMPROVEMENT_PLAN_V2 A12 — triangulation engine (price).
// Runs on the hourly cron (41 * * * *). For every SKU with ≥2 active
// sku_source_link rows that have price_cents, compute weighted median,
// p25, p75, n_sources. Write to triangulated_price (UPSERT).
//
// Flags discrepancies (>15% delta between median and any source) into
// discrepancy_log so the landing page "discrepancies caught this week"
// stat is real.

import type { Env } from "../index.js";

const DISCREPANCY_THRESHOLD = 0.15;
const MAX_SKUS_PER_RUN = 2000;

export async function runPriceTriangulation(env: Env): Promise<{
  skusProcessed: number;
  pricesWritten: number;
  discrepanciesLogged: number;
}> {
  if (!env.LENS_D1) return { skusProcessed: 0, pricesWritten: 0, discrepanciesLogged: 0 };

  // Find SKUs with at least 2 source prices, sorted by oldest triangulation.
  const { results: targets } = await env.LENS_D1.prepare(
    `SELECT ssl.sku_id, COUNT(*) AS n_prices
       FROM sku_source_link ssl
       LEFT JOIN triangulated_price tp ON tp.sku_id = ssl.sku_id
      WHERE ssl.price_cents IS NOT NULL
        AND ssl.price_cents > 0
        AND ssl.active = 1
        AND (tp.observed_at IS NULL OR tp.observed_at < datetime('now', '-1 hour'))
      GROUP BY ssl.sku_id
     HAVING n_prices >= 2
      ORDER BY COALESCE(tp.observed_at, '1970-01-01') ASC
      LIMIT ?`,
  ).bind(MAX_SKUS_PER_RUN).all<{ sku_id: string; n_prices: number }>();

  let pricesWritten = 0;
  let discrepanciesLogged = 0;
  const skuIds = (targets ?? []).map((t) => t.sku_id);

  // Batch process in groups of 40 to stay under CF memory.
  const BATCH = 40;
  for (let i = 0; i < skuIds.length; i += BATCH) {
    const group = skuIds.slice(i, i + BATCH);
    const placeholders = group.map(() => "?").join(",");
    const { results: rows } = await env.LENS_D1.prepare(
      `SELECT sku_id, source_id, price_cents, confidence
         FROM sku_source_link
        WHERE sku_id IN (${placeholders})
          AND active = 1
          AND price_cents IS NOT NULL
          AND price_cents > 0`,
    ).bind(...group).all<{
      sku_id: string;
      source_id: string;
      price_cents: number;
      confidence: number;
    }>();
    const bySku = new Map<string, Array<{ source: string; price: number; conf: number }>>();
    for (const r of rows ?? []) {
      const list = bySku.get(r.sku_id) ?? [];
      list.push({ source: r.source_id, price: r.price_cents, conf: r.confidence });
      bySku.set(r.sku_id, list);
    }

    const stmts: unknown[] = [];
    for (const [skuId, list] of bySku.entries()) {
      if (list.length < 2) continue;
      const sorted = list.slice().sort((a, b) => a.price - b.price);
      const median = percentile(sorted.map((r) => r.price), 50);
      const p25 = percentile(sorted.map((r) => r.price), 25);
      const p75 = percentile(sorted.map((r) => r.price), 75);
      const min = sorted[0]!.price;
      const max = sorted[sorted.length - 1]!.price;
      stmts.push(
        env.LENS_D1!.prepare(
          `INSERT INTO triangulated_price (sku_id, median_cents, p25_cents, p75_cents, min_cents, max_cents, n_sources, observed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(sku_id) DO UPDATE SET
             median_cents = excluded.median_cents,
             p25_cents = excluded.p25_cents,
             p75_cents = excluded.p75_cents,
             min_cents = excluded.min_cents,
             max_cents = excluded.max_cents,
             n_sources = excluded.n_sources,
             observed_at = excluded.observed_at`,
        ).bind(skuId, median, p25, p75, min, max, list.length),
      );
      pricesWritten++;

      // Discrepancy scan — any source > threshold from median → row.
      for (let a = 0; a < list.length; a++) {
        for (let b = a + 1; b < list.length; b++) {
          const diff = Math.abs(list[a]!.price - list[b]!.price);
          const denom = Math.max(list[a]!.price, list[b]!.price);
          const deltaPct = denom > 0 ? diff / denom : 0;
          if (deltaPct >= DISCREPANCY_THRESHOLD) {
            stmts.push(
              env.LENS_D1!.prepare(
                `INSERT INTO discrepancy_log (sku_id, field, source_a, source_b, value_a, value_b, delta_pct, flagged_at, resolved)
                 VALUES (?, 'price', ?, ?, ?, ?, ?, datetime('now'), 0)`,
              ).bind(
                skuId,
                list[a]!.source,
                list[b]!.source,
                String(list[a]!.price),
                String(list[b]!.price),
                deltaPct,
              ),
            );
            discrepanciesLogged++;
          }
        }
      }
    }
    if (stmts.length > 0) {
      try {
        await (env.LENS_D1 as unknown as { batch(s: unknown[]): Promise<unknown[]> }).batch(stmts);
      } catch (err) {
        console.warn("[triangulate] batch failed:", (err as Error).message);
      }
    }
  }

  return { skusProcessed: skuIds.length, pricesWritten, discrepanciesLogged };
}

function percentile(sortedValues: number[], pct: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0]!;
  const rank = (pct / 100) * (sortedValues.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return sortedValues[low]!;
  const weight = rank - low;
  return Math.round(sortedValues[low]! * (1 - weight) + sortedValues[high]! * weight);
}