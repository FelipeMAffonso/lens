// CJ-W48 — budget band mapping (recipient never sees the raw dollar figure).

import type { BudgetBand } from "./types.js";

export function bandFor(maxUsd: number): BudgetBand {
  if (maxUsd < 50) return { label: "entry", hint: "something nice and simple" };
  if (maxUsd < 150) return { label: "thoughtful", hint: "something considered" };
  if (maxUsd < 400) return { label: "premium", hint: "something premium" };
  if (maxUsd < 1000) return { label: "luxury", hint: "something special" };
  return { label: "ultra", hint: "something extraordinary" };
}
