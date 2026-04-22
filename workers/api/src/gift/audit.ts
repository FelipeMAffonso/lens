// CJ-W48 — gift-buying audit output for the giver view.
// Pure math: pulls candidates from the fixture catalog, filters by the
// giver's budget band, ranks via the same Σ wᵢ · sᵢ math the audit pipeline
// uses, returns top-3 plus 75/100/150% tiers plus a "#1 vs #2" narrative.

import type { Candidate, UserIntent } from "@lens/shared";
import { lookupCatalog } from "../fixtureCatalog.js";
import { rankCandidates } from "../rank.js";
import type { GiftAudit, GiftAuditCandidate } from "./types.js";

interface AuditInput {
  category: string | null;
  budgetMinUsd: number | null;
  budgetMaxUsd: number;
  criteria: Record<string, number>;
}

function toUserIntent(criteria: Record<string, number>, category: string): UserIntent {
  const entries = Object.entries(criteria).filter(([, w]) => w > 0);
  const sum = entries.reduce((a, [, w]) => a + w, 0) || 1;
  return {
    category,
    rawCriteriaText: "",
    criteria: entries.map(([name, w]) => ({
      name,
      weight: w / sum,
      direction: "higher_is_better" as const,
    })),
  };
}

function candidateWithinBudget(
  c: Candidate,
  minUsd: number | null,
  maxUsd: number,
): boolean {
  if (typeof c.price !== "number") return true;
  if (minUsd !== null && c.price < minUsd) return false;
  if (c.price > maxUsd) return false;
  return true;
}

function toOut(c: Candidate): GiftAuditCandidate {
  const contributions: Record<string, number> = {};
  for (const row of c.utilityBreakdown ?? []) {
    contributions[row.criterion] = Number((row.weight * row.score).toFixed(4));
  }
  return {
    name: c.name,
    brand: c.brand ?? null,
    price: typeof c.price === "number" ? c.price : 0,
    url: c.url ?? null,
    utility: Number((c.utilityScore ?? 0).toFixed(4)),
    contributions,
  };
}

function narrate(ranked: Candidate[]): string {
  const a = ranked[0];
  const b = ranked[1];
  if (!a) return "No candidates matched the budget + category.";
  if (!b) return `#1 pick: ${a.name}. No runner-up in the budget window.`;
  const deltaTotal = (a.utilityScore ?? 0) - (b.utilityScore ?? 0);
  // Top-2 criterion drivers
  const pairs: Array<{ criterion: string; delta: number }> = [];
  const breakdownA = new Map((a.utilityBreakdown ?? []).map((r) => [r.criterion, r.weight * r.score]));
  const breakdownB = new Map((b.utilityBreakdown ?? []).map((r) => [r.criterion, r.weight * r.score]));
  for (const [k, va] of breakdownA) {
    const vb = breakdownB.get(k) ?? 0;
    pairs.push({ criterion: k, delta: va - vb });
  }
  pairs.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  const top = pairs.slice(0, 2);
  const drivers = top
    .map((p) => `${p.criterion} (${p.delta >= 0 ? "+" : ""}${p.delta.toFixed(2)})`)
    .join(", ");
  return `#1 (${a.name}) beats #2 (${b.name}) by +${deltaTotal.toFixed(2)} utility — driven by ${drivers}.`;
}

export async function computeGiftAudit(input: AuditInput): Promise<GiftAudit> {
  if (!input.category) {
    return {
      catalog: "none",
      candidates: [],
      tiers: {},
      narrative:
        "No category set. Share a category (e.g. espresso-machines) so Lens can pre-rank picks from its deterministic catalog, or run /audit with these criteria for a live-search pick.",
    };
  }
  const all = lookupCatalog(input.category);
  const filtered = all.filter((c) => candidateWithinBudget(c, input.budgetMinUsd, input.budgetMaxUsd));
  if (filtered.length === 0) {
    return {
      catalog: "fixture",
      candidates: [],
      tiers: {},
      narrative: "No fixture catalog item fits within the budget window for this category.",
    };
  }
  const intent = toUserIntent(input.criteria, input.category);
  const ranked = await rankCandidates(intent, filtered);
  const top = ranked.slice(0, 3).map(toOut);

  // Tiers: find best candidate under N% of max budget.
  const tiers: Record<string, GiftAuditCandidate | null> = {};
  for (const pct of [75, 100, 150]) {
    const pctCap = Math.round((input.budgetMaxUsd * pct) / 100);
    const inTier = ranked.filter(
      (c) => candidateWithinBudget(c, input.budgetMinUsd, pctCap) && typeof c.price === "number",
    );
    tiers[String(pct)] = inTier.length > 0 ? toOut(inTier[0]!) : null;
  }

  return {
    catalog: "fixture",
    candidates: top,
    tiers,
    narrative: narrate(ranked),
  };
}
