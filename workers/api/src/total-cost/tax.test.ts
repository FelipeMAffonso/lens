import { describe, expect, it } from "vitest";
import { lookupStateRate, resolveTax } from "./tax.js";

describe("lookupStateRate", () => {
  it("returns CA baseline", () => {
    expect(lookupStateRate("CA")?.rate).toBe(0.0725);
  });
  it("returns null for unknown code", () => {
    expect(lookupStateRate("ZZ")).toBeNull();
  });
  it("tags zero-sales-tax states", () => {
    expect(lookupStateRate("OR")?.rate).toBe(0);
    expect(lookupStateRate("NH")?.note).toContain("no state sales tax");
  });
});

describe("resolveTax", () => {
  it("maps a CA ZIP (941xx) to CA via zip source", () => {
    const r = resolveTax({ zip: "94110", country: "US" });
    expect(r.jurisdiction).toBe("CA");
    expect(r.rate).toBe(0.0725);
    expect(r.source).toBe("zip");
  });

  it("maps a NY ZIP (100xx) to NY", () => {
    const r = resolveTax({ zip: "10001", country: "US" });
    expect(r.jurisdiction).toBe("NY");
    expect(r.rate).toBe(0.04);
  });

  it("maps a TX ZIP (750xx) to TX", () => {
    const r = resolveTax({ zip: "75001", country: "US" });
    expect(r.jurisdiction).toBe("TX");
    expect(r.rate).toBe(0.0625);
  });

  it("US without ZIP returns fallback median ~6%", () => {
    const r = resolveTax({ country: "US" });
    expect(r.source).toBe("fallback");
    expect(r.rate).toBe(0.06);
  });

  it("non-US country returns 0% with a note", () => {
    const r = resolveTax({ country: "UK" });
    expect(r.rate).toBe(0);
    expect(r.source).toBe("country");
    expect(r.note).toContain("VAT");
  });

  it("Oregon ZIP (97xxx) returns 0% state", () => {
    const r = resolveTax({ zip: "97201", country: "US" });
    expect(r.jurisdiction).toBe("OR");
    expect(r.rate).toBe(0);
  });
});
