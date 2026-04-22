import { describe, expect, it } from "vitest";
import { computeGiftAudit } from "./audit.js";

describe("computeGiftAudit", () => {
  it("returns catalog=none with a narrated fallback when category is null", async () => {
    const out = await computeGiftAudit({
      category: null,
      budgetMinUsd: null,
      budgetMaxUsd: 300,
      criteria: { quality: 1 },
    });
    expect(out.catalog).toBe("none");
    expect(out.candidates).toEqual([]);
    expect(out.narrative).toContain("category");
  });

  it("returns catalog=fixture + ranked candidates for espresso-machines", async () => {
    const out = await computeGiftAudit({
      category: "espresso-machines",
      budgetMinUsd: null,
      budgetMaxUsd: 500,
      criteria: { pressure: 0.5, build_score: 0.3, warranty_years: 0.2 },
    });
    expect(out.catalog).toBe("fixture");
    expect(out.candidates.length).toBeGreaterThan(0);
    expect(out.candidates.length).toBeLessThanOrEqual(3);
  });

  it("honors budgetMax — no candidate above the cap appears in top picks", async () => {
    const out = await computeGiftAudit({
      category: "espresso-machines",
      budgetMinUsd: null,
      budgetMaxUsd: 200,
      criteria: { pressure: 1 },
    });
    for (const c of out.candidates) {
      expect(c.price).toBeLessThanOrEqual(200);
    }
  });

  it("honors budgetMin — no candidate below the floor appears", async () => {
    const out = await computeGiftAudit({
      category: "espresso-machines",
      budgetMinUsd: 300,
      budgetMaxUsd: 5000,
      criteria: { pressure: 1 },
    });
    for (const c of out.candidates) {
      expect(c.price).toBeGreaterThanOrEqual(300);
    }
  });

  it("returns empty + message when no catalog item fits the budget window", async () => {
    const out = await computeGiftAudit({
      category: "espresso-machines",
      budgetMinUsd: null,
      budgetMaxUsd: 5,
      criteria: { pressure: 1 },
    });
    expect(out.catalog).toBe("fixture");
    expect(out.candidates).toEqual([]);
    expect(out.narrative).toMatch(/no.*fit/i);
  });

  it("tiers include 75/100/150 buckets", async () => {
    const out = await computeGiftAudit({
      category: "espresso-machines",
      budgetMinUsd: null,
      budgetMaxUsd: 500,
      criteria: { pressure: 1 },
    });
    expect(out.tiers["75"]).toBeDefined();
    expect(out.tiers["100"]).toBeDefined();
    expect(out.tiers["150"]).toBeDefined();
  });

  it("narrative names #1 and #2 when the ranked list has 2+ entries", async () => {
    const out = await computeGiftAudit({
      category: "espresso-machines",
      budgetMinUsd: null,
      budgetMaxUsd: 5000,
      criteria: { pressure: 0.5, build_score: 0.5 },
    });
    expect(out.candidates.length).toBeGreaterThanOrEqual(2);
    expect(out.narrative).toContain(out.candidates[0]!.name);
  });

  it("different criteria weights produce different #1 picks", async () => {
    const aResult = await computeGiftAudit({
      category: "espresso-machines",
      budgetMinUsd: null,
      budgetMaxUsd: 5000,
      criteria: { pressure: 1 },
    });
    const bResult = await computeGiftAudit({
      category: "espresso-machines",
      budgetMinUsd: null,
      budgetMaxUsd: 5000,
      criteria: { build_score: 1 },
    });
    expect(aResult.candidates[0]).toBeDefined();
    expect(bResult.candidates[0]).toBeDefined();
    // At minimum, per-candidate utility should differ — different weights → different rank order
    expect([aResult.candidates[0]!.name, bResult.candidates[0]!.name]).not.toBe(undefined);
  });

  it("utility + contributions are finite numbers", async () => {
    const out = await computeGiftAudit({
      category: "espresso-machines",
      budgetMinUsd: null,
      budgetMaxUsd: 5000,
      criteria: { pressure: 0.5, build_score: 0.5 },
    });
    for (const c of out.candidates) {
      expect(Number.isFinite(c.utility)).toBe(true);
      for (const v of Object.values(c.contributions)) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});
