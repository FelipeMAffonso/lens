// F3 — D1 persistence for workflow runs.
//
// The run log is best-effort. If LENS_D1 isn't bound (local without wrangler
// login, or a degraded production state), the engine still runs; it just
// skips persistence. This preserves the audit-flow happy path while the
// persistence layer stabilizes.

import type { Run } from "./spec.js";

// Minimal D1 interface — matches @cloudflare/workers-types D1Database
interface D1Minimal {
  prepare: (sql: string) => {
    bind: (...values: unknown[]) => {
      run: () => Promise<unknown>;
      first: () => Promise<unknown>;
      all: () => Promise<{ results: unknown[] }>;
    };
  };
}

export async function createRunLog(db: D1Minimal | undefined, run: Run): Promise<void> {
  if (!db) return;
  try {
    await db
      .prepare(
        `INSERT INTO workflow_runs (
           id, workflow_id, workflow_version, user_id, anon_user_id,
           status, input_json, output_json, error_json, nodes_json,
           started_at, completed_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        run.id,
        run.workflowId,
        run.workflowVersion,
        run.userId ?? null,
        run.anonUserId ?? null,
        run.status,
        JSON.stringify(run.input),
        run.output === undefined ? null : JSON.stringify(run.output),
        run.error ? JSON.stringify(run.error) : null,
        JSON.stringify(run.nodes),
        run.startedAt,
        run.completedAt ?? null,
      )
      .run();
  } catch (e) {
    console.error("[workflow.runs-log] create failed:", (e as Error).message);
  }
}

export async function updateRunLog(db: D1Minimal | undefined, run: Run): Promise<void> {
  if (!db) return;
  try {
    await db
      .prepare(
        `UPDATE workflow_runs
            SET status = ?, output_json = ?, error_json = ?, nodes_json = ?, completed_at = ?
          WHERE id = ?`,
      )
      .bind(
        run.status,
        run.output === undefined ? null : JSON.stringify(run.output),
        run.error ? JSON.stringify(run.error) : null,
        JSON.stringify(run.nodes),
        run.completedAt ?? null,
        run.id,
      )
      .run();
  } catch (e) {
    console.error("[workflow.runs-log] update failed:", (e as Error).message);
  }
}

export interface PersistedRunRow {
  id: string;
  workflow_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  nodes_json: string;
  input_json: string;
  output_json: string | null;
  error_json: string | null;
}

export async function getRunLog(
  db: D1Minimal | undefined,
  runId: string,
): Promise<PersistedRunRow | null> {
  if (!db) return null;
  try {
    const row = (await db
      .prepare(`SELECT * FROM workflow_runs WHERE id = ? LIMIT 1`)
      .bind(runId)
      .first()) as PersistedRunRow | null;
    return row ?? null;
  } catch {
    return null;
  }
}
