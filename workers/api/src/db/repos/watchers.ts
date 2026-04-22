// F2 — watchers repo.
// Used by Watcher workflows (S6-W33 recall, S6-W34 price-drop, S7-W38 firmware,
// S6-W36 subscription renewal). Each row represents a standing subscription
// that a cron dispatcher (F4) evaluates.

import { WatcherRowSchema, type WatcherKind, type WatcherRow } from "../schemas.js";
import { type D1Like, nowIso, tryRun, ulid } from "../client.js";

export interface CreateWatcherInput {
  userId: string;
  kind: WatcherKind;
  config: unknown;
  active?: boolean;
}

export async function createWatcher(d1: D1Like, input: CreateWatcherInput): Promise<WatcherRow> {
  const row: WatcherRow = {
    id: ulid(),
    user_id: input.userId,
    kind: input.kind,
    config_json: JSON.stringify(input.config),
    active: input.active === false ? 0 : 1,
    created_at: nowIso(),
    last_fired_at: null,
    last_fired_result_json: null,
    fired_count: 0,
  };
  WatcherRowSchema.parse(row);
  await tryRun(
    "watchers.create",
    d1
      .prepare(
        `INSERT INTO watchers (
          id, user_id, kind, config_json, active, created_at,
          last_fired_at, last_fired_result_json, fired_count
        ) VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        row.id,
        row.user_id,
        row.kind,
        row.config_json,
        row.active,
        row.created_at,
        row.last_fired_at,
        row.last_fired_result_json,
        row.fired_count,
      ),
  );
  return row;
}

export async function getWatcher(d1: D1Like, id: string): Promise<WatcherRow | null> {
  const r = await d1.prepare(`SELECT * FROM watchers WHERE id = ? LIMIT 1`).bind(id).first<unknown>();
  return r ? WatcherRowSchema.parse(r) : null;
}

export async function listWatchersByUser(
  d1: D1Like,
  userId: string,
  kind?: WatcherKind,
): Promise<WatcherRow[]> {
  const sql = kind
    ? `SELECT * FROM watchers WHERE user_id = ? AND kind = ? ORDER BY created_at DESC`
    : `SELECT * FROM watchers WHERE user_id = ? ORDER BY created_at DESC`;
  const stmt = kind ? d1.prepare(sql).bind(userId, kind) : d1.prepare(sql).bind(userId);
  const r = await stmt.all<unknown>();
  return (r.results ?? []).map((x) => WatcherRowSchema.parse(x));
}

/**
 * Find all active watchers of a given kind — the cron dispatcher's primary
 * query when it fires a kind-scoped sweep.
 */
export async function listActiveWatchers(d1: D1Like, kind: WatcherKind): Promise<WatcherRow[]> {
  const r = await d1
    .prepare(`SELECT * FROM watchers WHERE active = 1 AND kind = ? ORDER BY last_fired_at ASC NULLS FIRST`)
    .bind(kind)
    .all<unknown>();
  return (r.results ?? []).map((x) => WatcherRowSchema.parse(x));
}

export async function markWatcherFired(
  d1: D1Like,
  id: string,
  result: unknown,
): Promise<void> {
  await tryRun(
    "watchers.mark_fired",
    d1
      .prepare(
        `UPDATE watchers
         SET last_fired_at = ?, last_fired_result_json = ?, fired_count = fired_count + 1
         WHERE id = ?`,
      )
      .bind(nowIso(), JSON.stringify(result), id),
  );
}

export async function setWatcherActive(d1: D1Like, id: string, active: boolean): Promise<void> {
  await tryRun(
    "watchers.set_active",
    d1.prepare(`UPDATE watchers SET active = ? WHERE id = ?`).bind(active ? 1 : 0, id),
  );
}

export async function deleteWatcher(d1: D1Like, id: string): Promise<void> {
  await tryRun("watchers.delete", d1.prepare(`DELETE FROM watchers WHERE id = ?`).bind(id));
}
