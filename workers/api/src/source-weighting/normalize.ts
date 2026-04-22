// S2-W13 — normalize incoming weighting to sum=1, clamped to [0, 1].
// Returns the normalized weighting and a flag indicating whether any snap
// occurred (so the UI can show a brief "snapped to 70/30" toast).

import type { SourceWeighting } from "./types.js";

export interface NormalizeResult {
  weighting: SourceWeighting;
  normalized: boolean;
}

const TOLERANCE = 0.001;

export function normalizeWeighting(input: SourceWeighting): NormalizeResult {
  // Floor negatives, but do NOT clamp large values — we want to preserve
  // the relative ratio when a user dials an out-of-range slider (e.g. 50/30
  // rescales to 62.5/37.5, not snaps to 10/3 first).
  const v = Math.max(0, input.vendor);
  const i = Math.max(0, input.independent);
  const sum = v + i;
  if (sum <= 0) {
    // Both zero → default 50/50.
    return { weighting: { vendor: 0.5, independent: 0.5 }, normalized: true };
  }
  const vendor = v / sum;
  const independent = i / sum;
  const rounded = {
    vendor: round4(vendor),
    independent: round4(1 - round4(vendor)), // ensures sum stays 1 after rounding
  };
  const wasAlreadyNormalized =
    Math.abs(input.vendor + input.independent - 1) < TOLERANCE &&
    input.vendor === rounded.vendor &&
    input.independent === rounded.independent;
  return { weighting: rounded, normalized: !wasAlreadyNormalized };
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
