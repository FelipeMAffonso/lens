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
  // Judge P0 #1 / P1 #4: filter blank / whitespace-only names before any downstream
  // string op. P1 #7: treat malformed intent as an empty criteria bag.
  const safeIntent = intent ?? ({} as UserIntent);
  const safeCandidates = candidates.filter(
    (c): c is Candidate => !!c && typeof c.name === "string" && c.name.trim().length > 0,
  );
  const VALID_DIRECTIONS = new Set(["higher_is_better", "lower_is_better", "target", "binary"] as const);
  const DEFAULT_CRITERION = { name: "overall_quality", weight: 1, direction: "higher_is_better" as const };
  const droppedCriteriaCount = { count: 0 };
  // Judge P1 #5, #6: coerce weight to a finite number + normalize direction. Drop
  // criteria where we cannot recover a sane shape.
  const usableFromIntent = (safeIntent.criteria ?? [])
    .map((c) => {
      if (!c || typeof c !== "object") { droppedCriteriaCount.count++; return null; }
      const name = typeof c.name === "string" ? c.name.trim() : "";
      if (name.length === 0) { droppedCriteriaCount.count++; return null; }
      const rawWeight = (c as { weight?: unknown }).weight;
      const weight =
        typeof rawWeight === "number" && Number.isFinite(rawWeight)
          ? rawWeight
          : typeof rawWeight === "string"
            ? Number.parseFloat(rawWeight) || 0
            : 0;
      if (!Number.isFinite(weight) || weight < 0) { droppedCriteriaCount.count++; return null; }
      const rawDir = (c as { direction?: unknown }).direction;
      const direction = typeof rawDir === "string" && VALID_DIRECTIONS.has(rawDir as never)
        ? (rawDir as "higher_is_better" | "lower_is_better" | "target" | "binary")
        : "higher_is_better";
      const rawTarget = (c as { target?: unknown }).target;
      const target = typeof rawTarget === "number" || typeof rawTarget === "string" ? rawTarget : undefined;
      return { name, weight, direction, target };
    })
    .filter((c): c is { name: string; weight: number; direction: "higher_is_better" | "lower_is_better" | "target" | "binary"; target: string | number | undefined } => c !== null);
  const fellBackToDefault = usableFromIntent.length === 0;
  const safeCriteria = fellBackToDefault ? [DEFAULT_CRITERION] : usableFromIntent;
  if (droppedCriteriaCount.count > 0 || fellBackToDefault) {
    console.warn(
      "[rank] dropped=%d fellBackToDefault=%s — Opus may have freelanced criteria without names/weights",
      droppedCriteriaCount.count,
      fellBackToDefault,
    );
  }

  const scored = safeCandidates.map((cand) => {
    const breakdown = safeCriteria.map((crit) => {
      const rawValues = safeCandidates
        .map((c) => toNumberIfPossible(lookupSpec(c.specs, crit.name)))
        .filter((v): v is number => v !== null);
      const min = rawValues.length ? Math.min(...rawValues) : 0;
      const max = rawValues.length ? Math.max(...rawValues) : 1;

      const raw = lookupSpec(cand.specs, crit.name);
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

/**
 * Try the exact criterion name first, then common field-name aliases so that
 * a pack criterion "build_quality" can resolve to fixture field "build_score"
 * or "build_quality_score" without requiring exact alignment in every catalog.
 */
function lookupSpec(
  specs: Record<string, unknown> | undefined,
  criterionName: string,
): unknown {
  if (!specs) return undefined;
  if (specs[criterionName] !== undefined) return specs[criterionName];

  const aliases = aliasSet(criterionName);
  for (const alias of aliases) {
    if (specs[alias] !== undefined) return specs[alias];
  }
  return undefined;
}

function aliasSet(name: string): string[] {
  if (typeof name !== "string" || name.length === 0) return [];
  const out = new Set<string>();
  // Normalize common suffix swaps
  const base = name
    .replace(/_score$/, "")
    .replace(/_quality$/, "")
    .replace(/_power$/, "")
    .replace(/_level$/, "");
  const bases = [name, base];
  for (const b of bases) {
    if (!b) continue;
    out.add(b);
    out.add(`${b}_score`);
    out.add(`${b}_quality`);
    out.add(`${b}_power`);
    out.add(`${b}_level`);
    out.add(`${b}_rating`);
  }
  return [...out];
}
