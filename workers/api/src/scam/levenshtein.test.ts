import { describe, expect, it } from "vitest";
import { findNearestBrand, levenshtein } from "./levenshtein.js";

describe("levenshtein", () => {
  it("identical strings → 0", () => {
    expect(levenshtein("target", "target")).toBe(0);
  });
  it("single substitution → 1", () => {
    expect(levenshtein("target", "targez")).toBe(1);
  });
  it("single deletion → 1", () => {
    expect(levenshtein("target", "targt")).toBe(1);
  });
  it("single insertion → 1", () => {
    expect(levenshtein("target", "targets")).toBe(1);
  });
  it("case-insensitive", () => {
    expect(levenshtein("Target", "target")).toBe(0);
  });
  it("empty string handling", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
    expect(levenshtein("", "")).toBe(0);
  });
  it("classic kitten → sitting = 3", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });
});

describe("findNearestBrand", () => {
  const brands = ["amazon", "target", "walmart", "bestbuy"];

  it("exact match returns null (not a typosquat)", () => {
    expect(findNearestBrand("target", brands)).toBeNull();
  });
  it("single-edit typosquat", () => {
    const m = findNearestBrand("targer", brands);
    expect(m?.brand).toBe("target");
    expect(m?.distance).toBe(1);
  });
  it("two-edit typosquat", () => {
    const m = findNearestBrand("amaz0n", brands);
    expect(m?.brand).toBe("amazon");
    expect(m?.distance).toBe(1);
  });
  it("distant name → nearest match with larger distance", () => {
    const m = findNearestBrand("obscure-shop", brands);
    expect(m).not.toBeNull();
    expect(m!.distance).toBeGreaterThan(4);
  });
});
