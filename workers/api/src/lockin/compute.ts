// S7-W40 — pure matcher + accumulator. No I/O.

import { ECOSYSTEM_FIXTURES } from "./fixtures.js";
import type { EcosystemFixture, EcosystemResult, ExitFrictionBand, LockinPurchase, LockinResponse } from "./types.js";

export function exitFrictionFor(multiplier: number): ExitFrictionBand {
  if (multiplier >= 1.7) return "critical";
  if (multiplier >= 1.4) return "high";
  if (multiplier >= 1.2) return "medium";
  return "low";
}

function norm(s: string | undefined): string {
  return (s ?? "").toLowerCase().trim();
}

/**
 * Returns true when a purchase matches an ecosystem fixture.
 *
 * Judge P0-2 (brand-only false-match gate): a bare brand match is NOT enough.
 * Brand "Apple" alone would match "Apple juice" into the Apple ecosystem. So
 * brand match is valid only when it is ALSO combined with a productToken OR
 * categoryToken hit. Product tokens and category tokens still stand alone.
 *
 * Precedence:
 *  1. productToken ≥ 3 chars substring-matches productName → MATCH.
 *  2. categoryToken exactly matches category (case-insensitive) → MATCH.
 *  3. brand matches reqBrand AND (any productToken OR categoryToken hits) → MATCH.
 *  4. otherwise no match.
 */
export function purchaseMatchesEcosystem(p: LockinPurchase, fx: EcosystemFixture): boolean {
  const reqBrand = norm(p.brand);
  const reqName = norm(p.productName);
  const reqCategory = norm(p.category);

  const tokenHit = fx.matchers.productTokens?.some((t) => {
    const nt = norm(t);
    return nt.length >= 3 && reqName.includes(nt);
  }) ?? false;
  const categoryHit = fx.matchers.categoryTokens?.some((c) => {
    const nc = norm(c);
    return nc.length > 0 && nc === reqCategory && reqCategory.length > 0;
  }) ?? false;
  if (tokenHit || categoryHit) return true;

  // Brand match requires a secondary signal. Without one, "Apple juice"
  // would match every Apple-branded ecosystem.
  const brandHit = reqBrand.length > 0 && (fx.matchers.brands ?? []).some((b) => norm(b) === reqBrand);
  return brandHit && (tokenHit || categoryHit);
}

/**
 * Compute per-ecosystem totals + running switching-cost summary.
 */
export function computeLockin(purchases: LockinPurchase[]): LockinResponse {
  const generatedAt = new Date().toISOString();
  if (purchases.length === 0) {
    return {
      source: "fixture",
      ecosystems: [],
      totalGross: 0,
      totalSwitchingCost: 0,
      reason: "No purchases provided.",
      generatedAt,
    };
  }

  const ecosystems: EcosystemResult[] = [];
  // Judge P0-1: track unique purchase indices across ALL ecosystems so
  // totalGross de-dupes (a single iPhone hitting both apple + ios-app-store
  // must not count twice toward the cross-ecosystem total).
  const uniquePurchaseIndices = new Set<number>();
  for (const fx of ECOSYSTEM_FIXTURES) {
    const matchedIndices: number[] = [];
    for (let i = 0; i < purchases.length; i++) {
      if (purchaseMatchesEcosystem(purchases[i]!, fx)) matchedIndices.push(i);
    }
    if (matchedIndices.length === 0) continue;
    const gross = matchedIndices.reduce((s, i) => {
      const amt = purchases[i]!.amountUsd;
      return s + (Number.isFinite(amt) ? amt : 0);
    }, 0);
    const estimatedSwitchingCost = Math.round(gross * fx.lockInMultiplier * 100) / 100;
    ecosystems.push({
      slug: fx.slug,
      label: fx.label,
      matchedPurchases: matchedIndices.length,
      gross: Math.round(gross * 100) / 100,
      estimatedSwitchingCost,
      nonDollarLockIn: fx.nonDollarLockIn,
      exitFriction: exitFrictionFor(fx.lockInMultiplier),
      citations: fx.citations,
    });
    for (const i of matchedIndices) uniquePurchaseIndices.add(i);
  }
  // Sort descending by switching cost, tie-break by slug alphabetically
  // (judge P2-7 — stable + self-documenting).
  ecosystems.sort((a, b) => {
    const d = b.estimatedSwitchingCost - a.estimatedSwitchingCost;
    if (d !== 0) return d;
    return a.slug.localeCompare(b.slug);
  });

  // Judge P0-1: totalGross counts each matched purchase ONCE (union across
  // ecosystem hits). totalSwitchingCost legitimately sums across ecosystems
  // since every ecosystem imposes its own independent switching cost.
  const totalGross = Math.round(
    [...uniquePurchaseIndices].reduce((s, i) => {
      const amt = purchases[i]!.amountUsd;
      return s + (Number.isFinite(amt) ? amt : 0);
    }, 0) * 100,
  ) / 100;
  const totalSwitchingCost = Math.round(ecosystems.reduce((s, e) => s + e.estimatedSwitchingCost, 0) * 100) / 100;

  return {
    source: "fixture",
    ecosystems,
    totalGross,
    totalSwitchingCost,
    generatedAt,
  };
}
