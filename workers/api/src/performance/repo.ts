// S6-W37 — performance_ratings D1 repo.

import { PerformanceRatingRowSchema, type PerformanceRatingRow } from "../db/schemas.js";
import { type D1Like, nowIso, tryRun, ulid } from "../db/client.js";
import type { CriterionFeedback, PreferenceUpdate } from "./types.js";

export interface UpsertRatingInput {
  userId: string;
  purchaseId: string;
  overallRating: number;
  wouldBuyAgain: boolean;
  criterionFeedback?: CriterionFeedback[];
  notes?: string;
  preferenceSnapshot?: PreferenceUpdate;
  category?: string | null;
}

/**
 * UPSERT by (user_id, purchase_id). A second POST to the same purchase
 * replaces the prior rating — idempotent, the user can change their mind.
 */
export async function upsertRating(
  d1: D1Like,
  input: UpsertRatingInput,
): Promise<PerformanceRatingRow> {
  const existing = await getByPurchase(d1, input.userId, input.purchaseId);
  const now = nowIso();
  const criterionJson = input.criterionFeedback ? JSON.stringify(input.criterionFeedback) : null;
  const snapshotJson = input.preferenceSnapshot ? JSON.stringify(input.preferenceSnapshot) : null;

  if (existing) {
    const updated: PerformanceRatingRow = {
      ...existing,
      overall_rating: input.overallRating,
      would_buy_again: input.wouldBuyAgain ? 1 : 0,
      criterion_feedback_json: criterionJson,
      notes: input.notes ?? null,
      preference_snapshot_json: snapshotJson,
      category: input.category ?? existing.category,
    };
    PerformanceRatingRowSchema.parse(updated);
    await tryRun(
      "performance.update",
      d1
        .prepare(
          `UPDATE performance_ratings
           SET overall_rating = ?, would_buy_again = ?, criterion_feedback_json = ?,
               notes = ?, preference_snapshot_json = ?, category = ?
           WHERE id = ?`,
        )
        .bind(
          updated.overall_rating,
          updated.would_buy_again,
          updated.criterion_feedback_json,
          updated.notes,
          updated.preference_snapshot_json,
          updated.category,
          updated.id,
        ),
    );
    return updated;
  }

  const row: PerformanceRatingRow = {
    id: ulid(),
    user_id: input.userId,
    purchase_id: input.purchaseId,
    overall_rating: input.overallRating,
    would_buy_again: input.wouldBuyAgain ? 1 : 0,
    criterion_feedback_json: criterionJson,
    notes: input.notes ?? null,
    preference_snapshot_json: snapshotJson,
    category: input.category ?? null,
    created_at: now,
  };
  PerformanceRatingRowSchema.parse(row);
  await tryRun(
    "performance.insert",
    d1
      .prepare(
        `INSERT INTO performance_ratings (
          id, user_id, purchase_id, overall_rating, would_buy_again,
          criterion_feedback_json, notes, preference_snapshot_json,
          category, created_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        row.id,
        row.user_id,
        row.purchase_id,
        row.overall_rating,
        row.would_buy_again,
        row.criterion_feedback_json,
        row.notes,
        row.preference_snapshot_json,
        row.category,
        row.created_at,
      ),
  );
  return row;
}

export async function getByPurchase(
  d1: D1Like,
  userId: string,
  purchaseId: string,
): Promise<PerformanceRatingRow | null> {
  const r = await d1
    .prepare(`SELECT * FROM performance_ratings WHERE user_id = ? AND purchase_id = ? LIMIT 1`)
    .bind(userId, purchaseId)
    .first<unknown>();
  return r ? PerformanceRatingRowSchema.parse(r) : null;
}

export async function listByUser(
  d1: D1Like,
  userId: string,
  opts: { limit?: number } = {},
): Promise<PerformanceRatingRow[]> {
  const limit = Math.min(Math.max(1, opts.limit ?? 200), 500);
  const res = await d1
    .prepare(
      `SELECT * FROM performance_ratings WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .bind(userId, limit)
    .all<unknown>();
  return (res.results ?? []).map((x) => PerformanceRatingRowSchema.parse(x));
}
