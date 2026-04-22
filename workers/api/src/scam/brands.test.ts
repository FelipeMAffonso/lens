import { describe, expect, it } from "vitest";
import { MAJOR_BRANDS, VERIFIED_RETAILERS, apexLabel, canonicalHost } from "./brands.js";

describe("brand allowlists", () => {
  it("MAJOR_BRANDS has ≥ 30 entries", () => {
    expect(MAJOR_BRANDS.length).toBeGreaterThanOrEqual(30);
  });
  it("VERIFIED_RETAILERS has ≥ 30 entries", () => {
    expect(VERIFIED_RETAILERS.size).toBeGreaterThanOrEqual(30);
  });
  it("amazon, walmart, target in both lists", () => {
    for (const b of ["amazon", "walmart", "target"]) {
      expect(MAJOR_BRANDS).toContain(b);
    }
    for (const d of ["amazon.com", "walmart.com", "target.com"]) {
      expect(VERIFIED_RETAILERS.has(d)).toBe(true);
    }
  });
});

describe("canonicalHost", () => {
  it("strips www + lowercases", () => {
    expect(canonicalHost("WWW.Amazon.COM")).toBe("amazon.com");
  });
});

describe("apexLabel", () => {
  it("two-part domain → first label", () => {
    expect(apexLabel("target.com")).toBe("target");
  });
  it("three-part subdomain → second-to-last", () => {
    expect(apexLabel("shop.target.com")).toBe("target");
  });
  it("handles www. prefix via canonicalHost", () => {
    expect(apexLabel("www.best-buy-deals.example.com")).toBe("example");
  });
});
