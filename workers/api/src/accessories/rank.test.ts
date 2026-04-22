import { describe, expect, it } from "vitest";
import { rankAccessories } from "./rank.js";
import { ACCESSORY_CATALOG } from "./fixtures.js";

const ESPRESSO = ACCESSORY_CATALOG["espresso-machines"]!;

describe("rankAccessories", () => {
  it("returns empty array on empty input", () => {
    expect(rankAccessories([])).toEqual([]);
  });

  it("uses default criteria when none supplied (quality/price/longevity)", () => {
    const ranked = rankAccessories(ESPRESSO);
    expect(ranked).toHaveLength(ESPRESSO.length);
    for (const r of ranked) {
      expect(Number.isFinite(r.utility)).toBe(true);
      expect(Object.keys(r.contributions).length).toBeGreaterThan(0);
    }
  });

  it("orders by utility descending", () => {
    const ranked = rankAccessories(ESPRESSO);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1]!.utility).toBeGreaterThanOrEqual(ranked[i]!.utility);
    }
  });

  it("quality-heavy criteria promote the higher-quality accessory", () => {
    const qualityOrder = rankAccessories(ESPRESSO, { quality: 1 });
    const priceOrder = rankAccessories(ESPRESSO, { price: 1 });
    // At least one accessory should swap positions between the two weightings.
    const qualityTop = qualityOrder[0]!.accessory.name;
    const priceTop = priceOrder[0]!.accessory.name;
    // The quality-optimal is the Rattleware milk pitcher (quality 0.90).
    // The price-optimal is the IKAPE silicone mat (price_score 0.95).
    expect(qualityTop).not.toBe(priceTop);
  });

  it("contributions sum approximately to utility (weights × normalized scores)", () => {
    const ranked = rankAccessories(ESPRESSO, { quality: 0.5, price: 0.3, longevity: 0.2 });
    for (const r of ranked) {
      const sumContribs = Object.values(r.contributions).reduce((a, b) => a + b, 0);
      expect(Math.abs(sumContribs - r.utility)).toBeLessThan(0.01);
    }
  });

  it("normalizes zero-sum criteria to the default", () => {
    const ranked = rankAccessories(ESPRESSO, { bogus: 0 });
    expect(ranked).toHaveLength(ESPRESSO.length);
    // Should match default-criteria output ordering.
    const def = rankAccessories(ESPRESSO);
    expect(ranked.map((r) => r.accessory.name)).toEqual(def.map((r) => r.accessory.name));
  });

  it("ignores unknown criteria without throwing", () => {
    const ranked = rankAccessories(ESPRESSO, { price: 0.5, unknown_criterion: 0.5 });
    expect(ranked).toHaveLength(ESPRESSO.length);
  });

  it("handles single-element input (no min/max range)", () => {
    const single = [ESPRESSO[0]!];
    const ranked = rankAccessories(single);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.utility).toBeGreaterThanOrEqual(0);
  });
});
