import { describe, expect, it } from "vitest";
import {
  B_CORP_BRANDS,
  USA_MADE_BRANDS,
  UNION_US_BRANDS,
  brandMatches,
  repairabilityFromBrand,
} from "./brands.js";

describe("brandMatches", () => {
  it("exact-matches a B-Corp entry", () => {
    expect(brandMatches("Patagonia", B_CORP_BRANDS)).toBe(true);
    expect(brandMatches("patagonia", B_CORP_BRANDS)).toBe(true);
  });
  it("substring-matches long brand names", () => {
    expect(brandMatches("Seventh Generation Inc", B_CORP_BRANDS)).toBe(true);
    expect(brandMatches("Dr. Bronner's All-One", B_CORP_BRANDS)).toBe(true);
  });
  it("returns false for undefined brand", () => {
    expect(brandMatches(undefined, B_CORP_BRANDS)).toBe(false);
  });
  it("returns false for non-member", () => {
    expect(brandMatches("RandomCorp", B_CORP_BRANDS)).toBe(false);
  });
  it("union US brands include UAW-identified automakers", () => {
    expect(brandMatches("Ford", UNION_US_BRANDS)).toBe(true);
    expect(brandMatches("Jeep", UNION_US_BRANDS)).toBe(true);
  });
  it("USA-made is a superset of union-US", () => {
    for (const b of UNION_US_BRANDS) expect(USA_MADE_BRANDS.has(b)).toBe(true);
  });
});

describe("repairabilityFromBrand", () => {
  it("returns 0.95 for Fairphone", () => {
    expect(repairabilityFromBrand("Fairphone")).toBeGreaterThan(0.9);
  });
  it("returns 0.9 for Framework laptops", () => {
    expect(repairabilityFromBrand("Framework")).toBe(0.9);
  });
  it("returns 0.5 fallback for unknown", () => {
    expect(repairabilityFromBrand("SomeRandomBrand")).toBe(0.5);
  });
  it("matches substring for long brand labels", () => {
    expect(repairabilityFromBrand("Apple Inc.")).toBe(0.3);
    expect(repairabilityFromBrand("MacBook Pro by Apple")).toBe(0.25); // macbook more specific
  });
});
