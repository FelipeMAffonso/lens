// S6-W33 — match normalized recall items to user purchase rows.
// Score is composite:
//   - Brand exact match (case-insensitive, token-level): 0.40
//   - Product-name Jaccard token overlap >= 0.5: 0.40
//   - Purchase predates recall publication + within 2y: 0.20
// Threshold: score >= 0.7 emits a match.

import type { MatchResult, NormalizedRecall, PurchaseRow } from "./types.js";

const THRESHOLD = 0.7;

export function matchRecalls(
  recalls: NormalizedRecall[],
  purchases: PurchaseRow[],
): MatchResult[] {
  const out: MatchResult[] = [];
  for (const r of recalls) {
    const brandTokens = tokenize(r.brand);
    for (const p of purchases) {
      const reasons: string[] = [];
      let score = 0;

      const purchaseBrandTokens = tokenize(p.brand ?? "");
      const brandOverlap = tokenOverlap(brandTokens, purchaseBrandTokens);
      if (brandOverlap >= 0.5) {
        score += 0.4;
        reasons.push(`brand match (${Math.round(brandOverlap * 100)}%)`);
      }

      let productOverlap = 0;
      for (const recallName of r.productNames) {
        const o = tokenOverlap(tokenize(recallName), tokenize(p.product_name));
        if (o > productOverlap) productOverlap = o;
      }
      if (productOverlap >= 0.5) {
        score += 0.4;
        reasons.push(`product name overlap (${Math.round(productOverlap * 100)}%)`);
      }

      const purchaseTime = Date.parse(p.purchased_at);
      const recallTime = Date.parse(r.publishedAt);
      if (!isNaN(purchaseTime) && !isNaN(recallTime)) {
        const twoYearsMs = 730 * 24 * 60 * 60 * 1000;
        const delta = recallTime - purchaseTime;
        if (delta >= 0 && delta <= twoYearsMs) {
          score += 0.2;
          reasons.push("purchase precedes recall within 2y");
        }
      }

      if (score >= THRESHOLD) {
        out.push({ recall: r, purchase: p, score: Number(score.toFixed(3)), reasons });
      }
    }
  }
  return out;
}

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !STOPWORDS.has(t)),
  );
}

function tokenOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersect = 0;
  for (const x of a) if (b.has(x)) intersect += 1;
  const union = a.size + b.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "for", "of", "to", "in", "on", "at",
  "by", "from", "with", "as", "is", "are", "was", "were", "be", "been",
]);

export const MATCHER_THRESHOLD = THRESHOLD;
