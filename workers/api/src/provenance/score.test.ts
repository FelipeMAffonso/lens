import { describe, expect, it } from "vitest";
import { computeProvenanceScore } from "./score.js";

describe("computeProvenanceScore", () => {
  it("exact match + no affiliates + fetched → 0.6", () => {
    expect(
      computeProvenanceScore({
        fetched: true,
        claimFoundVia: "exact",
        affiliateIndicators: [],
      }),
    ).toBe(0.6);
  });

  it("normalized match + one affiliate → 0.6 - 0.2 = 0.4", () => {
    expect(
      computeProvenanceScore({
        fetched: true,
        claimFoundVia: "normalized",
        affiliateIndicators: [{ kind: "amazon-tag", detail: "x" }],
      }),
    ).toBeCloseTo(0.4);
  });

  it("partial-sentence + two affiliates → 0.3 - 0.4 = 0 (floor)", () => {
    expect(
      computeProvenanceScore({
        fetched: true,
        claimFoundVia: "partial-sentence",
        affiliateIndicators: [
          { kind: "amazon-tag", detail: "x" },
          { kind: "rel-sponsored", detail: "y" },
        ],
      }),
    ).toBeCloseTo(0);
  });

  it("exact + three affiliates (capped at -0.4) → 0.6 - 0.4 = 0.2", () => {
    expect(
      computeProvenanceScore({
        fetched: true,
        claimFoundVia: "exact",
        affiliateIndicators: [
          { kind: "amazon-tag", detail: "x" },
          { kind: "rel-sponsored", detail: "y" },
          { kind: "share-a-sale", detail: "z" },
        ],
      }),
    ).toBeCloseTo(0.2);
  });

  it("not fetched → 0 floor", () => {
    expect(
      computeProvenanceScore({
        fetched: false,
        claimFoundVia: "none",
        affiliateIndicators: [],
      }),
    ).toBe(0);
  });

  it("found=none + fetched + no affiliates → 0", () => {
    expect(
      computeProvenanceScore({
        fetched: true,
        claimFoundVia: "none",
        affiliateIndicators: [],
      }),
    ).toBe(0);
  });
});
