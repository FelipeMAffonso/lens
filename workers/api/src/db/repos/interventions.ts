// F2 — interventions repo.
// Advocate-workflow output lives here: FTC complaint drafts, Magnuson-Moss
// returns, subscription cancellations, price-match filings.

import {
  InterventionRowSchema,
  type InterventionRow,
  type InterventionStatus,
} from "../schemas.js";
import { type D1Like, nowIso, tryRun, ulid } from "../client.js";

export interface CreateInterventionInput {
  userId: string;
  packSlug: string;
  payload: unknown;
  status?: InterventionStatus;
  relatedPurchaseId?: string | null;
  relatedAuditId?: string | null;
  relatedWatcherId?: string | null;
}

export async function createIntervention(
  d1: D1Like,
  input: CreateInterventionInput,
): Promise<InterventionRow> {
  const row: InterventionRow = {
    id: ulid(),
    user_id: input.userId,
    pack_slug: input.packSlug,
    status: input.status ?? "drafted",
    payload_json: JSON.stringify(input.payload),
    related_purchase_id: input.relatedPurchaseId ?? null,
    related_audit_id: input.relatedAuditId ?? null,
    related_watcher_id: input.relatedWatcherId ?? null,
    created_at: nowIso(),
    sent_at: null,
    response_received_at: null,
    response_payload_json: null,
    next_intervention_id: null,
  };
  InterventionRowSchema.parse(row);
  await tryRun(
    "interventions.create",
    d1
      .prepare(
        `INSERT INTO interventions (
          id, user_id, pack_slug, status, payload_json,
          related_purchase_id, related_audit_id, related_watcher_id,
          created_at, sent_at, response_received_at, response_payload_json,
          next_intervention_id
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        row.id,
        row.user_id,
        row.pack_slug,
        row.status,
        row.payload_json,
        row.related_purchase_id,
        row.related_audit_id,
        row.related_watcher_id,
        row.created_at,
        row.sent_at,
        row.response_received_at,
        row.response_payload_json,
        row.next_intervention_id,
      ),
  );
  return row;
}

export async function getIntervention(d1: D1Like, id: string): Promise<InterventionRow | null> {
  const r = await d1
    .prepare(`SELECT * FROM interventions WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<unknown>();
  return r ? InterventionRowSchema.parse(r) : null;
}

export async function listInterventionsByUser(
  d1: D1Like,
  userId: string,
  status?: InterventionStatus,
): Promise<InterventionRow[]> {
  const sql = status
    ? `SELECT * FROM interventions WHERE user_id = ? AND status = ? ORDER BY created_at DESC`
    : `SELECT * FROM interventions WHERE user_id = ? ORDER BY created_at DESC`;
  const stmt = status ? d1.prepare(sql).bind(userId, status) : d1.prepare(sql).bind(userId);
  const r = await stmt.all<unknown>();
  return (r.results ?? []).map((x) => InterventionRowSchema.parse(x));
}

export async function markInterventionSent(d1: D1Like, id: string): Promise<void> {
  await tryRun(
    "interventions.mark_sent",
    d1
      .prepare(`UPDATE interventions SET status = 'sent', sent_at = ? WHERE id = ?`)
      .bind(nowIso(), id),
  );
}

export async function recordInterventionResponse(
  d1: D1Like,
  id: string,
  status: Exclude<InterventionStatus, "drafted" | "sent">,
  responsePayload: unknown,
): Promise<void> {
  await tryRun(
    "interventions.record_response",
    d1
      .prepare(
        `UPDATE interventions
         SET status = ?, response_received_at = ?, response_payload_json = ?
         WHERE id = ?`,
      )
      .bind(status, nowIso(), JSON.stringify(responsePayload), id),
  );
}

export async function deleteIntervention(d1: D1Like, id: string): Promise<void> {
  await tryRun(
    "interventions.delete",
    d1.prepare(`DELETE FROM interventions WHERE id = ?`).bind(id),
  );
}
