// S7-W41 — pure matcher + band mapper. No I/O.

import { REPAIRABILITY_FIXTURES } from "./fixtures.js";
import type { RepairabilityBand, RepairabilityFixture, RepairabilityRequest, RepairabilityResponse } from "./types.js";

export function bandFor(score: number): Exclude<RepairabilityBand, "no-info"> {
  if (score >= 8) return "easy";
  if (score >= 6) return "medium";
  if (score >= 4) return "hard";
  return "unrepairable";
}

function norm(s: string): string {
  return s.toLowerCase().trim();
}

/**
 * Find the best matching fixture for a request. Returns null when no fixture
 * matches. Matcher precedence:
 *   1. productId exact match wins.
 *   2. Otherwise brand must match (case-insensitive, in the fixture's brands list)
 *      AND at least one productToken (length >= 3) must appear as substring in the
 *      request's productName.
 *   3. Tie-breaker: longest-matching token wins.
 */
export function matchFixture(req: RepairabilityRequest): RepairabilityFixture | null {
  const reqProductName = norm(req.productName);
  const reqBrand = req.brand ? norm(req.brand) : "";
  const reqProductId = req.productId ? norm(req.productId) : "";

  // Pass 1: productId exact match.
  if (reqProductId.length > 0) {
    for (const fx of REPAIRABILITY_FIXTURES) {
      if (fx.matchers.productId && norm(fx.matchers.productId) === reqProductId) {
        return fx;
      }
    }
  }

  // Pass 2: brand + productToken match with tie-breaking.
  //
  // Judge P0-1: when the request carries an explicit `brand`, require EXACT
  // match. Previously we accepted either brand==reqBrand OR productName
  // contains brand — so "Sony WH-1000XM5 earpads for my Bose QuietComfort 45"
  // matched both Sony and Bose fixtures, with Bose winning on token length
  // even though the user's `brand` was clearly Sony. Brand-less requests
  // (e.g. extracted URL mode) still get the name-contains fallback.
  let best: { fx: RepairabilityFixture; tokenLen: number } | null = null;
  for (const fx of REPAIRABILITY_FIXTURES) {
    const brandsMatch =
      !fx.matchers.brands ||
      fx.matchers.brands.length === 0 ||
      fx.matchers.brands.some((b) => {
        const nb = norm(b);
        if (reqBrand) {
          // Strict: request brand must exactly equal one of the fixture's brands.
          return nb === reqBrand;
        }
        // No brand on request → fall back to name-contains inference.
        return reqProductName.includes(nb);
      });
    if (!brandsMatch) continue;

    const tokens = fx.matchers.productTokens ?? [];
    if (tokens.length === 0) continue;

    let maxTokenLen = 0;
    for (const token of tokens) {
      const nt = norm(token);
      if (nt.length < 3) continue;
      if (reqProductName.includes(nt)) {
        if (nt.length > maxTokenLen) maxTokenLen = nt.length;
      }
    }
    if (maxTokenLen === 0) continue;

    if (!best || maxTokenLen > best.tokenLen) {
      best = { fx, tokenLen: maxTokenLen };
    }
  }

  return best ? best.fx : null;
}

export function toResponse(
  req: RepairabilityRequest,
  fx: RepairabilityFixture | null,
  generatedAt: string,
): RepairabilityResponse {
  if (!fx) {
    // Judge P1-4: never a placeholder. Even when we have no data, surface a
    // real next-action citation (iFixit's own search URL) so the user can
    // check the source manually.
    const fallbackSearchUrl = `https://www.ifixit.com/Search?query=${encodeURIComponent(req.productName)}`;
    return {
      source: "none",
      productName: req.productName,
      ...(req.brand ? { brand: req.brand } : {}),
      ...(req.category ? { category: req.category } : {}),
      band: "no-info",
      commonFailures: [],
      partsAvailability: { manufacturer: "unknown", thirdParty: "unknown" },
      citations: [
        {
          label: `Search iFixit for "${req.productName}"`,
          url: fallbackSearchUrl,
          source: "ifixit",
        },
      ],
      reason:
        "No repairability fixture matches this product. iFixit live lookup is optional — set IFIXIT_API_KEY to enable.",
      generatedAt,
    };
  }
  return {
    source: "fixture",
    productName: req.productName,
    ...(req.brand ? { brand: req.brand } : {}),
    ...(req.category ? { category: req.category } : {}),
    score: fx.score,
    band: bandFor(fx.score),
    commonFailures: fx.commonFailures,
    partsAvailability: fx.partsAvailability,
    citations: fx.citations,
    generatedAt,
  };
}
