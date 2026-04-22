import { describe, expect, it } from "vitest";
import { normalizeWeighting } from "./normalize.js";

describe("normalizeWeighting", () => {
  it("already-normalized 70/30 is unchanged", () => {
    const r = normalizeWeighting({ vendor: 0.7, independent: 0.3 });
    expect(r.weighting).toEqual({ vendor: 0.7, independent: 0.3 });
    expect(r.normalized).toBe(false);
  });

  it("rescales out-of-range inputs", () => {
    const r = normalizeWeighting({ vendor: 2, independent: 0 });
    expect(r.weighting.vendor).toBeCloseTo(1);
    expect(r.weighting.independent).toBeCloseTo(0);
    expect(r.normalized).toBe(true);
  });

  it("rescales 50/30 to 62.5/37.5", () => {
    const r = normalizeWeighting({ vendor: 50, independent: 30 });
    expect(r.weighting.vendor).toBeCloseTo(0.625);
    expect(r.weighting.independent).toBeCloseTo(0.375);
    expect(r.normalized).toBe(true);
  });

  it("both zero → default 50/50", () => {
    const r = normalizeWeighting({ vendor: 0, independent: 0 });
    expect(r.weighting).toEqual({ vendor: 0.5, independent: 0.5 });
    expect(r.normalized).toBe(true);
  });

  it("clamps negative inputs to zero", () => {
    const r = normalizeWeighting({ vendor: -0.5 as never, independent: 1 });
    expect(r.weighting.vendor).toBe(0);
    expect(r.weighting.independent).toBe(1);
  });

  it("round4 preserves sum=1 exactly after normalization", () => {
    const r = normalizeWeighting({ vendor: 1, independent: 2 });
    expect(r.weighting.vendor + r.weighting.independent).toBe(1);
  });
});
