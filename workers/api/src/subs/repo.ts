// S0-W5 — subscriptions D1 repo.

import { type D1Like, nowIso, tryRun, ulid } from "../db/client.js";
import type { Cadence, ClassifiedSubscription, Intent, SubscriptionRow } from "./types.js";

function rowOf(
  base: Partial<SubscriptionRow> & { user_id: string; service: string; first_seen: string; last_seen: string },
): SubscriptionRow {
  return {
    id: base.id ?? ulid(),
    user_id: base.user_id,
    service: base.service,
    amount: base.amount ?? null,
    currency: base.currency ?? "USD",
    cadence: base.cadence ?? null,
    next_renewal_at: base.next_renewal_at ?? null,
    source: base.source ?? "manual",
    source_ref: base.source_ref ?? null,
    active: base.active ?? 1,
    detected_intent: base.detected_intent ?? null,
    first_seen: base.first_seen,
    last_seen: base.last_seen,
    raw_payload_json: base.raw_payload_json ?? null,
  };
}

export interface UpsertInput {
  userId: string;
  classified: ClassifiedSubscription;
  source: "gmail" | "manual" | "extension";
  rawPayload?: unknown;
}

/**
 * UPSERT by (user_id, service). If the row exists, bump last_seen +
 * refresh cadence/amount/next_renewal + flip active back to 1 (unless
 * cancellation intent — then active := 0).
 */
export async function upsertFromClassified(
  d1: D1Like,
  input: UpsertInput,
): Promise<SubscriptionRow> {
  const existing = await findByService(d1, input.userId, input.classified.service);
  const now = nowIso();
  const activeFlag: 0 | 1 = input.classified.intent === "cancellation" ? 0 : 1;

  if (existing) {
    const updated: SubscriptionRow = {
      ...existing,
      amount: input.classified.amount ?? existing.amount,
      cadence: input.classified.cadence ?? existing.cadence,
      next_renewal_at: input.classified.nextRenewalAt ?? existing.next_renewal_at,
      detected_intent: input.classified.intent,
      last_seen: now,
      active: activeFlag,
      source: input.source,
      source_ref: input.classified.sourceMessageId ?? existing.source_ref,
      raw_payload_json: input.rawPayload ? JSON.stringify(input.rawPayload) : existing.raw_payload_json,
    };
    await tryRun(
      "subs.update",
      d1
        .prepare(
          `UPDATE subscriptions
           SET amount = ?, cadence = ?, next_renewal_at = ?, detected_intent = ?,
               last_seen = ?, active = ?, source = ?, source_ref = ?, raw_payload_json = ?
           WHERE id = ?`,
        )
        .bind(
          updated.amount,
          updated.cadence,
          updated.next_renewal_at,
          updated.detected_intent,
          updated.last_seen,
          updated.active,
          updated.source,
          updated.source_ref,
          updated.raw_payload_json,
          updated.id,
        ),
    );
    return updated;
  }

  const fresh = rowOf({
    user_id: input.userId,
    service: input.classified.service,
    amount: input.classified.amount ?? null,
    currency: input.classified.currency,
    cadence: (input.classified.cadence as Cadence | undefined) ?? null,
    next_renewal_at: input.classified.nextRenewalAt ?? null,
    source: input.source,
    source_ref: input.classified.sourceMessageId ?? null,
    active: activeFlag,
    detected_intent: input.classified.intent as Intent,
    first_seen: now,
    last_seen: now,
    raw_payload_json: input.rawPayload ? JSON.stringify(input.rawPayload) : null,
  });
  await tryRun(
    "subs.insert",
    d1
      .prepare(
        `INSERT INTO subscriptions (
          id, user_id, service, amount, currency, cadence, next_renewal_at,
          source, source_ref, active, detected_intent, first_seen, last_seen,
          raw_payload_json
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        fresh.id,
        fresh.user_id,
        fresh.service,
        fresh.amount,
        fresh.currency,
        fresh.cadence,
        fresh.next_renewal_at,
        fresh.source,
        fresh.source_ref,
        fresh.active,
        fresh.detected_intent,
        fresh.first_seen,
        fresh.last_seen,
        fresh.raw_payload_json,
      ),
  );
  return fresh;
}

export async function findByService(d1: D1Like, userId: string, service: string): Promise<SubscriptionRow | null> {
  const r = await d1
    .prepare(`SELECT * FROM subscriptions WHERE user_id = ? AND service = ? LIMIT 1`)
    .bind(userId, service)
    .first<SubscriptionRow>();
  return r ?? null;
}

export async function listByUser(
  d1: D1Like,
  userId: string,
  opts: { activeOnly?: boolean; limit?: number } = {},
): Promise<SubscriptionRow[]> {
  const limit = Math.min(Math.max(1, opts.limit ?? 200), 500);
  const sql = opts.activeOnly
    ? `SELECT * FROM subscriptions WHERE user_id = ? AND active = 1 ORDER BY next_renewal_at ASC NULLS LAST LIMIT ?`
    : `SELECT * FROM subscriptions WHERE user_id = ? ORDER BY last_seen DESC LIMIT ?`;
  const res = await d1.prepare(sql).bind(userId, limit).all<SubscriptionRow>();
  return res.results ?? [];
}

export async function getById(d1: D1Like, id: string): Promise<SubscriptionRow | null> {
  const r = await d1.prepare(`SELECT * FROM subscriptions WHERE id = ? LIMIT 1`).bind(id).first<SubscriptionRow>();
  return r ?? null;
}

export async function setActive(d1: D1Like, id: string, active: boolean): Promise<void> {
  await tryRun(
    "subs.set_active",
    d1.prepare(`UPDATE subscriptions SET active = ? WHERE id = ?`).bind(active ? 1 : 0, id),
  );
}

export async function deleteById(d1: D1Like, id: string): Promise<void> {
  await tryRun(
    "subs.delete",
    d1.prepare(`DELETE FROM subscriptions WHERE id = ?`).bind(id),
  );
}

/**
 * Upcoming renewals in the next N days — powers the "3 subs renewing this
 * week" dashboard card + weekly digest email.
 */
export async function listUpcomingRenewals(
  d1: D1Like,
  userId: string,
  days = 7,
): Promise<SubscriptionRow[]> {
  const cutoff = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const res = await d1
    .prepare(
      `SELECT * FROM subscriptions
       WHERE user_id = ? AND active = 1 AND next_renewal_at IS NOT NULL AND next_renewal_at <= ?
       ORDER BY next_renewal_at ASC`,
    )
    .bind(userId, cutoff)
    .all<SubscriptionRow>();
  return res.results ?? [];
}
