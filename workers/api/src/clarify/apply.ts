// S1-W8 — deterministic weight update from clarification answers.

import type { UserIntent } from "@lens/shared";
import type { ClarifyAnswer, ClarifyQuestion } from "./types.js";

export interface AnswerPair {
  question: ClarifyQuestion;
  answer: ClarifyAnswer;
}

/**
 * Pure function: given an intent + answers, produce a new intent with weights
 * updated, new criteria created when an answer shifts weight onto an unknown
 * criterion, and clarified criteria marked confidence = 0.9 (user-explicit).
 *
 * Invariants:
 * - Weights clip to [0, 1].
 * - Weights renormalize to sum == 1 across all criteria.
 * - Confidence of the targetCriterion becomes 0.9.
 * - Confidence of any criterion that received a non-zero shift becomes 0.9.
 * - If every resulting weight would be 0 (impossible clip), we fall back to
 *   uniform weights with confidence unchanged.
 */
export function applyClarificationAnswers(intent: UserIntent, pairs: AnswerPair[]): UserIntent {
  if (pairs.length === 0) return intent;

  // Build a mutable map for clear ergonomics + preserve insertion order.
  const weights = new Map<string, number>();
  const directions = new Map<string, "higher_is_better" | "lower_is_better" | "target" | "binary">();
  const targets = new Map<string, string | number | undefined>();
  const confidences = new Map<string, number>();
  for (const c of intent.criteria) {
    weights.set(c.name, c.weight);
    directions.set(c.name, c.direction);
    targets.set(c.name, c.target);
    confidences.set(c.name, c.confidence ?? 1);
  }

  const touched = new Set<string>();

  for (const { question, answer } of pairs) {
    const chosen = answer.chose === "A" ? question.optionA : question.optionB;
    touched.add(question.targetCriterion);
    for (const [criterion, delta] of Object.entries(chosen.impliedWeightShift)) {
      if (!Number.isFinite(delta)) continue;
      const prior = weights.get(criterion) ?? 0;
      const next = Math.max(0, Math.min(1, prior + delta));
      weights.set(criterion, next);
      if (!directions.has(criterion)) directions.set(criterion, "higher_is_better");
      touched.add(criterion);
    }
  }

  // Clarified criteria are user-confirmed → confidence = 0.9.
  for (const name of touched) confidences.set(name, 0.9);

  // Renormalize so weights sum to 1 across all criteria.
  const total = [...weights.values()].reduce((s, w) => s + w, 0);
  let normalizedWeights: Map<string, number>;
  if (total === 0) {
    // Degenerate — fall back to uniform.
    const u = 1 / Math.max(weights.size, 1);
    normalizedWeights = new Map([...weights.keys()].map((k) => [k, u]));
  } else {
    normalizedWeights = new Map([...weights.entries()].map(([k, v]) => [k, v / total]));
  }

  const updatedCriteria = [...normalizedWeights.entries()].map(([name, weight]) => {
    const direction = directions.get(name) ?? "higher_is_better";
    const target = targets.get(name);
    const confidence = confidences.get(name) ?? 0.5;
    const base: UserIntent["criteria"][number] = { name, weight, direction, confidence };
    if (target !== undefined) base.target = target;
    return base;
  });

  return { ...intent, criteria: updatedCriteria };
}

/**
 * Return the list of criterion names in the intent whose confidence is below
 * the trigger threshold. Used by /clarify to decide whether to generate
 * questions.
 */
export function lowConfidenceCriteria(intent: UserIntent, threshold: number): string[] {
  const out: string[] = [];
  for (const c of intent.criteria) {
    const conf = c.confidence ?? 1;
    if (conf < threshold) out.push(c.name);
  }
  return out;
}
