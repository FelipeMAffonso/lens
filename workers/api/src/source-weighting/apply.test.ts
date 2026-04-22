import { describe, expect, it } from "vitest";
import { applyWeighting } from "./apply.js";

describe("applyWeighting", () => {
  it("pure vendor boost at max vendor weight + vendorSignal=1", () => {
    // base 0.7 + 1 * (1 - 0.5) * 0.3 = 0.85
    const r = applyWeighting({
      baseUtility: 0.7,
      vendorSignal: 1,
      independentSignal: 0,
      weighting: { vendor: 1, independent: 0 },
    });
    expect(r.finalUtility).toBeCloseTo(0.85);
    expect(r.contributions.vendor).toBeCloseTo(0.15);
    expect(r.contributions.independent).toBe(0);
  });

  it("pure independent boost at max independent weight", () => {
    const r = applyWeighting({
      baseUtility: 0.5,
      vendorSignal: 0,
      independentSignal: 1,
      weighting: { vendor: 0, independent: 1 },
    });
    expect(r.finalUtility).toBeCloseTo(0.65);
  });

  it("50/50 neutral → vendor + independent contributions cancel when signals opposite", () => {
    const r = applyWeighting({
      baseUtility: 0.6,
      vendorSignal: 1,
      independentSignal: 0,
      weighting: { vendor: 0.5, independent: 0.5 },
    });
    // 0.5 * 0.5 * 0.3 + 0.5 * -0.5 * 0.3 = 0
    expect(r.finalUtility).toBeCloseTo(0.6);
  });

  it("missing independent signal redistributes weight to vendor", () => {
    // With independent null, effective vendor weight = 1.0, so
    // boost = 1.0 * (1 - 0.5) * 0.3 = 0.15
    const r = applyWeighting({
      baseUtility: 0.5,
      vendorSignal: 1,
      independentSignal: null,
      weighting: { vendor: 0.3, independent: 0.7 },
    });
    expect(r.finalUtility).toBeCloseTo(0.65);
    expect(r.contributions.vendor).toBeCloseTo(0.15);
    expect(r.contributions.independent).toBe(0);
  });

  it("missing vendor signal redistributes weight to independent", () => {
    const r = applyWeighting({
      baseUtility: 0.5,
      vendorSignal: null,
      independentSignal: 0,
      weighting: { vendor: 0.3, independent: 0.7 },
    });
    expect(r.finalUtility).toBeCloseTo(0.35);
    expect(r.contributions.independent).toBeCloseTo(-0.15);
  });

  it("both signals null → zero contribution, final equals base", () => {
    const r = applyWeighting({
      baseUtility: 0.4,
      vendorSignal: null,
      independentSignal: null,
      weighting: { vendor: 0.5, independent: 0.5 },
    });
    expect(r.finalUtility).toBe(0.4);
    expect(r.contributions.vendor).toBe(0);
    expect(r.contributions.independent).toBe(0);
  });

  it("clamps final utility to [0, 1]", () => {
    const r = applyWeighting({
      baseUtility: 0.95,
      vendorSignal: 1,
      independentSignal: 1,
      weighting: { vendor: 0.5, independent: 0.5 },
    });
    // 0.95 + 0.5 * 0.5 * 0.3 + 0.5 * 0.5 * 0.3 = 0.95 + 0.15 = 1.10 → clamp 1
    expect(r.finalUtility).toBe(1);
  });

  it("negative signals clamp at 0 floor", () => {
    const r = applyWeighting({
      baseUtility: 0.05,
      vendorSignal: 0,
      independentSignal: 0,
      weighting: { vendor: 0.5, independent: 0.5 },
    });
    // 0.05 + 0.5*(-0.5)*0.3 + 0.5*(-0.5)*0.3 = 0.05 - 0.15 = -0.1 → 0
    expect(r.finalUtility).toBe(0);
  });
});
