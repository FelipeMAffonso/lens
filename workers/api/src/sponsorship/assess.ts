// S3-W19 — verdict + rationale composer.

import type { AffiliateIndicator } from "../provenance/types.js";
import type { DisclosureMatch, SponsorshipVerdict } from "./types.js";

export interface AssessInput {
  affiliateIndicators: AffiliateIndicator[];
  disclosures: DisclosureMatch[];
}

export interface AssessOutput {
  verdict: SponsorshipVerdict;
  rationale: string;
}

export function assessSponsorship(input: AssessInput): AssessOutput {
  const hasAff = input.affiliateIndicators.length > 0;
  const hasDisclosure = input.disclosures.length > 0;

  if (!hasAff && !hasDisclosure) {
    return {
      verdict: "clear",
      rationale: "No affiliate markers detected and no disclosure statement found — page appears to be a non-sponsored review.",
    };
  }
  if (hasAff && hasDisclosure) {
    const topAff = input.affiliateIndicators[0]!;
    const topDisc = input.disclosures[0]!;
    return {
      verdict: "disclosed-partnership",
      rationale: `Author has a financial relationship (${topAff.kind}) AND discloses it ("${topDisc.detail}") — FTC-compliant sponsored content.`,
    };
  }
  if (hasAff && !hasDisclosure) {
    const top = input.affiliateIndicators[0]!;
    return {
      verdict: "undisclosed-partnership",
      rationale: `Affiliate signal detected (${top.kind}: ${top.detail}) but NO disclosure statement found on the page. This may violate FTC 16 CFR Part 255 guidance.`,
    };
  }
  // Only disclosure, no affiliate URL → still treat as disclosed
  const topDisc = input.disclosures[0]!;
  return {
    verdict: "disclosed-partnership",
    rationale: `Author discloses a financial relationship ("${topDisc.detail}") — transparent even though no affiliate URL was captured on this page.`,
  };
}
