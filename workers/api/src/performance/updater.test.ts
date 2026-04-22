import { describe, expect, it } from "vitest";
import { applyPerformanceUpdate } from "./updater.js";

const BASE = { pressure: 0.30, build_quality: 0.25, price: 0.40, warranty: 0.05 };

function sumOf(w: Record<string, number>): number {
  return Object.values(w).reduce((a, b) => a + b, 0);
}

describe("applyPerformanceUpdate", () => {
  it("returns applied=false when there are no prior weights", () => {
    const out = applyPerformanceUpdate({
      weights: {},
      overallRating: 5,
      wouldBuyAgain: true,
    });
    expect(out.applied).toBe(false);
    expect(out.reason).toContain("no prior preference");
  });

  it("positive overall + wouldBuyAgain reinforces the top weight", () => {
    const out = applyPerformanceUpdate({
      weights: BASE,
      overallRating: 5,
      wouldBuyAgain: true,
    });
    expect(out.applied).toBe(true);
    expect(out.after!["price"]!).toBeGreaterThan(BASE.price);  // price was the top
    expect(sumOf(out.after!)).toBeCloseTo(1, 4);
  });

  it("negative overall or !wouldBuyAgain dampens the top weight", () => {
    const out = applyPerformanceUpdate({
      weights: BASE,
      overallRating: 1,
      wouldBuyAgain: false,
    });
    expect(out.applied).toBe(true);
    expect(out.after!["price"]!).toBeLessThan(BASE.price);
    expect(sumOf(out.after!)).toBeCloseTo(1, 4);
  });

  it("wouldBuyAgain=false alone triggers dampen (even with rating=3)", () => {
    const out = applyPerformanceUpdate({
      weights: BASE,
      overallRating: 3,
      wouldBuyAgain: false,
    });
    expect(out.after!["price"]!).toBeLessThan(BASE.price);
  });

  it("neutral rating (3 + wouldBuyAgain=true) applies feedback only, no overall bump", () => {
    const out = applyPerformanceUpdate({
      weights: BASE,
      overallRating: 3,
      wouldBuyAgain: true,
      criterionFeedback: [{ criterion: "build_quality", signal: "more-important" }],
    });
    // build_quality went up; others renormalized down slightly.
    expect(out.after!["build_quality"]!).toBeGreaterThan(BASE.build_quality);
    expect(out.reason).toContain("neutral");
  });

  it("per-criterion more-important bumps that criterion", () => {
    const out = applyPerformanceUpdate({
      weights: BASE,
      overallRating: 4,
      wouldBuyAgain: true,
      criterionFeedback: [{ criterion: "build_quality", signal: "more-important" }],
    });
    expect(out.after!["build_quality"]!).toBeGreaterThan(BASE.build_quality);
  });

  it("per-criterion less-important dampens that criterion", () => {
    const out = applyPerformanceUpdate({
      weights: BASE,
      overallRating: 4,
      wouldBuyAgain: true,
      criterionFeedback: [{ criterion: "warranty", signal: "less-important" }],
    });
    expect(out.after!["warranty"]!).toBeLessThanOrEqual(BASE.warranty);
  });

  it("about-right feedback has no effect on that criterion's weight", () => {
    const out = applyPerformanceUpdate({
      weights: BASE,
      overallRating: 3,
      wouldBuyAgain: true,
      criterionFeedback: [{ criterion: "price", signal: "about-right" }],
    });
    expect(out.after!["price"]!).toBeCloseTo(BASE.price, 4);
  });

  it("ignores feedback on unknown criteria without throwing", () => {
    const out = applyPerformanceUpdate({
      weights: BASE,
      overallRating: 3,
      wouldBuyAgain: true,
      criterionFeedback: [{ criterion: "does_not_exist", signal: "more-important" }],
    });
    expect(out.applied).toBe(true);
    expect(Object.keys(out.after!)).toEqual(Object.keys(BASE));
  });

  it("output weights always sum to exactly 1.0000 after rounding", () => {
    const variants = [
      { overallRating: 5, wouldBuyAgain: true },
      { overallRating: 1, wouldBuyAgain: false },
      { overallRating: 3, wouldBuyAgain: true },
      { overallRating: 5, wouldBuyAgain: true, criterionFeedback: [
        { criterion: "build_quality", signal: "more-important" as const },
        { criterion: "price", signal: "less-important" as const },
      ] },
    ];
    for (const v of variants) {
      const out = applyPerformanceUpdate({ weights: BASE, ...v });
      expect(sumOf(out.after!)).toBeCloseTo(1, 4);
    }
  });

  it("floors weights at 0 under adversarial dampening", () => {
    const thin = { a: 0.01, b: 0.99 };
    const out = applyPerformanceUpdate({
      weights: thin,
      overallRating: 1,
      wouldBuyAgain: false,
      criterionFeedback: [{ criterion: "a", signal: "less-important" }],
    });
    // a was 0.01; after -0.08 dampen then floor → 0; renormalize → remains small or 0.
    expect(out.after!["a"]!).toBeGreaterThanOrEqual(0);
  });

  it("aborts the update when every weight would floor to zero", () => {
    const all = { a: 0.03, b: 0.03 };
    const out = applyPerformanceUpdate({
      weights: all,
      overallRating: 1,
      wouldBuyAgain: false,
      criterionFeedback: [
        { criterion: "a", signal: "less-important" },
        { criterion: "b", signal: "less-important" },
      ],
    });
    // overall dampens the top (one of them) by -0.04; feedback dampens each by -0.08.
    // Both floored to 0 → sum 0 → abort.
    expect(out.applied).toBe(false);
    expect(out.reason).toContain("zero out");
  });

  it("bounded drift: single rating cannot move a weight more than 0.12 gross", () => {
    const out = applyPerformanceUpdate({
      weights: BASE,
      overallRating: 5,
      wouldBuyAgain: true,
      criterionFeedback: [{ criterion: "price", signal: "more-important" }],
    });
    // top is price, +0.04 overall + +0.08 feedback = +0.12; after renormalize,
    // the delta observable in the normalized weights is smaller still.
    expect(Math.abs(out.deltas!["price"]!)).toBeLessThanOrEqual(0.12 + 1e-4);
  });

  it("deterministic — same input → exactly same output", () => {
    const a = applyPerformanceUpdate({
      weights: BASE,
      overallRating: 4,
      wouldBuyAgain: true,
      criterionFeedback: [{ criterion: "build_quality", signal: "more-important" }],
    });
    const b = applyPerformanceUpdate({
      weights: BASE,
      overallRating: 4,
      wouldBuyAgain: true,
      criterionFeedback: [{ criterion: "build_quality", signal: "more-important" }],
    });
    expect(a.after).toEqual(b.after);
    expect(a.deltas).toEqual(b.deltas);
  });

  it("reason describes the signal path for forensic inspection", () => {
    const out = applyPerformanceUpdate({
      weights: BASE,
      overallRating: 5,
      wouldBuyAgain: true,
      criterionFeedback: [{ criterion: "build_quality", signal: "more-important" }],
    });
    expect(out.reason).toContain("reinforce");
    expect(out.reason).toContain("build_quality:more-important");
  });

  it("passes through the provided category", () => {
    const out = applyPerformanceUpdate({
      weights: BASE,
      overallRating: 4,
      wouldBuyAgain: true,
      category: "espresso-machines",
    });
    expect(out.category).toBe("espresso-machines");
  });

  it("preserves before/after shape (same keys)", () => {
    const out = applyPerformanceUpdate({
      weights: BASE,
      overallRating: 4,
      wouldBuyAgain: true,
    });
    expect(Object.keys(out.after!).sort()).toEqual(Object.keys(BASE).sort());
    expect(Object.keys(out.before!).sort()).toEqual(Object.keys(BASE).sort());
  });
});
