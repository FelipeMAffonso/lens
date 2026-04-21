import type { Candidate, UserIntent } from "@lens/shared";

/**
 * Deterministic, transparent ranking of candidates.
 *
 * For each criterion c with weight w_c and direction d_c:
 *   s_c(candidate) ∈ [0, 1] is the candidate's normalized score on that criterion.
 * Utility = Σ w_c * s_c
 *
 * Every component is exposed in Candidate.utilityBreakdown so the UI can show the hover-tooltip
 * explanation for why Lens ranked each candidate where it did.
 */
export async function rankCandidates(
  intent: UserIntent,
  candidates: Candidate[],
): Promise<Candidate[]> {
  const safeCandidates = candidates.filter((c): c is Candidate => !!c && typeof c.name === "string");
  const safeCriteria =
    intent.criteria && intent.criteria.length > 0
      ? intent.criteria
      : [{ name: "overall_quality", weight: 1, direction: "higher_is_better" as const }];

  const scored = safeCandidates.map((cand) => {
    const breakdown = safeCriteria.map((crit) => {
      const rawValues = safeCandidates
        .map((c) => toNumberIfPossible(c.specs?.[crit.name]))
        .filter((v): v is number => v !== null);
      const min = rawValues.length ? Math.min(...rawValues) : 0;
      const max = rawValues.length ? Math.max(...rawValues) : 1;

      const raw = cand.specs?.[crit.name];
      let score = 0;
      const n = toNumberIfPossible(raw);
      if (n !== null && max !== min) {
        if (crit.direction === "higher_is_better") score = (n - min) / (max - min);
        else if (crit.direction === "lower_is_better") score = 1 - (n - min) / (max - min);
        else if (crit.direction === "target" && typeof crit.target === "number") {
          const range = max - min || 1;
          score = 1 - Math.min(1, Math.abs(n - crit.target) / range);
        }
      } else if (crit.direction === "binary" && typeof raw === "boolean") {
        score = raw ? 1 : 0;
      } else if (typeof raw === "string" && typeof crit.target === "string") {
        score = raw.toLowerCase().includes(crit.target.toLowerCase()) ? 1 : 0;
      }

      return {
        criterion: crit.name,
        weight: crit.weight,
        score,
        contribution: crit.weight * score,
      };
    });

    const utilityScore = breakdown.reduce((s, b) => s + b.contribution, 0);
    const attributeScores: Record<string, number> = {};
    for (const b of breakdown) attributeScores[b.criterion] = b.score;

    return { ...cand, attributeScores, utilityBreakdown: breakdown, utilityScore };
  });

  // Descending by utility.
  scored.sort((a, b) => b.utilityScore - a.utilityScore);
  return scored;
}

function toNumberIfPossible(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const match = v.match(/-?\d+(\.\d+)?/);
    if (match) return Number(match[0]);
  }
  return null;
}
