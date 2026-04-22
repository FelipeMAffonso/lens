// CJ-W48 — D1 repo for gift_requests + gift_responses.

import {
  GiftRequestRowSchema,
  GiftResponseRowSchema,
  type GiftRequestRow,
  type GiftResponseRow,
  type GiftStatus,
} from "../db/schemas.js";
import { type D1Like, nowIso, tryRun, ulid } from "../db/client.js";

export interface CreateGiftInput {
  giverUserId: string;
  recipientLabel?: string | null;
  occasion?: string | null;
  category?: string | null;
  budgetMinCents?: number | null;
  budgetMaxCents: number;
  shareTokenHash: string;
  expiresAt: string;
}

export async function createGift(d1: D1Like, input: CreateGiftInput): Promise<GiftRequestRow> {
  const row: GiftRequestRow = {
    id: ulid(),
    giver_user_id: input.giverUserId,
    recipient_label: input.recipientLabel ?? null,
    occasion: input.occasion ?? null,
    category: input.category ?? null,
    budget_min: input.budgetMinCents ?? null,
    budget_max: input.budgetMaxCents,
    share_token_hash: input.shareTokenHash,
    status: "awaiting",
    expires_at: input.expiresAt,
    created_at: nowIso(),
    completed_at: null,
    revoked_at: null,
  };
  GiftRequestRowSchema.parse(row);
  await tryRun(
    "gift.create",
    d1
      .prepare(
        `INSERT INTO gift_requests (
          id, giver_user_id, recipient_label, occasion, category,
          budget_min, budget_max, share_token_hash, status,
          expires_at, created_at, completed_at, revoked_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        row.id,
        row.giver_user_id,
        row.recipient_label,
        row.occasion,
        row.category,
        row.budget_min,
        row.budget_max,
        row.share_token_hash,
        row.status,
        row.expires_at,
        row.created_at,
        row.completed_at,
        row.revoked_at,
      ),
  );
  return row;
}

export async function getGift(d1: D1Like, id: string): Promise<GiftRequestRow | null> {
  const r = await d1
    .prepare(`SELECT * FROM gift_requests WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<unknown>();
  return r ? GiftRequestRowSchema.parse(r) : null;
}

export async function getGiftByTokenHash(
  d1: D1Like,
  tokenHash: string,
): Promise<GiftRequestRow | null> {
  const r = await d1
    .prepare(`SELECT * FROM gift_requests WHERE share_token_hash = ? LIMIT 1`)
    .bind(tokenHash)
    .first<unknown>();
  return r ? GiftRequestRowSchema.parse(r) : null;
}

export async function listGiftsByUser(
  d1: D1Like,
  userId: string,
  opts: { limit?: number } = {},
): Promise<GiftRequestRow[]> {
  const limit = Math.min(Math.max(1, opts.limit ?? 100), 500);
  const res = await d1
    .prepare(`SELECT * FROM gift_requests WHERE giver_user_id = ? ORDER BY created_at DESC LIMIT ?`)
    .bind(userId, limit)
    .all<unknown>();
  return (res.results ?? []).map((x) => GiftRequestRowSchema.parse(x));
}

export async function markGiftStatus(
  d1: D1Like,
  id: string,
  status: GiftStatus,
): Promise<void> {
  const now = nowIso();
  const timestampCol =
    status === "completed" ? "completed_at" : status === "revoked" ? "revoked_at" : null;
  const sql = timestampCol
    ? `UPDATE gift_requests SET status = ?, ${timestampCol} = ? WHERE id = ?`
    : `UPDATE gift_requests SET status = ? WHERE id = ?`;
  const binds = timestampCol ? [status, now, id] : [status, id];
  await tryRun(
    `gift.mark-${status}`,
    d1.prepare(sql).bind(...binds),
  );
}

export async function upsertGiftResponse(
  d1: D1Like,
  giftId: string,
  criteria: Record<string, number>,
  notes: string | null,
): Promise<GiftResponseRow> {
  const existing = await getGiftResponse(d1, giftId);
  const now = nowIso();
  const row: GiftResponseRow = {
    gift_id: giftId,
    criteria_json: JSON.stringify(criteria),
    recipient_notes: notes,
    submitted_at: now,
  };
  GiftResponseRowSchema.parse(row);
  if (existing) {
    await tryRun(
      "gift.response.update",
      d1
        .prepare(
          `UPDATE gift_responses SET criteria_json = ?, recipient_notes = ?, submitted_at = ? WHERE gift_id = ?`,
        )
        .bind(row.criteria_json, row.recipient_notes, row.submitted_at, row.gift_id),
    );
    return row;
  }
  await tryRun(
    "gift.response.insert",
    d1
      .prepare(
        `INSERT INTO gift_responses (gift_id, criteria_json, recipient_notes, submitted_at) VALUES (?,?,?,?)`,
      )
      .bind(row.gift_id, row.criteria_json, row.recipient_notes, row.submitted_at),
  );
  return row;
}

export async function getGiftResponse(d1: D1Like, giftId: string): Promise<GiftResponseRow | null> {
  const r = await d1
    .prepare(`SELECT * FROM gift_responses WHERE gift_id = ? LIMIT 1`)
    .bind(giftId)
    .first<unknown>();
  return r ? GiftResponseRowSchema.parse(r) : null;
}
