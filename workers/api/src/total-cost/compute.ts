// S4-W24 — pure compute layer.

import type { HiddenCost } from "@lens/shared";
import type { HiddenCostOut, TotalsOut } from "./types.js";

export function projectHiddenCosts(costs: HiddenCost[]): HiddenCostOut[] {
  return costs.map((c) => {
    const min = c.annualCostUsd?.[0] ?? 0;
    const max = c.annualCostUsd?.[1] ?? 0;
    return {
      name: c.name,
      annualMin: round2(min),
      annualMax: round2(max),
      annualMid: round2((min + max) / 2),
      frequency: c.frequency,
    };
  });
}

/**
 * A cost is "one-time" (counted once, not recurring) when its `frequency`
 * string contains the word "one-time" or "upfront" or "initial".
 */
export function isOneTime(frequency: string): boolean {
  return /^one-?time|^upfront|^initial/i.test(frequency);
}

export interface ComputeTotalsInput {
  sticker: number;
  tax: number;
  shipping: number;
  hiddenCosts: HiddenCostOut[];
}

export function computeTotals(input: ComputeTotalsInput): TotalsOut {
  const upfront = input.sticker + input.tax + input.shipping;
  let oneTimeHidden = 0;
  let ongoingAnnual = 0;
  for (const h of input.hiddenCosts) {
    if (isOneTime(h.frequency)) oneTimeHidden += h.annualMid;
    else ongoingAnnual += h.annualMid;
  }
  const year1 = upfront + oneTimeHidden + ongoingAnnual;
  const year3 = upfront + oneTimeHidden + 3 * ongoingAnnual;
  return {
    upfront: round2(upfront),
    year1: round2(year1),
    year3: round2(year3),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
