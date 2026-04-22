// S7-W38 — match firmware advisories to connected-device purchases.
// Mirror of feeds/matcher.ts (S6-W33) with an added category allowlist gate
// so toasters never trigger a firmware alert. Scoring:
//   Brand/vendor token overlap  ≥ 0.5        → +0.40
//   Any affectedModel token overlap  ≥ 0.5   → +0.40
//   Advisory published AFTER purchase AND within 5y → +0.20
//   THRESHOLD score ≥ 0.70  emits a match
// Gate (all-or-nothing): purchase.category ∈ allowlist, or product_name
// contains a connected-device token.

import { CONNECTED_DEVICE_CATEGORIES, CONNECTED_DEVICE_NAME_TOKENS } from "./fixtures.js";
import type { FirmwareAdvisory, FirmwareMatch, PurchaseLike } from "./types.js";

const THRESHOLD = 0.7;
const FIVE_YEARS_MS = 5 * 365 * 24 * 60 * 60 * 1000;

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !STOPWORDS.has(t)),
  );
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "for", "of", "to", "in", "on", "at",
  "by", "from", "with", "as", "is", "are", "was", "were", "be", "been",
]);

function tokenOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersect = 0;
  for (const x of a) if (b.has(x)) intersect += 1;
  const union = a.size + b.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

/**
 * Containment score: "what fraction of A's tokens appear in B". Used for
 * vendor/model lookup because advisory terms are short and product names
 * are long — Jaccard would flunk even a perfect substring match.
 */
function tokenContainment(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersect = 0;
  for (const x of a) if (b.has(x)) intersect += 1;
  return intersect / a.size;
}

/**
 * Gate: does this purchase look like a connected device worth firmware-watching?
 */
export function isConnectedDevice(p: PurchaseLike): boolean {
  if (p.category && CONNECTED_DEVICE_CATEGORIES.has(p.category)) return true;
  const name = p.product_name.toLowerCase();
  for (const tok of CONNECTED_DEVICE_NAME_TOKENS) {
    if (name.includes(tok)) return true;
  }
  return false;
}

export function matchFirmware(
  advisories: FirmwareAdvisory[],
  purchases: PurchaseLike[],
): FirmwareMatch[] {
  const out: FirmwareMatch[] = [];
  for (const a of advisories) {
    const vendorTokens = tokenize(a.vendor);
    for (const p of purchases) {
      if (!isConnectedDevice(p)) continue;

      const reasons: string[] = [];
      let score = 0;

      const brandTokens = tokenize(p.brand ?? "");
      const productNameTokens = tokenize(p.product_name);
      // Vendor can appear in brand OR embedded in product_name ("ASUS RT-AX88U …")
      const productTokens = new Set([...brandTokens, ...productNameTokens]);
      const vendorMatch = tokenContainment(vendorTokens, productTokens);
      if (vendorMatch >= 0.5) {
        score += 0.4;
        reasons.push(`vendor match (${Math.round(vendorMatch * 100)}%)`);
      }

      let modelMatch = 0;
      for (const mdl of a.affectedModels) {
        const o = tokenContainment(tokenize(mdl), productNameTokens);
        if (o > modelMatch) modelMatch = o;
      }
      if (modelMatch >= 0.5) {
        score += 0.4;
        reasons.push(`affected-model overlap (${Math.round(modelMatch * 100)}%)`);
      }

      const purchaseTime = Date.parse(p.purchased_at);
      const advisoryTime = Date.parse(a.publishedAt);
      if (!isNaN(purchaseTime) && !isNaN(advisoryTime)) {
        const delta = advisoryTime - purchaseTime;
        if (delta >= 0 && delta <= FIVE_YEARS_MS) {
          score += 0.2;
          reasons.push("advisory published within 5y after purchase");
        }
      }

      if (score >= THRESHOLD) {
        out.push({ advisory: a, purchase: p, score: Number(score.toFixed(3)), reasons });
      }
    }
  }
  return out;
}

export const FIRMWARE_MATCHER_THRESHOLD = THRESHOLD;
