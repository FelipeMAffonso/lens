// S1-W9 — fixture matcher.
// Given an (optionA, optionB, persona) query, find a fixture that matches
// bidirectionally (query-A can match fixture-A or fixture-B; we swap the
// axes if needed so the returned framing uses the user's option names).

import { FIXTURES, tokenizeComparison } from "./fixtures.js";
import type { Axis, FixtureEntry, Framing, Lean, Verdict } from "./types.js";

function containment(subset: Set<string>, superset: Set<string>): number {
  if (subset.size === 0 || superset.size === 0) return 0;
  let intersect = 0;
  for (const x of subset) if (superset.has(x)) intersect += 1;
  return intersect / subset.size;
}

function bestContainment(a: Set<string>, b: Set<string>): number {
  // Symmetric best — A in B or B in A, whichever matches more fully.
  return Math.max(containment(a, b), containment(b, a));
}

interface Match {
  fixture: FixtureEntry;
  /**
   * true  → fixture.A matches query.A AND fixture.B matches query.B
   * false → fixture.A matches query.B AND fixture.B matches query.A (swap)
   */
  direct: boolean;
  score: number;
}

export function findFixture(optionA: string, optionB: string): Match | null {
  const qA = tokenizeComparison(optionA);
  const qB = tokenizeComparison(optionB);
  let best: Match | null = null;
  const SIDE_THRESHOLD = 0.5;
  for (const f of FIXTURES) {
    // Direct: fixture-A ~ qA AND fixture-B ~ qB — BOTH sides must clear independently.
    const directA = bestContainment(qA, f.optionA.tokens);
    const directB = bestContainment(qB, f.optionB.tokens);
    const directOk = directA >= SIDE_THRESHOLD && directB >= SIDE_THRESHOLD;
    const directScore = directOk ? (directA + directB) / 2 : 0;
    // Swap: fixture-A ~ qB AND fixture-B ~ qA — BOTH sides must clear independently.
    const swapA = bestContainment(qA, f.optionB.tokens);
    const swapB = bestContainment(qB, f.optionA.tokens);
    const swapOk = swapA >= SIDE_THRESHOLD && swapB >= SIDE_THRESHOLD;
    const swapScore = swapOk ? (swapA + swapB) / 2 : 0;
    if (directScore === 0 && swapScore === 0) continue;
    if (directScore >= swapScore) {
      if (!best || directScore > best.score) best = { fixture: f, direct: true, score: directScore };
    } else {
      if (!best || swapScore > best.score) best = { fixture: f, direct: false, score: swapScore };
    }
  }
  return best;
}

export function resolvePersona(fixture: FixtureEntry, requested?: string): string {
  const p = (requested ?? "").toLowerCase().trim();
  if (p && fixture.personas.has(p)) return p;
  if (fixture.personas.has("general")) return "general";
  // Fall back to the first available persona key.
  return [...fixture.personas][0] ?? "general";
}

function flipLean(l: Lean): Lean {
  if (l === "A") return "B";
  if (l === "B") return "A";
  return "tied";
}

function swapAxis(a: Axis): Axis {
  return {
    ...a,
    aAssessment: a.bAssessment,
    bAssessment: a.aAssessment,
    leans: flipLean(a.leans),
  };
}

function swapVerdict(v: Verdict): Verdict {
  return {
    ...v,
    leaning: flipLean(v.leaning),
  };
}

export function framingFromFixture(
  match: Match,
  optionA: string,
  optionB: string,
  personaRequested?: string,
): Framing {
  const persona = resolvePersona(match.fixture, personaRequested);
  const rawAxes = match.fixture.perPersonaAxes[persona] ?? [];
  const rawVerdict = match.fixture.perPersonaVerdict[persona];
  const axes = match.direct ? rawAxes : rawAxes.map(swapAxis);
  const verdict = rawVerdict ? (match.direct ? rawVerdict : swapVerdict(rawVerdict)) : {
    leaning: "tied" as Lean,
    summary: "No persona-specific verdict available for this pair.",
    caveats: [],
  };
  return {
    optionA,
    optionB,
    persona,
    axes,
    verdict,
  };
}
