// F2 — welfare_deltas repo.
// Populated immediately after an audit row is written. Powers the dashboard's
// welfare-delta card + the public ticker (which aggregates this table into
// k-anonymized buckets).

import { WelfareDeltaRowSchema, type WelfareDeltaRow } from "../schemas.js";
import { type D1Like, nowIso, tryRun } from "../client.js";

export interface RecordDeltaInput {
  auditId: string;
  userId: string | null;
  anonUserId: string | null;
  category: string;
  lensPick: { name: string; brand?: string | null; price?: number | null; utility: number };
  aiPick?: { name?: string | null; brand?: string | null; price?: number | null; utility?: number | null };
}

export async function recordWelfareDelta(
  d1: D1Like,
  input: RecordDeltaInput,
): Promise<WelfareDeltaRow> {
  const lensPrice = input.lensPick.price ?? null;
  const aiPrice = input.aiPick?.price ?? null;
  const aiUtility = input.aiPick?.utility ?? null;
  const utilityDelta = aiUtility !== null ? input.lensPick.utility - aiUtility : null;
  const priceDelta = lensPrice !== null && aiPrice !== null ? aiPrice - lensPrice : null;
  const row: WelfareDeltaRow = {
    audit_id: input.auditId,
    user_id: input.userId,
    anon_user_id: input.anonUserId,
    category: input.category,
    lens_pick_name: input.lensPick.name,
    lens_pick_brand: input.lensPick.brand ?? null,
    lens_pick_price: lensPrice,
    lens_utility: input.lensPick.utility,
    ai_pick_name: input.aiPick?.name ?? null,
    ai_pick_brand: input.aiPick?.brand ?? null,
    ai_pick_price: aiPrice,
    ai_utility: aiUtility,
    utility_delta: utilityDelta,
    price_delta: priceDelta,
    created_at: nowIso(),
  };
  WelfareDeltaRowSchema.parse(row);
  await tryRun(
    "welfare.record",
    d1
      .prepare(
        `INSERT OR REPLACE INTO welfare_deltas (
          audit_id, user_id, anon_user_id, category,
          lens_pick_name, lens_pick_brand, lens_pick_price, lens_utility,
          ai_pick_name, ai_pick_brand, ai_pick_price, ai_utility,
          utility_delta, price_delta, created_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        row.audit_id,
        row.user_id,
        row.anon_user_id,
        row.category,
        row.lens_pick_name,
        row.lens_pick_brand,
        row.lens_pick_price,
        row.lens_utility,
        row.ai_pick_name,
        row.ai_pick_brand,
        row.ai_pick_price,
        row.ai_utility,
        row.utility_delta,
        row.price_delta,
        row.created_at,
      ),
  );
  return row;
}

export interface WelfareSummary {
  totalAudits: number;
  auditsWithAiComparison: number;
  avgUtilityDelta: number | null;
  totalPriceDelta: number | null;
  byCategory: Record<
    string,
    { count: number; avgUtilityDelta: number | null; totalPriceDelta: number | null }
  >;
}

/**
 * Aggregate welfare across all recorded audits for a user.
 * "Lens would have saved you $312 / +0.15 utility over the AIs' picks."
 */
export async function welfareSummary(
  d1: D1Like,
  opts: { userId?: string; anonUserId?: string },
): Promise<WelfareSummary> {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (opts.userId) {
    where.push("user_id = ?");
    binds.push(opts.userId);
  }
  if (opts.anonUserId) {
    where.push("anon_user_id = ?");
    binds.push(opts.anonUserId);
  }
  if (where.length === 0) {
    return { totalAudits: 0, auditsWithAiComparison: 0, avgUtilityDelta: null, totalPriceDelta: null, byCategory: {} };
  }
  const whereClause = where.join(" OR ");
  const rows = (
    await d1
      .prepare(`SELECT * FROM welfare_deltas WHERE ${whereClause} ORDER BY created_at DESC`)
      .bind(...binds)
      .all<unknown>()
  ).results ?? [];

  let totalAudits = 0;
  let auditsWithAi = 0;
  let utilitySum = 0;
  let utilityCount = 0;
  let priceSum = 0;
  let priceCount = 0;
  const byCategory: Record<string, { count: number; utilitySum: number; utilityCount: number; priceSum: number; priceCount: number }> = {};
  for (const raw of rows) {
    const row = WelfareDeltaRowSchema.parse(raw);
    totalAudits += 1;
    const cat = row.category;
    byCategory[cat] = byCategory[cat] ?? { count: 0, utilitySum: 0, utilityCount: 0, priceSum: 0, priceCount: 0 };
    byCategory[cat]!.count += 1;
    if (row.utility_delta !== null) {
      utilitySum += row.utility_delta;
      utilityCount += 1;
      byCategory[cat]!.utilitySum += row.utility_delta;
      byCategory[cat]!.utilityCount += 1;
    }
    if (row.price_delta !== null) {
      priceSum += row.price_delta;
      priceCount += 1;
      byCategory[cat]!.priceSum += row.price_delta;
      byCategory[cat]!.priceCount += 1;
    }
    if (row.ai_utility !== null || row.ai_pick_price !== null) auditsWithAi += 1;
  }
  const round = (n: number): number => Math.round(n * 100) / 100;
  return {
    totalAudits,
    auditsWithAiComparison: auditsWithAi,
    avgUtilityDelta: utilityCount > 0 ? round(utilitySum / utilityCount) : null,
    totalPriceDelta: priceCount > 0 ? round(priceSum) : null,
    byCategory: Object.fromEntries(
      Object.entries(byCategory).map(([k, v]) => [
        k,
        {
          count: v.count,
          avgUtilityDelta: v.utilityCount > 0 ? round(v.utilitySum / v.utilityCount) : null,
          totalPriceDelta: v.priceCount > 0 ? round(v.priceSum) : null,
        },
      ]),
    ),
  };
}

export async function listWelfareDeltas(
  d1: D1Like,
  opts: { userId?: string; anonUserId?: string; limit?: number },
): Promise<WelfareDeltaRow[]> {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (opts.userId) {
    where.push("user_id = ?");
    binds.push(opts.userId);
  }
  if (opts.anonUserId) {
    where.push("anon_user_id = ?");
    binds.push(opts.anonUserId);
  }
  if (where.length === 0) return [];
  const limit = Math.min(Math.max(1, opts.limit ?? 50), 500);
  const r = await d1
    .prepare(`SELECT * FROM welfare_deltas WHERE ${where.join(" OR ")} ORDER BY created_at DESC LIMIT ?`)
    .bind(...binds, limit)
    .all<unknown>();
  return (r.results ?? []).map((x) => WelfareDeltaRowSchema.parse(x));
}
