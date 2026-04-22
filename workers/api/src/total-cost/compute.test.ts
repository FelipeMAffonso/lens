import { describe, expect, it } from "vitest";
import { computeTotals, isOneTime, projectHiddenCosts } from "./compute.js";

describe("projectHiddenCosts", () => {
  it("computes midpoint from [min, max] range", () => {
    const r = projectHiddenCosts([
      { name: "beans", annualCostUsd: [180, 720], frequency: "ongoing" },
      { name: "descaler", annualCostUsd: [15, 30], frequency: "quarterly" },
    ]);
    expect(r[0]!.annualMid).toBe(450);
    expect(r[1]!.annualMid).toBe(22.5);
  });

  it("survives missing tuple", () => {
    const r = projectHiddenCosts([
      { name: "x", annualCostUsd: [0, 0], frequency: "ongoing" },
    ]);
    expect(r[0]!.annualMid).toBe(0);
  });
});

describe("isOneTime", () => {
  it("detects 'one-time' / 'upfront' / 'initial'", () => {
    expect(isOneTime("one-time")).toBe(true);
    expect(isOneTime("One-Time")).toBe(true);
    expect(isOneTime("upfront")).toBe(true);
    expect(isOneTime("initial purchase")).toBe(true);
  });
  it("rejects ongoing / quarterly / annual", () => {
    expect(isOneTime("ongoing")).toBe(false);
    expect(isOneTime("quarterly")).toBe(false);
    expect(isOneTime("annual")).toBe(false);
  });
});

describe("computeTotals", () => {
  it("year1 = upfront + mid(all hidden) regardless of one-time vs ongoing", () => {
    const t = computeTotals({
      sticker: 500,
      tax: 40,
      shipping: 0,
      hiddenCosts: [
        { name: "grinder", annualMin: 150, annualMax: 800, annualMid: 475, frequency: "one-time" },
        { name: "beans", annualMin: 180, annualMax: 720, annualMid: 450, frequency: "ongoing" },
      ],
    });
    expect(t.upfront).toBe(540); // 500 + 40 + 0
    expect(t.year1).toBe(540 + 475 + 450);
    expect(t.year3).toBe(540 + 475 + 3 * 450); // one-time counted once, ongoing thrice
  });

  it("year1 == upfront when no hidden costs", () => {
    const t = computeTotals({ sticker: 100, tax: 8, shipping: 5, hiddenCosts: [] });
    expect(t.upfront).toBe(113);
    expect(t.year1).toBe(113);
    expect(t.year3).toBe(113);
  });

  it("2-decimal rounding", () => {
    const t = computeTotals({
      sticker: 99.995,
      tax: 8.1234,
      shipping: 0,
      hiddenCosts: [],
    });
    expect(t.upfront).toBe(108.12);
  });
});
