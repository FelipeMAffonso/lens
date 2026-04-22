// S6-W37 — Layer-4 revealed-preference updater.
// Pure math: given current weights + a post-purchase rating, compute new
// weights. Deterministic, renormalized, floored at 0, bounded drift per
// single rating. No randomness, no LLM.

import type { CriterionFeedback, PreferenceUpdate } from "./types.js";

export interface UpdateInput {
  weights: Record<string, number>;          // current category weights, Σ ≈ 1
  overallRating: number;                    // 1..5
  wouldBuyAgain: boolean;
  criterionFeedback?: CriterionFeedback[];
  category?: string;
}

const FEEDBACK_DELTA = 0.08;       // per "more-important" / "less-important"
const OVERALL_BUMP = 0.04;         // signed bump to the top criterion when overall reinforces/dampens

function sign(overallRating: number, wouldBuyAgain: boolean): 1 | -1 | 0 {
  if (overallRating >= 4 && wouldBuyAgain) return 1;
  if (overallRating <= 2 || !wouldBuyAgain) return -1;
  return 0;
}

function round4(n: number): number {
  const r = Math.round(n * 10_000) / 10_000;
  return r === 0 ? 0 : r;
}

function topKey(weights: Record<string, number>): string | null {
  const keys = Object.keys(weights);
  if (keys.length === 0) return null;
  return keys.reduce((acc, k) => (weights[k]! > weights[acc]! ? k : acc));
}

function describeSignals(
  sign: number,
  feedback: CriterionFeedback[] | undefined,
): string {
  const pieces: string[] = [];
  if (sign > 0) pieces.push("overall≥4 + wouldBuyAgain=true → reinforce top weight");
  else if (sign < 0) pieces.push("overall≤2 or wouldBuyAgain=false → dampen top weight");
  else pieces.push("neutral overall signal — per-criterion feedback only");
  if (feedback && feedback.length > 0) {
    const fbStr = feedback
      .map((f) => `${f.criterion}:${f.signal}`)
      .join(", ");
    pieces.push(fbStr);
  }
  return pieces.join("; ");
}

/**
 * Apply a Layer-4 update to the category preference weights. Returns the
 * preference-update record (before, after, deltas, applied, reason).
 */
export function applyPerformanceUpdate(input: UpdateInput): PreferenceUpdate {
  const keys = Object.keys(input.weights);
  if (keys.length === 0) {
    return {
      applied: false,
      reason: "no prior preference row — stored rating only",
    };
  }
  const before: Record<string, number> = {};
  for (const k of keys) before[k] = round4(input.weights[k]!);

  // Build Δ map.
  const deltaMap: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));

  // Per-criterion feedback first (additive).
  for (const f of input.criterionFeedback ?? []) {
    if (!(f.criterion in deltaMap)) continue; // silently ignore unknown criteria
    if (f.signal === "more-important") deltaMap[f.criterion]! += FEEDBACK_DELTA;
    else if (f.signal === "less-important") deltaMap[f.criterion]! -= FEEDBACK_DELTA;
    // "about-right" adds 0
  }

  // Global overall bump on the top criterion.
  const s = sign(input.overallRating, input.wouldBuyAgain);
  const top = topKey(input.weights);
  if (s !== 0 && top !== null) {
    deltaMap[top]! += s * OVERALL_BUMP;
  }

  // Apply deltas, floor at 0.
  const flooredRaw: Record<string, number> = {};
  let sum = 0;
  for (const k of keys) {
    const v = Math.max(0, input.weights[k]! + deltaMap[k]!);
    flooredRaw[k] = v;
    sum += v;
  }

  if (sum <= 0) {
    return {
      applied: false,
      ...(input.category !== undefined ? { category: input.category } : {}),
      before,
      reason: "update would zero out every criterion — aborted",
    };
  }

  // Renormalize to sum=1, round to 4dp.
  const after: Record<string, number> = {};
  const deltas: Record<string, number> = {};
  for (const k of keys) {
    const normalized = flooredRaw[k]! / sum;
    const rounded = round4(normalized);
    after[k] = rounded;
    deltas[k] = round4(rounded - before[k]!);
  }

  // Renormalization drift: fix rounding so sum stays exactly 1 by nudging
  // the top weight (same trick as S2-W13 source-weighting normalizer).
  const afterSum = Object.values(after).reduce((a, b) => a + b, 0);
  const roundedSumDiff = round4(1 - afterSum);
  if (roundedSumDiff !== 0 && top !== null) {
    after[top] = round4(after[top]! + roundedSumDiff);
    deltas[top] = round4(after[top]! - before[top]!);
  }

  return {
    applied: true,
    ...(input.category !== undefined ? { category: input.category } : {}),
    before,
    after,
    deltas,
    reason: describeSignals(s, input.criterionFeedback),
  };
}
