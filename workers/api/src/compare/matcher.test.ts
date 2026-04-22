import { describe, expect, it } from "vitest";
import { findFixture, framingFromFixture, resolvePersona } from "./matcher.js";
import { FIXTURES } from "./fixtures.js";

describe("findFixture", () => {
  it("matches canonical camera pair", () => {
    const m = findFixture("mirrorless camera", "dslr");
    expect(m).not.toBeNull();
    expect(m!.direct).toBe(true);
  });

  it("matches swapped camera pair", () => {
    const m = findFixture("dslr", "mirrorless");
    expect(m).not.toBeNull();
    expect(m!.direct).toBe(false);
  });

  it("matches on synonym (full-frame dslr)", () => {
    const m = findFixture("mirrorless", "full-frame dslr");
    expect(m).not.toBeNull();
  });

  it("matches ipad vs laptop", () => {
    const m = findFixture("ipad", "laptop");
    expect(m).not.toBeNull();
    expect(m!.fixture.optionA.canonical).toContain("ipad");
  });

  it("matches ev vs hybrid", () => {
    const m = findFixture("electric vehicle", "plug-in hybrid");
    expect(m).not.toBeNull();
  });

  it("matches ereader vs tablet", () => {
    const m = findFixture("kindle", "tablet");
    expect(m).not.toBeNull();
  });

  it("matches android vs iphone", () => {
    const m = findFixture("android", "iphone");
    expect(m).not.toBeNull();
  });

  it("matches mechanical vs membrane keyboard", () => {
    const m = findFixture("mechanical keyboard", "chiclet keyboard");
    expect(m).not.toBeNull();
  });

  it("returns null for an unknown pair", () => {
    const m = findFixture("gas stove", "induction cooktop");
    expect(m).toBeNull();
  });

  it("returns null for unrelated optionB", () => {
    const m = findFixture("mirrorless camera", "gas stove");
    expect(m).toBeNull();
  });
});

describe("resolvePersona", () => {
  it("returns the requested persona when the fixture supports it", () => {
    const p = resolvePersona(FIXTURES[0]!, "beginner");
    expect(p).toBe("beginner");
  });

  it("falls back to general when requested persona is unknown", () => {
    const p = resolvePersona(FIXTURES[0]!, "expert-wildlife-photographer-of-the-year");
    expect(p).toBe("general");
  });

  it("returns general when no persona is supplied", () => {
    const p = resolvePersona(FIXTURES[0]!);
    expect(p).toBe("general");
  });
});

describe("framingFromFixture", () => {
  it("preserves option order when the fixture direction matches", () => {
    const m = findFixture("mirrorless", "dslr");
    const f = framingFromFixture(m!, "mirrorless", "dslr", "beginner");
    expect(f.optionA).toBe("mirrorless");
    expect(f.optionB).toBe("dslr");
    expect(f.persona).toBe("beginner");
    expect(f.axes.length).toBeGreaterThan(0);
    expect(f.verdict.summary.length).toBeGreaterThan(10);
  });

  it("swaps axes + verdict when the fixture direction is reversed", () => {
    const direct = framingFromFixture(findFixture("mirrorless", "dslr")!, "mirrorless", "dslr", "beginner");
    const swapped = framingFromFixture(findFixture("dslr", "mirrorless")!, "dslr", "mirrorless", "beginner");
    // The swapped framing's first axis should have the A/B content flipped relative to direct.
    const d0 = direct.axes[0]!;
    const s0 = swapped.axes[0]!;
    expect(s0.aAssessment).toBe(d0.bAssessment);
    expect(s0.bAssessment).toBe(d0.aAssessment);
    // And the overall verdict should flip leaning.
    if (direct.verdict.leaning === "A") expect(swapped.verdict.leaning).toBe("B");
    else if (direct.verdict.leaning === "B") expect(swapped.verdict.leaning).toBe("A");
    else expect(swapped.verdict.leaning).toBe("tied");
  });

  it("different personas produce different verdicts on the same pair", () => {
    const match = findFixture("ipad", "laptop")!;
    const student = framingFromFixture(match, "ipad", "laptop", "student");
    const casual = framingFromFixture(match, "ipad", "laptop", "casual");
    expect(student.verdict.summary).not.toBe(casual.verdict.summary);
  });

  it("every axis has non-empty assessments for both sides", () => {
    for (const f of FIXTURES) {
      for (const persona of f.personas) {
        const axes = f.perPersonaAxes[persona];
        if (!axes) continue;
        for (const a of axes) {
          expect(a.aAssessment.length).toBeGreaterThan(4);
          expect(a.bAssessment.length).toBeGreaterThan(4);
          expect(["A", "B", "tied"]).toContain(a.leans);
        }
      }
    }
  });

  it("covers all 6 expected comparison categories", () => {
    expect(FIXTURES).toHaveLength(6);
  });
});
