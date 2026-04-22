import { describe, expect, it } from "vitest";
import {
  findCategoryPack,
  getDarkPatternsForPageType,
  getFeesForCategory,
  getRegulationsForJurisdiction,
  packStats,
  registry,
} from "./registry.js";

describe("pack registry", () => {
  it("contains all five pack types", () => {
    const stats = packStats();
    const byType = stats.byType as Record<string, number>;
    expect(byType.category).toBeGreaterThan(0);
    expect(byType.darkPattern).toBeGreaterThan(0);
    expect(byType.regulation).toBeGreaterThan(0);
    expect(byType.fee).toBeGreaterThan(0);
    expect(byType.intervention).toBeGreaterThan(0);
  });

  it("has ≥ 100 total packs", () => {
    const stats = packStats();
    expect(stats.totalPacks).toBeGreaterThanOrEqual(100);
  });

  it("indexes by slug", () => {
    expect(registry.bySlug.has("category/espresso-machines")).toBe(true);
    expect(registry.bySlug.has("dark-pattern/hidden-costs")).toBe(true);
  });
});

describe("findCategoryPack", () => {
  it("finds espresso-machines via exact alias", () => {
    const pack = findCategoryPack("espresso machine");
    expect(pack?.slug).toBe("category/espresso-machines");
  });

  it("finds via substring match", () => {
    const pack = findCategoryPack("an espresso machine for my kitchen");
    expect(pack?.slug).toBe("category/espresso-machines");
  });

  it("returns null for no match", () => {
    const pack = findCategoryPack("totally-bogus-category-xyz-9876");
    expect(pack).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(findCategoryPack("")).toBeNull();
  });

  it("lowercases input", () => {
    expect(findCategoryPack("LAPTOP")?.slug).toBe("category/laptops");
  });
});

describe("getRegulationsForJurisdiction", () => {
  it("filters to in-force only", () => {
    const regs = getRegulationsForJurisdiction("us-federal");
    for (const r of regs) {
      expect(r.body.status).toBe("in-force");
    }
  });

  it("excludes vacated rules", () => {
    const regs = getRegulationsForJurisdiction("us-federal");
    expect(regs.every((r) => r.body.status !== "vacated")).toBe(true);
  });

  it("returns empty array for unknown jurisdiction", () => {
    expect(getRegulationsForJurisdiction("mars-colony")).toEqual([]);
  });
});

describe("getDarkPatternsForPageType", () => {
  it("returns packs applicable to checkout", () => {
    const packs = getDarkPatternsForPageType("checkout");
    expect(packs.length).toBeGreaterThan(0);
    for (const p of packs) {
      expect(p.type).toBe("dark-pattern");
    }
  });

  it("for unknown page type, returns only globally-applicable patterns", () => {
    const packs = getDarkPatternsForPageType("zxcvbnm-unknown");
    // All returned packs must have "any" in their applicable page-type set.
    for (const p of packs) {
      expect(p.applicability.pageTypes).toContain("any");
    }
  });
});

describe("getFeesForCategory", () => {
  it("returns fees for a known category context", () => {
    const fees = getFeesForCategory("hotels");
    expect(fees.length).toBeGreaterThan(0);
  });

  it("includes generic * fees for any category", () => {
    const fees = getFeesForCategory("any-category-slug");
    for (const f of fees) {
      expect(f.type).toBe("fee");
    }
  });
});
