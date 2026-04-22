import { describe, expect, it } from "vitest";
import type { RerankCandidate } from "@lens/shared";
import { activeKeys, getValueSignals } from "./signals.js";

function cand(over: Partial<RerankCandidate>): RerankCandidate {
  return {
    id: "c1",
    name: "Widget",
    baseUtility: 0.5,
    ...over,
  };
}

describe("activeKeys", () => {
  it("returns only keys with weight > 0", () => {
    expect(
      activeKeys([
        { key: "b-corp", weight: 0.5 },
        { key: "union-made", weight: 0 },
      ]),
    ).toEqual(["b-corp"]);
  });
  it("de-duplicates repeated keys", () => {
    expect(
      activeKeys([
        { key: "b-corp", weight: 0.5 },
        { key: "b-corp", weight: 0.3 },
      ]),
    ).toEqual(["b-corp"]);
  });
});

describe("getValueSignals", () => {
  it("pack-supplied signals win over heuristics", () => {
    const c = cand({ brand: "Patagonia", valuesSignals: { "b-corp": 0.2 } });
    const signals = getValueSignals(c, ["b-corp"], [{ key: "b-corp", weight: 1 }]);
    expect(signals["b-corp"]).toBe(0.2);
  });

  it("b-corp brand allowlist returns 1", () => {
    const c = cand({ brand: "Patagonia" });
    const signals = getValueSignals(c, ["b-corp"], [{ key: "b-corp", weight: 1 }]);
    expect(signals["b-corp"]).toBe(1);
  });

  it("union-made brand returns 1", () => {
    const c = cand({ brand: "Vitamix" });
    const signals = getValueSignals(c, ["union-made"], [{ key: "union-made", weight: 1 }]);
    expect(signals["union-made"]).toBe(1);
  });

  it("country-of-origin exact match returns 1", () => {
    const c = cand({ countryOfOrigin: "US" });
    const signals = getValueSignals(
      c,
      ["country-of-origin"],
      [{ key: "country-of-origin", weight: 1, preference: "US" }],
    );
    expect(signals["country-of-origin"]).toBe(1);
  });

  it("country-of-origin mismatch returns -0.5", () => {
    const c = cand({ countryOfOrigin: "CN" });
    const signals = getValueSignals(
      c,
      ["country-of-origin"],
      [{ key: "country-of-origin", weight: 1, preference: "US" }],
    );
    expect(signals["country-of-origin"]).toBe(-0.5);
  });

  it("country-of-origin without preference returns 0", () => {
    const c = cand({ countryOfOrigin: "US" });
    const signals = getValueSignals(c, ["country-of-origin"], [{ key: "country-of-origin", weight: 1 }]);
    expect(signals["country-of-origin"]).toBe(0);
  });

  it("repairability maps [0,1] brand score to [-1,1]", () => {
    const apple = cand({ brand: "Apple" }); // 0.3 → -0.4
    const framework = cand({ brand: "Framework" }); // 0.9 → 0.8
    expect(getValueSignals(apple, ["repairability"], [{ key: "repairability", weight: 1 }])["repairability"]).toBeCloseTo(-0.4);
    expect(getValueSignals(framework, ["repairability"], [{ key: "repairability", weight: 1 }])["repairability"]).toBeCloseTo(0.8);
  });

  it("animal-welfare picks up vegan keyword in name", () => {
    const c = cand({ name: "Vegan leather laptop sleeve" });
    const signals = getValueSignals(c, ["animal-welfare"], [{ key: "animal-welfare", weight: 1 }]);
    expect(signals["animal-welfare"]).toBeGreaterThan(0);
  });

  it("returns 0 for unknown brand on every key", () => {
    const c = cand({ brand: "UnknownCo", countryOfOrigin: undefined });
    const signals = getValueSignals(
      c,
      ["b-corp", "union-made", "animal-welfare", "small-business"],
      [
        { key: "b-corp", weight: 1 },
        { key: "union-made", weight: 1 },
        { key: "animal-welfare", weight: 1 },
        { key: "small-business", weight: 1 },
      ],
    );
    for (const k of ["b-corp", "union-made", "animal-welfare", "small-business"] as const) {
      expect(signals[k]).toBe(0);
    }
  });
});
