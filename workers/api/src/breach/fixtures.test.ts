import { describe, expect, it } from "vitest";
import { BREACH_FIXTURES, breachesForHost, canonicalHost } from "./fixtures.js";

describe("breach fixtures", () => {
  it("includes at least 15 entries", () => {
    expect(BREACH_FIXTURES.length).toBeGreaterThanOrEqual(15);
  });
  it("every record has id + date + dataTypes + severity + source", () => {
    for (const b of BREACH_FIXTURES) {
      expect(b.id).toBeTruthy();
      expect(b.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(b.dataTypes.length).toBeGreaterThan(0);
      expect(["low", "moderate", "high", "critical"]).toContain(b.severity);
      expect(b.source).toBe("fixture");
    }
  });
  it("ids are unique", () => {
    const ids = BREACH_FIXTURES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("canonicalHost", () => {
  it("strips www + lowercases", () => {
    expect(canonicalHost("WWW.Target.COM")).toBe("target.com");
    expect(canonicalHost("shop.example.com")).toBe("shop.example.com");
  });
});

describe("breachesForHost", () => {
  it("finds Target 2013", () => {
    const r = breachesForHost("target.com");
    expect(r.some((b) => b.id === "target-2013")).toBe(true);
  });
  it("handles www prefix", () => {
    expect(breachesForHost("www.target.com").length).toBeGreaterThan(0);
  });
  it("returns [] for unknown host", () => {
    expect(breachesForHost("no-breach-example.test")).toEqual([]);
  });
  it("returns both T-Mobile breaches", () => {
    const r = breachesForHost("t-mobile.com");
    expect(r).toHaveLength(2);
  });
});
