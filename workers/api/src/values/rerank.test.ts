import { describe, expect, it } from "vitest";
import type { RerankCandidate, ValuesOverlay } from "@lens/shared";
import { applyOverlay } from "./rerank.js";

const base: RerankCandidate[] = [
  { id: "a", name: "Acme Widget", brand: "UnknownCo", baseUtility: 0.8 },
  { id: "b", name: "Patagonia Organic Cotton Tee", brand: "Patagonia", baseUtility: 0.7 },
  { id: "c", name: "Vitamix A2500", brand: "Vitamix", baseUtility: 0.75 },
];

describe("applyOverlay", () => {
  it("empty overlay is identity (stable order)", () => {
    const r = applyOverlay(base, []);
    expect(r.overlayActive).toBe(false);
    expect(r.ranked.map((e) => e.id)).toEqual(["a", "c", "b"]); // DESC base
    for (const e of r.ranked) expect(e.finalUtility).toBe(e.baseUtility);
  });

  it("b-corp overlay promotes Patagonia above Acme", () => {
    const overlay: ValuesOverlay = [{ key: "b-corp", weight: 0.3 }];
    const r = applyOverlay(base, overlay);
    const firstId = r.ranked[0]!.id;
    // Patagonia gets +0.3 (1 signal * 0.3 weight), ending at ~1.0 > Acme 0.8.
    expect(firstId).toBe("b");
    expect(r.ranked[0]!.finalUtility).toBeCloseTo(1.0);
  });

  it("union-made overlay promotes Vitamix above Acme", () => {
    const overlay: ValuesOverlay = [{ key: "union-made", weight: 0.4 }];
    const r = applyOverlay(base, overlay);
    expect(r.ranked[0]!.id).toBe("c"); // 0.75 + 0.4 = 1.15
  });

  it("emits per-candidate contributions list", () => {
    const overlay: ValuesOverlay = [{ key: "b-corp", weight: 0.3 }];
    const r = applyOverlay(base, overlay);
    const pata = r.ranked.find((x) => x.id === "b")!;
    expect(pata.contributions).toEqual([
      { key: "b-corp", weight: 0.3, signal: 1, contribution: 0.3 },
    ]);
  });

  it("weight=0 overlay entries are omitted from contributions", () => {
    const overlay: ValuesOverlay = [
      { key: "b-corp", weight: 0 },
      { key: "union-made", weight: 0.5 },
    ];
    const r = applyOverlay(base, overlay);
    // Only union-made is active.
    expect(r.keysUsed).toEqual(["union-made"]);
    for (const entry of r.ranked) {
      expect(entry.contributions.every((x) => x.key !== "b-corp")).toBe(true);
    }
  });

  it("composes multiple overlay keys additively", () => {
    const overlay: ValuesOverlay = [
      { key: "b-corp", weight: 0.2 },
      { key: "union-made", weight: 0.2 },
    ];
    const r = applyOverlay(base, overlay);
    const acme = r.ranked.find((x) => x.id === "a")!;
    expect(acme.contributions.reduce((s, c) => s + c.contribution, 0)).toBe(0);
    const pata = r.ranked.find((x) => x.id === "b")!;
    expect(pata.finalUtility).toBeCloseTo(0.7 + 0.2);
  });

  it("rounds utilities to 4 decimal places", () => {
    const overlay: ValuesOverlay = [{ key: "repairability", weight: 0.3 }];
    const r = applyOverlay([{ id: "x", name: "MacBook", brand: "Apple", baseUtility: 0.123_456_789 }], overlay);
    expect(r.ranked[0]!.baseUtility).toBe(0.1235);
    // Apple → repairability -0.4 * 0.3 = -0.12 → final ≈ 0.0035
    expect(r.ranked[0]!.finalUtility).toBeCloseTo(0.0035, 3);
  });

  it("preserves stable order on exact finalUtility ties", () => {
    const ties: RerankCandidate[] = [
      { id: "x", name: "X", baseUtility: 0.5 },
      { id: "y", name: "Y", baseUtility: 0.5 },
      { id: "z", name: "Z", baseUtility: 0.5 },
    ];
    const r = applyOverlay(ties, []);
    expect(r.ranked.map((e) => e.id)).toEqual(["x", "y", "z"]);
  });

  it("country-of-origin with preference boosts matching candidate", () => {
    const overlay: ValuesOverlay = [{ key: "country-of-origin", weight: 0.5, preference: "US" }];
    const cands: RerankCandidate[] = [
      { id: "jp", name: "Tokyo-made", brand: "Sony", countryOfOrigin: "JP", baseUtility: 0.6 },
      { id: "us", name: "Made in USA", brand: "Vitamix", countryOfOrigin: "US", baseUtility: 0.55 },
    ];
    const r = applyOverlay(cands, overlay);
    expect(r.ranked[0]!.id).toBe("us"); // 0.55 + 1*0.5 = 1.05 vs 0.6 - 0.25 = 0.35
  });
});
