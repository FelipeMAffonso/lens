// F16 — ticker D1 persistence.

import type { TickerBucket } from "./aggregator.js";

interface D1Minimal {
  prepare: (sql: string) => {
    bind: (...values: unknown[]) => {
      run: () => Promise<unknown>;
      first: () => Promise<unknown>;
      all: () => Promise<{ results: unknown[] }>;
    };
  };
}

export async function insertBuckets(
  db: D1Minimal | undefined,
  buckets: TickerBucket[],
): Promise<number> {
  if (!db) return 0;
  if (buckets.length === 0) return 0;
  let count = 0;
  for (const b of buckets) {
    try {
      await db
        .prepare(
          `INSERT INTO ticker_events (
             id, bucket_key, category, host, geo, k, sample_size,
             agreement_rate, avg_utility_gap, avg_price_gap, computed_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          b.id,
          b.bucket_key,
          b.category,
          b.host,
          b.geo,
          b.k,
          b.sample_size,
          b.agreement_rate,
          b.avg_utility_gap,
          b.avg_price_gap,
          b.computed_at,
        )
        .run();
      count += 1;
    } catch (e) {
      // continue through duplicates / transient failures
      console.error("[ticker.insert] failed:", (e as Error).message);
    }
  }
  return count;
}

export async function listTicker(
  db: D1Minimal | undefined,
  opts: { category?: string; host?: string; limit?: number } = {},
): Promise<TickerBucket[]> {
  if (!db) return [];
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  // Return the LATEST row per bucket_key (within the limit window).
  const clauses: string[] = [];
  const binds: unknown[] = [];
  if (opts.category) {
    clauses.push("category = ?");
    binds.push(opts.category);
  }
  if (opts.host) {
    clauses.push("host = ?");
    binds.push(opts.host);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const sql = `
    SELECT t.*
    FROM ticker_events t
    INNER JOIN (
      SELECT bucket_key, MAX(computed_at) AS latest
      FROM ticker_events
      ${where}
      GROUP BY bucket_key
    ) mx
    ON t.bucket_key = mx.bucket_key AND t.computed_at = mx.latest
    ORDER BY t.computed_at DESC
    LIMIT ?
  `;
  const stmt = db.prepare(sql).bind(...binds, limit);
  const res = await stmt.all();
  return (res.results ?? []) as unknown as TickerBucket[];
}

export async function getAuditRunsForAggregation(
  db: D1Minimal | undefined,
  opts: { sinceIso?: string } = {},
): Promise<Array<{
  id: string;
  workflow_id: string;
  status: string;
  anon_user_id: string | null;
  user_id: string | null;
  input_json: string;
  output_json: string | null;
  started_at: string;
}>> {
  if (!db) return [];
  const since = opts.sinceIso ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const res = await db
    .prepare(
      `SELECT id, workflow_id, status, anon_user_id, user_id, input_json, output_json, started_at
       FROM workflow_runs
       WHERE workflow_id = ? AND status = ? AND started_at >= ?
       ORDER BY started_at DESC
       LIMIT 5000`,
    )
    .bind("audit", "completed", since)
    .all();
  return (res.results ?? []) as unknown as Array<{
    id: string;
    workflow_id: string;
    status: string;
    anon_user_id: string | null;
    user_id: string | null;
    input_json: string;
    output_json: string | null;
    started_at: string;
  }>;
}
