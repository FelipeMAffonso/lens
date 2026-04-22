// CJ-W47 — household_members repo.

import { HouseholdMemberRowSchema, type HouseholdMemberRow, type HouseholdRole } from "../schemas.js";
import { type D1Like, nowIso, tryRun, ulid } from "../client.js";

export interface CreateMemberInput {
  userId: string;
  name: string;
  role?: HouseholdRole | null;
  relationship?: string | null;
  birthYear?: number | null;
}

export async function createMember(
  d1: D1Like,
  input: CreateMemberInput,
): Promise<HouseholdMemberRow> {
  const row: HouseholdMemberRow = {
    id: ulid(),
    user_id: input.userId,
    name: input.name,
    role: input.role ?? null,
    relationship: input.relationship ?? null,
    birth_year: input.birthYear ?? null,
    created_at: nowIso(),
    archived_at: null,
  };
  HouseholdMemberRowSchema.parse(row);
  await tryRun(
    "household.create",
    d1
      .prepare(
        `INSERT INTO household_members (
          id, user_id, name, role, relationship, birth_year, created_at, archived_at
        ) VALUES (?,?,?,?,?,?,?,?)`,
      )
      .bind(row.id, row.user_id, row.name, row.role, row.relationship, row.birth_year, row.created_at, row.archived_at),
  );
  return row;
}

export async function listMembersByUser(
  d1: D1Like,
  userId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<HouseholdMemberRow[]> {
  const sql = opts.includeArchived
    ? `SELECT * FROM household_members WHERE user_id = ? ORDER BY created_at ASC`
    : `SELECT * FROM household_members WHERE user_id = ? AND archived_at IS NULL ORDER BY created_at ASC`;
  const r = await d1.prepare(sql).bind(userId).all<unknown>();
  return (r.results ?? []).map((x) => HouseholdMemberRowSchema.parse(x));
}

export async function getMember(d1: D1Like, id: string): Promise<HouseholdMemberRow | null> {
  const r = await d1
    .prepare(`SELECT * FROM household_members WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<unknown>();
  return r ? HouseholdMemberRowSchema.parse(r) : null;
}

export interface PatchMemberInput {
  name?: string;
  role?: HouseholdRole | null;
  relationship?: string | null;
  birthYear?: number | null;
  archived?: boolean; // true → set archived_at, false → clear
}

export async function patchMember(
  d1: D1Like,
  id: string,
  patch: PatchMemberInput,
): Promise<HouseholdMemberRow | null> {
  const existing = await getMember(d1, id);
  if (!existing) return null;
  const updated: HouseholdMemberRow = {
    ...existing,
    name: patch.name ?? existing.name,
    role: patch.role === undefined ? existing.role : patch.role,
    relationship: patch.relationship === undefined ? existing.relationship : patch.relationship,
    birth_year: patch.birthYear === undefined ? existing.birth_year : patch.birthYear,
    archived_at:
      patch.archived === undefined
        ? existing.archived_at
        : patch.archived
          ? (existing.archived_at ?? nowIso())
          : null,
  };
  HouseholdMemberRowSchema.parse(updated);
  await tryRun(
    "household.patch",
    d1
      .prepare(
        `UPDATE household_members
         SET name = ?, role = ?, relationship = ?, birth_year = ?, archived_at = ?
         WHERE id = ?`,
      )
      .bind(updated.name, updated.role, updated.relationship, updated.birth_year, updated.archived_at, updated.id),
  );
  return updated;
}

export async function archiveMember(d1: D1Like, id: string): Promise<void> {
  await tryRun(
    "household.archive",
    d1
      .prepare(`UPDATE household_members SET archived_at = ? WHERE id = ? AND archived_at IS NULL`)
      .bind(nowIso(), id),
  );
}
