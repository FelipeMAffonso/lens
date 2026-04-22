// S6-W34 — read-only helpers over purchases + interventions.
// Writes happen through the existing F2 createIntervention repo.

import type { D1Like } from "../db/client.js";
import type { PurchaseLike } from "./types.js";

/**
 * Load active purchases for a user, with price, retailer, and order_id. We
 * only consider purchases made in the last 60 days — beyond that every major
 * retailer's window has expired.
 */
export async function listRecentPurchases(
  d1: D1Like,
  userId: string,
  lookbackDays = 60,
): Promise<PurchaseLike[]> {
  const cutoff = new Date(Date.now() - lookbackDays * 86_400_000).toISOString().slice(0, 10);
  const res = await d1
    .prepare(
      `SELECT id, user_id, retailer, product_name, price, currency, purchased_at, order_id
       FROM purchases
       WHERE user_id = ? AND purchased_at >= ?
       ORDER BY purchased_at DESC
       LIMIT 200`,
    )
    .bind(userId, cutoff)
    .all<{
      id: string;
      user_id: string;
      retailer: string | null;
      product_name: string;
      price: number | null;
      currency: string | null;
      purchased_at: string;
      order_id: string | null;
    }>();
  return (res.results ?? []).map((r) => ({
    id: r.id,
    userId: r.user_id,
    retailer: r.retailer,
    productName: r.product_name,
    price: r.price,
    currency: r.currency,
    purchasedAt: r.purchased_at,
    orderId: r.order_id,
  }));
}

/**
 * Return the set of purchase IDs that already have an open price-match
 * intervention — used to skip drafting duplicates on subsequent cron runs.
 */
export async function listPurchasesWithPendingPriceMatch(
  d1: D1Like,
  userId: string,
): Promise<Set<string>> {
  // Keep the WHERE flat so the hermetic memory-d1 test shim can parse it.
  // The open-status filter happens in JS post-query.
  const res = await d1
    .prepare(
      `SELECT related_purchase_id, status
       FROM interventions
       WHERE user_id = ?
         AND pack_slug = 'intervention/file-price-match-claim'
         AND related_purchase_id IS NOT NULL`,
    )
    .bind(userId)
    .all<{ related_purchase_id: string; status: string }>();
  const OPEN_STATUSES = new Set(["drafted", "sent", "acknowledged"]);
  return new Set(
    (res.results ?? [])
      .filter((r) => OPEN_STATUSES.has(r.status))
      .map((r) => r.related_purchase_id)
      .filter(Boolean),
  );
}
