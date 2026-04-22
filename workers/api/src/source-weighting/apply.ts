// S2-W13 — pure reranker. Takes a candidate's base utility + vendor and/or
// independent signals + the user's weighting → final utility + per-side
// contributions.
//
// When one side's signal is missing, its weight redistributes to the side
// that IS present, so the user always gets the full boost range when at
// least one signal exists.

import type { SourceWeighting } from "./types.js";

export interface ApplyInput {
  baseUtility: number;          // 0..1
  vendorSignal: number | null;  // 0..1 or null
  independentSignal: number | null; // 0..1 or null
  weighting: SourceWeighting;
}

export interface ApplyResult {
  finalUtility: number;
  contributions: {
    vendor: number;       // signed contribution to final
    independent: number;
  };
}

const BOOST_RANGE = 0.3;

export function applyWeighting(input: ApplyInput): ApplyResult {
  const { baseUtility, vendorSignal, independentSignal, weighting } = input;

  // Redistribute weight to the present side when one is missing.
  let vW = weighting.vendor;
  let iW = weighting.independent;
  if (vendorSignal === null && independentSignal === null) {
    vW = 0;
    iW = 0;
  } else if (vendorSignal === null) {
    iW = iW + vW;
    vW = 0;
  } else if (independentSignal === null) {
    vW = vW + iW;
    iW = 0;
  }

  const vendorContribution =
    vendorSignal === null ? 0 : vW * (vendorSignal - 0.5) * BOOST_RANGE;
  const independentContribution =
    independentSignal === null ? 0 : iW * (independentSignal - 0.5) * BOOST_RANGE;
  const finalUtility = clamp01(baseUtility + vendorContribution + independentContribution);

  return {
    finalUtility: round4(finalUtility),
    contributions: {
      vendor: round4(vendorContribution),
      independent: round4(independentContribution),
    },
  };
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function round4(n: number): number {
  const r = Math.round(n * 10_000) / 10_000;
  // Normalize -0 → 0 so strict/Object.is comparisons don't trip.
  return r === 0 ? 0 : r;
}
