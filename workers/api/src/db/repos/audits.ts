// F2 — audits repo.
// Single source of truth for the /audit persistence layer. Called from
// workflows/specs/audit.ts after a successful run, and from history endpoints.

import { AuditRowSchema, type AuditRow } from "../schemas.js";
import { type D1Like, nowIso, tryRun, ulid } from "../client.js";

export interface CreateAuditInput {
  userId: string | null;
  anonUserId: string | null;
  kind: AuditRow["kind"];
  host: string | null;
  category: string | null;
  intent: unknown;
  aiRecommendation?: unknown;
  specOptimal: unknown;
  candidates?: unknown;
  claims?: unknown;
  crossModel?: unknown;
  warnings?: unknown;
  elapsedMsTotal: number;
  packVersionMap?: Record<string, string>;
  clientVersion?: string | null;
  clientOrigin?: AuditRow["client_origin"];
}

export async function createAudit(
  d1: D1Like,
  input: CreateAuditInput,
): Promise<AuditRow> {
  const row: AuditRow = {
    id: ulid(),
    user_id: input.userId,
    anon_user_id: input.anonUserId,
    kind: input.kind,
    host: input.host,
    category: input.category,
    intent_json: JSON.stringify(input.intent),
    ai_recommendation_json: input.aiRecommendation !== undefined ? JSON.stringify(input.aiRecommendation) : null,
    spec_optimal_json: JSON.stringify(input.specOptimal),
    candidates_json: input.candidates !== undefined ? JSON.stringify(input.candidates) : null,
    claims_json: input.claims !== undefined ? JSON.stringify(input.claims) : null,
    cross_model_json: input.crossModel !== undefined ? JSON.stringify(input.crossModel) : null,
    warnings_json: input.warnings !== undefined ? JSON.stringify(input.warnings) : null,
    elapsed_ms_total: input.elapsedMsTotal,
    pack_version_map_json: input.packVersionMap ? JSON.stringify(input.packVersionMap) : null,
    created_at: nowIso(),
    client_version: input.clientVersion ?? null,
    client_origin: input.clientOrigin ?? null,
  };
  AuditRowSchema.parse(row);
  await tryRun(
    "audits.create",
    d1
      .prepare(
        `INSERT INTO audits (
          id, user_id, anon_user_id, kind, host, category,
          intent_json, ai_recommendation_json, spec_optimal_json,
          candidates_json, claims_json, cross_model_json, warnings_json,
          elapsed_ms_total, pack_version_map_json, created_at,
          client_version, client_origin
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        row.id,
        row.user_id,
        row.anon_user_id,
        row.kind,
        row.host,
        row.category,
        row.intent_json,
        row.ai_recommendation_json,
        row.spec_optimal_json,
        row.candidates_json,
        row.claims_json,
        row.cross_model_json,
        row.warnings_json,
        row.elapsed_ms_total,
        row.pack_version_map_json,
        row.created_at,
        row.client_version,
        row.client_origin,
      ),
  );
  return row;
}

export async function getAudit(d1: D1Like, id: string): Promise<AuditRow | null> {
  const raw = await d1.prepare(`SELECT * FROM audits WHERE id = ? LIMIT 1`).bind(id).first<unknown>();
  if (!raw) return null;
  return AuditRowSchema.parse(raw);
}

export interface ListAuditOpts {
  userId?: string;
  anonUserId?: string;
  category?: string;
  limit?: number;
}

export async function listAudits(d1: D1Like, opts: ListAuditOpts): Promise<AuditRow[]> {
  const limit = Math.min(Math.max(1, opts.limit ?? 50), 500);
  const filters: string[] = [];
  const binds: unknown[] = [];
  if (opts.userId) {
    filters.push("user_id = ?");
    binds.push(opts.userId);
  }
  if (opts.anonUserId) {
    filters.push("anon_user_id = ?");
    binds.push(opts.anonUserId);
  }
  if (opts.category) {
    filters.push("category = ?");
    binds.push(opts.category);
  }
  const where = filters.length > 0 ? "WHERE " + filters.join(" AND ") : "";
  const sql = `SELECT * FROM audits ${where} ORDER BY created_at DESC LIMIT ?`;
  const res = await d1
    .prepare(sql)
    .bind(...binds, limit)
    .all<unknown>();
  return (res.results ?? []).map((r) => AuditRowSchema.parse(r));
}

export async function deleteAudit(d1: D1Like, id: string): Promise<void> {
  await tryRun("audits.delete", d1.prepare(`DELETE FROM audits WHERE id = ?`).bind(id));
}

/**
 * Summary stats for the welfare-delta card.
 */
export async function auditCountByUser(
  d1: D1Like,
  opts: { userId?: string; anonUserId?: string },
): Promise<number> {
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
  if (where.length === 0) return 0;
  const r = await d1
    .prepare(`SELECT COUNT(*) AS n FROM audits WHERE ${where.join(" AND ")}`)
    .bind(...binds)
    .first<{ n: number }>();
  return r?.n ?? 0;
}
