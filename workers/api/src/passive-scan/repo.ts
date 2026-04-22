// S4-W22 — D1 persistence for passive scans.
// Graceful no-op when LENS_D1 is unset (local dev without bindings).

import type { ConfirmedHit, DismissedHit } from "./types.js";

interface D1Prep {
  bind: (...values: unknown[]) => D1Prep;
  run: () => Promise<unknown>;
}
interface D1Like {
  prepare: (sql: string) => D1Prep;
  batch?: (stmts: D1Prep[]) => Promise<unknown>;
}

export interface PersistOptions {
  runId: string;
  host: string;
  pageType: string;
  url?: string;
  hitCount: number;
  confirmedCount: number;
  latencyMs: number;
  ran: "opus" | "heuristic-only";
  userId?: string | null;
  anonUserId?: string | null;
  confirmed: ConfirmedHit[];
  dismissed: DismissedHit[];
}

export async function persistScan(d1: D1Like | null | undefined, o: PersistOptions): Promise<void> {
  if (!d1) return;
  const now = new Date().toISOString();
  try {
    await d1
      .prepare(
        `INSERT INTO passive_scans
           (id, created_at, host, page_type, url, hit_count, confirmed_count, latency_ms, ran, user_id, anon_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        o.runId,
        now,
        o.host,
        o.pageType,
        o.url ?? null,
        o.hitCount,
        o.confirmedCount,
        o.latencyMs,
        o.ran,
        o.userId ?? null,
        o.anonUserId ?? null,
      )
      .run();

    // Per-(host, brignullId) k-anonymous aggregate counter. Upsert pattern
    // via ON CONFLICT since the composite key is (host, brignull_id).
    for (const hit of o.confirmed) {
      if (hit.verdict !== "confirmed") continue;
      await d1
        .prepare(
          `INSERT INTO passive_scan_aggregates (host, brignull_id, count, first_seen, last_seen)
           VALUES (?, ?, 1, ?, ?)
           ON CONFLICT(host, brignull_id) DO UPDATE SET
             count = count + 1,
             last_seen = excluded.last_seen`,
        )
        .bind(o.host, hit.brignullId, now, now)
        .run();
    }
  } catch (err) {
    // Don't surface D1 errors as user errors; observability catches them.
    console.error("[passive-scan] d1 persist error:", (err as Error).message);
  }
}

export async function getAggregatesForHost(
  d1: D1Like | null | undefined,
  host: string,
): Promise<Array<{ brignullId: string; count: number; lastSeen: string }>> {
  if (!d1) return [];
  const prep = d1.prepare(
    `SELECT brignull_id, count, last_seen FROM passive_scan_aggregates WHERE host = ? ORDER BY count DESC LIMIT 50`,
  );
  const res = (await prep.bind(host).run()) as {
    results?: Array<{ brignull_id: string; count: number; last_seen: string }>;
  };
  return (res.results ?? []).map((r) => ({
    brignullId: r.brignull_id,
    count: r.count,
    lastSeen: r.last_seen,
  }));
}
