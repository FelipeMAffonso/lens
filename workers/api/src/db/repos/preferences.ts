// F2 — preferences repo.
// One row per (user | anon) × category. Upsert semantics.

import { PreferenceRowSchema, type PreferenceRow } from "../schemas.js";
import { type D1Like, nowIso, tryRun, ulid } from "../client.js";

export interface UpsertPreferenceInput {
  userId: string | null;
  anonUserId: string | null;
  category: string;
  criteria: unknown;
  valuesOverlay?: unknown;
  sourceWeighting?: { vendor: number; independent: number };
  /** CJ-W47 — null/undefined = household default; non-null = per-profile override. */
  profileId?: string | null;
}

export async function upsertPreference(
  d1: D1Like,
  input: UpsertPreferenceInput,
): Promise<PreferenceRow> {
  if (!input.userId && !input.anonUserId) {
    throw new Error("preferences: at least one of userId / anonUserId required");
  }
  const profileId = input.profileId ?? null;
  const existing = await findPreference(d1, {
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.anonUserId ? { anonUserId: input.anonUserId } : {}),
    category: input.category,
    profileId,
  });
  const now = nowIso();
  if (existing) {
    const updated: PreferenceRow = {
      ...existing,
      criteria_json: JSON.stringify(input.criteria),
      values_overlay_json: input.valuesOverlay !== undefined ? JSON.stringify(input.valuesOverlay) : existing.values_overlay_json,
      source_weighting_json: input.sourceWeighting !== undefined ? JSON.stringify(input.sourceWeighting) : existing.source_weighting_json,
      updated_at: now,
    };
    PreferenceRowSchema.parse(updated);
    await tryRun(
      "preferences.update",
      d1
        .prepare(
          `UPDATE preferences SET criteria_json = ?, values_overlay_json = ?, source_weighting_json = ?, updated_at = ? WHERE id = ?`,
        )
        .bind(
          updated.criteria_json,
          updated.values_overlay_json,
          updated.source_weighting_json,
          updated.updated_at,
          updated.id,
        ),
    );
    return updated;
  }
  const row: PreferenceRow = {
    id: ulid(),
    user_id: input.userId ?? null,
    anon_user_id: input.anonUserId ?? null,
    category: input.category,
    criteria_json: JSON.stringify(input.criteria),
    values_overlay_json: input.valuesOverlay !== undefined ? JSON.stringify(input.valuesOverlay) : null,
    source_weighting_json: input.sourceWeighting !== undefined ? JSON.stringify(input.sourceWeighting) : null,
    profile_id: profileId,
    updated_at: now,
    created_at: now,
  };
  PreferenceRowSchema.parse(row);
  await tryRun(
    "preferences.create",
    d1
      .prepare(
        `INSERT INTO preferences (
          id, user_id, anon_user_id, category, criteria_json,
          values_overlay_json, source_weighting_json, profile_id,
          updated_at, created_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        row.id,
        row.user_id,
        row.anon_user_id,
        row.category,
        row.criteria_json,
        row.values_overlay_json,
        row.source_weighting_json,
        row.profile_id ?? null,
        row.updated_at,
        row.created_at,
      ),
  );
  return row;
}

export interface FindPreferenceOpts {
  userId?: string;
  anonUserId?: string;
  category: string;
  /**
   * CJ-W47 — null or undefined means "the household-default row"
   * (stored as NULL profile_id). A non-null string scopes to that profile.
   */
  profileId?: string | null;
}

export async function findPreference(
  d1: D1Like,
  opts: FindPreferenceOpts,
): Promise<PreferenceRow | null> {
  const profileIdClause = (() => {
    if (opts.profileId === undefined || opts.profileId === null) {
      return { sql: `profile_id IS NULL`, bind: [] as unknown[] };
    }
    return { sql: `profile_id = ?`, bind: [opts.profileId] as unknown[] };
  })();
  if (opts.userId) {
    const sql = `SELECT * FROM preferences WHERE user_id = ? AND category = ? AND ${profileIdClause.sql} LIMIT 1`;
    const r = await d1
      .prepare(sql)
      .bind(opts.userId, opts.category, ...profileIdClause.bind)
      .first<unknown>();
    return r ? PreferenceRowSchema.parse(r) : null;
  }
  if (opts.anonUserId) {
    const sql = `SELECT * FROM preferences WHERE anon_user_id = ? AND category = ? AND ${profileIdClause.sql} LIMIT 1`;
    const r = await d1
      .prepare(sql)
      .bind(opts.anonUserId, opts.category, ...profileIdClause.bind)
      .first<unknown>();
    return r ? PreferenceRowSchema.parse(r) : null;
  }
  return null;
}

export async function listPreferencesByUser(
  d1: D1Like,
  opts: { userId?: string; anonUserId?: string },
): Promise<PreferenceRow[]> {
  const binds: unknown[] = [];
  const where: string[] = [];
  if (opts.userId) {
    where.push("user_id = ?");
    binds.push(opts.userId);
  }
  if (opts.anonUserId) {
    where.push("anon_user_id = ?");
    binds.push(opts.anonUserId);
  }
  if (where.length === 0) return [];
  const r = await d1
    .prepare(`SELECT * FROM preferences WHERE ${where.join(" OR ")} ORDER BY updated_at DESC`)
    .bind(...binds)
    .all<unknown>();
  return (r.results ?? []).map((x) => PreferenceRowSchema.parse(x));
}

export async function deletePreference(d1: D1Like, id: string): Promise<void> {
  await tryRun("preferences.delete", d1.prepare(`DELETE FROM preferences WHERE id = ?`).bind(id));
}
