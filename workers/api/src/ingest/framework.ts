// IMPROVEMENT_PLAN_V2 Phase A2 — the ingestion framework.
//
// Every data source in Lens's ground-truth spine implements `DatasetIngester`.
// The framework:
//   1. Opens a new `ingestion_run` row before calling the ingester.
//   2. Times out each run at `maxDurationMs` so a single flaky source can't
//      hold the cron worker.
//   3. Captures errors, writes a truncated sample to the run row.
//   4. Updates `data_source` with fresh counters so the landing page's
//      `/architecture/stats` endpoint can read them without a re-join.
//   5. Keeps per-run transaction boundaries predictable: the ingester is
//      responsible for idempotent UPSERTs; the framework does NOT wrap the
//      inner loop in a single D1 transaction (wrong for 3M-row ingesters).
//
// Usage:
//   await runIngester(cpscRecallsIngester, env);
//
// Scheduled usage (from cron handler):
//   for (const ingester of await pickDueIngesters(env)) {
//     await runIngester(ingester, env);
//   }

import type { Env } from "../index.js";

function db(env: Env): D1Database {
  if (!env.LENS_D1) throw new Error("LENS_D1 binding required for ingestion");
  return env.LENS_D1 as D1Database;
}

export interface IngestionReport {
  /** Rows the source returned (may include duplicates / already-seen) */
  rowsSeen: number;
  /** Rows persisted via INSERT OR REPLACE / ON CONFLICT */
  rowsUpserted: number;
  /** Rows skipped (not an error, just irrelevant / already-current / malformed) */
  rowsSkipped: number;
  /** Error message samples (max 10 — we don't want a runaway to fill D1) */
  errors: string[];
  /** Freeform notes, truncated to 16KB before persist. Safe to be chatty. */
  log?: string;
}

export interface IngestionContext {
  env: Env;
  runId: number;
  /** Abort signal wired to the framework-level timeout */
  signal: AbortSignal;
  /** Emit progress to the run row (not per-row — batch in blocks of ~500) */
  progress(delta: Partial<IngestionReport>): Promise<void>;
}

export interface DatasetIngester {
  /** Matches `data_source.id`. Primary key for the whole source. */
  id: string;
  /** Max wall-clock per run. Default 4 minutes (safely under Cron Trigger 30 min ceiling). */
  maxDurationMs?: number;
  /** Called exactly once per run. Must be idempotent — reruns must converge. */
  run(ctx: IngestionContext): Promise<IngestionReport>;
}

const DEFAULT_MAX_MS = 240_000;  // 4 minutes

export async function runIngester(ingester: DatasetIngester, env: Env): Promise<{
  runId: number;
  report: IngestionReport;
  status: "ok" | "partial" | "error";
  durationMs: number;
}> {
  const maxMs = ingester.maxDurationMs ?? DEFAULT_MAX_MS;
  const startMs = Date.now();

  // 1. Open run row.
  const runId = await openRun(env, ingester.id);
  await markSourceRunning(env, ingester.id);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), maxMs);

  const counters: IngestionReport = {
    rowsSeen: 0,
    rowsUpserted: 0,
    rowsSkipped: 0,
    errors: [],
  };

  const ctx: IngestionContext = {
    env,
    runId,
    signal: controller.signal,
    progress: async (delta) => {
      if (delta.rowsSeen != null) counters.rowsSeen += delta.rowsSeen;
      if (delta.rowsUpserted != null) counters.rowsUpserted += delta.rowsUpserted;
      if (delta.rowsSkipped != null) counters.rowsSkipped += delta.rowsSkipped;
      if (delta.errors?.length) {
        for (const e of delta.errors) {
          if (counters.errors.length < 10) counters.errors.push(e);
        }
      }
      await updateRunCounters(env, runId, counters);
    },
  };

  let status: "ok" | "partial" | "error" = "ok";
  let report: IngestionReport | null = null;
  try {
    report = await ingester.run(ctx);
    // Merge final report over counters (ingester may return a fresh object
    // or mutate ctx-scoped counters via progress()).
    counters.rowsSeen = report.rowsSeen;
    counters.rowsUpserted = report.rowsUpserted;
    counters.rowsSkipped = report.rowsSkipped;
    counters.errors = report.errors.slice(0, 10);
    counters.log = report.log;
    status = report.errors.length === 0 ? "ok" : "partial";
  } catch (err) {
    status = "error";
    const msg = (err as Error).message ?? String(err);
    if (counters.errors.length < 10) counters.errors.push(msg);
    console.warn("[ingest:%s] run failed:", ingester.id, msg);
  } finally {
    clearTimeout(timer);
  }

  const durationMs = Date.now() - startMs;
  await closeRun(env, runId, status, counters, durationMs);
  await markSourceDone(env, ingester.id, status, counters, durationMs);

  return { runId, report: report ?? counters, status, durationMs };
}

// --- D1 helpers --------------------------------------------------------

async function openRun(env: Env, sourceId: string): Promise<number> {
  const res = await db(env).prepare(
    "INSERT INTO ingestion_run (source_id) VALUES (?) RETURNING id",
  )
    .bind(sourceId)
    .first<{ id: number }>();
  if (!res?.id) throw new Error(`failed to open ingestion_run for ${sourceId}`);
  return res.id;
}

async function closeRun(
  env: Env,
  runId: number,
  status: string,
  counters: IngestionReport,
  durationMs: number,
): Promise<void> {
  const errorSample = JSON.stringify(counters.errors.slice(0, 10));
  const log = truncate(counters.log ?? "", 16_000);
  await db(env).prepare(
    `UPDATE ingestion_run SET
      finished_at = datetime('now'),
      status = ?,
      rows_seen = ?,
      rows_upserted = ?,
      rows_skipped = ?,
      error_count = ?,
      error_sample = ?,
      log = ?,
      duration_ms = ?
     WHERE id = ?`,
  )
    .bind(
      status,
      counters.rowsSeen,
      counters.rowsUpserted,
      counters.rowsSkipped,
      counters.errors.length,
      errorSample,
      log,
      durationMs,
      runId,
    )
    .run();
}

async function updateRunCounters(
  env: Env,
  runId: number,
  counters: IngestionReport,
): Promise<void> {
  await db(env).prepare(
    `UPDATE ingestion_run SET
      rows_seen = ?,
      rows_upserted = ?,
      rows_skipped = ?,
      error_count = ?
     WHERE id = ?`,
  )
    .bind(
      counters.rowsSeen,
      counters.rowsUpserted,
      counters.rowsSkipped,
      counters.errors.length,
      runId,
    )
    .run();
}

async function markSourceRunning(env: Env, sourceId: string): Promise<void> {
  await db(env).prepare(
    "UPDATE data_source SET status = 'running', last_run_at = datetime('now') WHERE id = ?",
  )
    .bind(sourceId)
    .run();
}

async function markSourceDone(
  env: Env,
  sourceId: string,
  status: string,
  counters: IngestionReport,
  _durationMs: number,
): Promise<void> {
  const newStatus = status === "ok" ? "ok" : status === "partial" ? "stale" : "failing";
  const lastSuccess = status === "ok" ? "datetime('now')" : "last_success_at";
  const lastError = counters.errors.length > 0 ? counters.errors[0] : null;
  await db(env).prepare(
    `UPDATE data_source SET
      status = ?,
      last_success_at = ${lastSuccess},
      last_error = ?,
      rows_total = rows_total + ?
     WHERE id = ?`,
  )
    .bind(newStatus, lastError ?? null, counters.rowsUpserted, sourceId)
    .run();
}

/** Return the subset of registered ingesters whose cadence is due. */
export async function pickDueIngesterIds(env: Env): Promise<string[]> {
  const { results } = await db(env).prepare(
    `SELECT id, cadence_minutes, last_run_at
       FROM data_source
      WHERE status != 'disabled'
      ORDER BY last_run_at IS NULL DESC, last_run_at ASC`,
  ).all<{ id: string; cadence_minutes: number; last_run_at: string | null }>();

  const now = Date.now();
  const due: string[] = [];
  for (const row of results ?? []) {
    if (!row.last_run_at) {
      due.push(row.id);
      continue;
    }
    const last = new Date(row.last_run_at + "Z").getTime();
    if (Number.isNaN(last)) {
      due.push(row.id);
      continue;
    }
    if (now - last >= row.cadence_minutes * 60_000) due.push(row.id);
  }
  return due;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 20) + "... [truncated]";
}

// Shared helper: upsert brand rows before inserting sku_catalog rows that
// reference brand_slug via FK. Batched per call.
export async function ensureBrands(env: Env, brands: Map<string, string>): Promise<void> {
  if (brands.size === 0) return;
  const stmts = Array.from(brands.entries()).map(([slug, name]) =>
    db(env).prepare(
      "INSERT INTO brand_index (slug, name) VALUES (?, ?) ON CONFLICT(slug) DO NOTHING",
    ).bind(slug, name.slice(0, 200)),
  );
  try {
    await (db(env) as unknown as { batch(s: unknown[]): Promise<unknown[]> }).batch(stmts);
  } catch (err) {
    console.warn("[ingest:ensureBrands] upsert failed:", (err as Error).message);
  }
}