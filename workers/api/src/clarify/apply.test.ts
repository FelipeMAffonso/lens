import { describe, expect, it } from "vitest";
import type { UserIntent } from "@lens/shared";
import { applyClarificationAnswers, ClarifyClipZeroedError, lowConfidenceCriteria, MAX_CRITERIA } from "./apply.js";
import type { ClarifyQuestion } from "./types.js";

function q(id: string, targetCriterion: string, shiftA: Record<string, number>, shiftB: Record<string, number>): ClarifyQuestion {
  return {
    id,
    targetCriterion,
    prompt: `Mock ${targetCriterion}`,
    optionA: { label: "A", impliedWeightShift: shiftA },
    optionB: { label: "B", impliedWeightShift: shiftB },
  };
}

const mkIntent = (crits: UserIntent["criteria"]): UserIntent => ({
  category: "test",
  criteria: crits,
  rawCriteriaText: "",
});

describe("applyClarificationAnswers", () => {
  it("returns intent unchanged with empty answer list", () => {
    const intent = mkIntent([{ name: "a", weight: 0.5, direction: "higher_is_better", confidence: 0.4 }, { name: "b", weight: 0.5, direction: "higher_is_better", confidence: 0.8 }]);
    const out = applyClarificationAnswers(intent, []);
    expect(out).toBe(intent);
  });

  it("shifts weights deterministically and renormalizes to sum 1", () => {
    const intent = mkIntent([
      { name: "speed", weight: 0.5, direction: "higher_is_better", confidence: 0.4 },
      { name: "price", weight: 0.5, direction: "lower_is_better", confidence: 0.8 },
    ]);
    const question = q("q1", "speed", { responsiveness: 0.15, throughput: -0.05 }, { throughput: 0.15, responsiveness: -0.05 });
    const out = applyClarificationAnswers(intent, [{ question, answer: { questionId: "q1", chose: "A" } }]);
    const total = out.criteria.reduce((s, c) => s + c.weight, 0);
    expect(total).toBeCloseTo(1, 6);
    // responsiveness was created and got +0.15 (before normalize)
    const r = out.criteria.find((c) => c.name === "responsiveness");
    expect(r).toBeDefined();
    expect(r!.confidence).toBe(0.9);
  });

  it("clips individual weights to [0,1]; positive clip OK", () => {
    const intent = mkIntent([{ name: "a", weight: 0.9, direction: "higher_is_better", confidence: 0.4 }]);
    const question = q("q1", "a", { a: 0.5 }, { a: -0.9 });
    const outA = applyClarificationAnswers(intent, [{ question, answer: { questionId: "q1", chose: "A" } }]);
    expect(outA.criteria[0]!.weight).toBe(1); // 0.9 + 0.5 = 1.4 → clipped to 1 → renormalized to 1
  });

  it("(judge P1-6) throws ClarifyClipZeroedError when clip zeros every weight", () => {
    const intent = mkIntent([{ name: "a", weight: 0.9, direction: "higher_is_better", confidence: 0.4 }]);
    const question = q("q1", "a", { a: 0 }, { a: -0.9 });
    expect(() =>
      applyClarificationAnswers(intent, [{ question, answer: { questionId: "q1", chose: "B" } }]),
    ).toThrow(ClarifyClipZeroedError);
  });

  it("(judge P0-3) caps criteria count at MAX_CRITERIA after apply", () => {
    // Craft an answer that creates 30 new criteria.
    const intent = mkIntent([{ name: "base", weight: 1, direction: "higher_is_better", confidence: 0.4 }]);
    const bloatShift: Record<string, number> = {};
    for (let i = 0; i < 30; i++) bloatShift[`crit_${i}`] = 0.1;
    const question = q("q1", "base", bloatShift, { base: 0 });
    const out = applyClarificationAnswers(intent, [{ question, answer: { questionId: "q1", chose: "A" } }]);
    expect(out.criteria.length).toBeLessThanOrEqual(MAX_CRITERIA);
    const total = out.criteria.reduce((s, c) => s + c.weight, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it("creates new criteria when shift targets unknown names", () => {
    const intent = mkIntent([
      { name: "speed", weight: 1, direction: "higher_is_better", confidence: 0.4 },
    ]);
    const question = q("q1", "speed", { responsiveness: 0.2, throughput: 0.1 }, { speed: 0 });
    const out = applyClarificationAnswers(intent, [{ question, answer: { questionId: "q1", chose: "A" } }]);
    const names = out.criteria.map((c) => c.name).sort();
    expect(names).toEqual(["responsiveness", "speed", "throughput"]);
    const total = out.criteria.reduce((s, c) => s + c.weight, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it("sets confidence to 0.9 on every touched criterion", () => {
    const intent = mkIntent([
      { name: "speed", weight: 0.4, direction: "higher_is_better", confidence: 0.3 },
      { name: "price", weight: 0.6, direction: "lower_is_better", confidence: 0.5 },
    ]);
    const question = q("q1", "speed", { speed: 0.1, price: -0.05 }, { speed: -0.1, price: 0.05 });
    const out = applyClarificationAnswers(intent, [{ question, answer: { questionId: "q1", chose: "A" } }]);
    expect(out.criteria.find((c) => c.name === "speed")!.confidence).toBe(0.9);
    expect(out.criteria.find((c) => c.name === "price")!.confidence).toBe(0.9);
  });

  it("handles multiple answers sequentially", () => {
    const intent = mkIntent([
      { name: "a", weight: 0.5, direction: "higher_is_better", confidence: 0.4 },
      { name: "b", weight: 0.5, direction: "higher_is_better", confidence: 0.4 },
    ]);
    const q1 = q("q1", "a", { a: 0.1 }, { a: -0.1 });
    const q2 = q("q2", "b", { b: 0.2 }, { b: -0.2 });
    const out = applyClarificationAnswers(intent, [
      { question: q1, answer: { questionId: "q1", chose: "A" } },
      { question: q2, answer: { questionId: "q2", chose: "B" } },
    ]);
    expect(out.criteria.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1, 6);
    expect(out.criteria.find((c) => c.name === "a")!.confidence).toBe(0.9);
    expect(out.criteria.find((c) => c.name === "b")!.confidence).toBe(0.9);
  });

  it("ignores non-finite delta values", () => {
    const intent = mkIntent([{ name: "a", weight: 1, direction: "higher_is_better", confidence: 0.4 }]);
    const question = q("q1", "a", { a: NaN, b: Infinity, c: 0.1 }, { a: 0 });
    const out = applyClarificationAnswers(intent, [{ question, answer: { questionId: "q1", chose: "A" } }]);
    const total = out.criteria.reduce((s, c) => s + c.weight, 0);
    expect(total).toBeCloseTo(1, 6);
    // c got the only valid shift (0.1); a stayed at 1 (no valid shift); b got nothing (Infinity rejected)
    const names = out.criteria.map((c) => c.name).sort();
    expect(names).toEqual(["a", "c"]);
  });

  it("preserves direction + target on existing criteria", () => {
    const intent = mkIntent([
      { name: "temp", weight: 1, direction: "target", target: 200, confidence: 0.4 },
    ]);
    const question = q("q1", "temp", { temp: 0 }, { temp: 0 });
    const out = applyClarificationAnswers(intent, [{ question, answer: { questionId: "q1", chose: "A" } }]);
    expect(out.criteria[0]!.direction).toBe("target");
    expect(out.criteria[0]!.target).toBe(200);
  });
});

describe("lowConfidenceCriteria", () => {
  it("returns names below threshold", () => {
    const intent = mkIntent([
      { name: "a", weight: 0.3, direction: "higher_is_better", confidence: 0.4 },
      { name: "b", weight: 0.3, direction: "higher_is_better", confidence: 0.7 },
      { name: "c", weight: 0.4, direction: "higher_is_better", confidence: 0.55 },
    ]);
    expect(lowConfidenceCriteria(intent, 0.6)).toEqual(["a", "c"]);
  });

  it("(judge P1-9) defaults missing confidence to threshold — no accidental trigger", () => {
    const intent = mkIntent([{ name: "a", weight: 1, direction: "higher_is_better" }]);
    // conf defaults to threshold (0.6); not < 0.6 so not flagged.
    expect(lowConfidenceCriteria(intent, 0.6)).toEqual([]);
  });

  it("returns empty when everything is confident", () => {
    const intent = mkIntent([{ name: "a", weight: 1, direction: "higher_is_better", confidence: 0.95 }]);
    expect(lowConfidenceCriteria(intent, 0.6)).toEqual([]);
  });
});
