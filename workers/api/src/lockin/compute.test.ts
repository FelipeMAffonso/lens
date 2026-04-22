import { describe, expect, it } from "vitest";
import { computeLockin, exitFrictionFor, purchaseMatchesEcosystem } from "./compute.js";
import { ECOSYSTEM_FIXTURES } from "./fixtures.js";

describe("exitFrictionFor", () => {
  it("maps multiplier bands to friction", () => {
    expect(exitFrictionFor(2.1)).toBe("critical");
    expect(exitFrictionFor(1.7)).toBe("critical");
    expect(exitFrictionFor(1.4)).toBe("high");
    expect(exitFrictionFor(1.2)).toBe("medium");
    expect(exitFrictionFor(1.0)).toBe("low");
    expect(exitFrictionFor(0.5)).toBe("low");
  });
});

describe("purchaseMatchesEcosystem", () => {
  it("matches Apple iPhone by brand + productToken", () => {
    const apple = ECOSYSTEM_FIXTURES.find((f) => f.slug === "apple")!;
    expect(purchaseMatchesEcosystem({ productName: "iPhone 15 Pro", brand: "Apple", amountUsd: 999 }, apple)).toBe(true);
  });

  it("matches HP Instant Ink by productToken even without brand", () => {
    const hp = ECOSYSTEM_FIXTURES.find((f) => f.slug === "hp-instant-ink")!;
    expect(purchaseMatchesEcosystem({ productName: "HP OfficeJet Pro 9015e", amountUsd: 249 }, hp)).toBe(true);
  });

  it("does not match unrelated products", () => {
    const apple = ECOSYSTEM_FIXTURES.find((f) => f.slug === "apple")!;
    expect(purchaseMatchesEcosystem({ productName: "Gaggia Classic Evo", brand: "Gaggia", amountUsd: 449 }, apple)).toBe(false);
  });

  it("rejects tokens shorter than 3 chars", () => {
    for (const fx of ECOSYSTEM_FIXTURES) {
      for (const t of fx.matchers.productTokens ?? []) {
        expect(t.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("matches by category when brand/productToken miss", () => {
    const apple = ECOSYSTEM_FIXTURES.find((f) => f.slug === "apple")!;
    // category "smartphone" hits Apple's categoryTokens
    expect(purchaseMatchesEcosystem({ productName: "Some Phone", category: "smartphone", amountUsd: 800 }, apple)).toBe(true);
  });

  it("(judge P0-2) brand alone is not enough — 'Apple juice' must not match Apple ecosystem", () => {
    const apple = ECOSYSTEM_FIXTURES.find((f) => f.slug === "apple")!;
    const p = { productName: "Apple juice Costco 16oz", brand: "Apple", amountUsd: 12 };
    expect(purchaseMatchesEcosystem(p, apple)).toBe(false);
  });

  it("Apple Music subscription matches apple (token), not ios-app-store", () => {
    const apple = ECOSYSTEM_FIXTURES.find((f) => f.slug === "apple")!;
    const ios = ECOSYSTEM_FIXTURES.find((f) => f.slug === "ios-app-store")!;
    const p = { productName: "Apple Music subscription", brand: "Apple", amountUsd: 109 };
    expect(purchaseMatchesEcosystem(p, apple)).toBe(true);
    expect(purchaseMatchesEcosystem(p, ios)).toBe(false);
  });
});

describe("computeLockin", () => {
  it("returns empty + reason on no purchases", () => {
    const r = computeLockin([]);
    expect(r.ecosystems).toHaveLength(0);
    expect(r.totalGross).toBe(0);
    expect(r.totalSwitchingCost).toBe(0);
    expect(r.reason).toBeTruthy();
  });

  it("computes apple ecosystem totals + switching cost", () => {
    const r = computeLockin([
      { productName: "iPhone 15 Pro", brand: "Apple", amountUsd: 999 },
      { productName: "AirPods Pro 2", brand: "Apple", amountUsd: 249 },
    ]);
    const apple = r.ecosystems.find((e) => e.slug === "apple");
    expect(apple).toBeDefined();
    expect(apple!.matchedPurchases).toBe(2);
    expect(apple!.gross).toBe(1248);
    // multiplier 1.8 → 1248 * 1.8 = 2246.4
    expect(apple!.estimatedSwitchingCost).toBeCloseTo(2246.4, 1);
    expect(apple!.exitFriction).toBe("critical");
  });

  it("surfaces HP Instant Ink as critical friction (multiplier 2.1)", () => {
    const r = computeLockin([
      { productName: "HP OfficeJet Pro 9015e", brand: "HP", amountUsd: 249 },
      { productName: "HP Instant Ink subscription", brand: "HP", amountUsd: 120 },
    ]);
    const hp = r.ecosystems.find((e) => e.slug === "hp-instant-ink");
    expect(hp).toBeDefined();
    expect(hp!.exitFriction).toBe("critical");
    expect(hp!.gross).toBe(369);
  });

  it("sorts ecosystems by switching cost descending", () => {
    const r = computeLockin([
      { productName: "Kindle Paperwhite", brand: "Amazon", amountUsd: 150 },
      { productName: "iPhone 15 Pro", brand: "Apple", amountUsd: 999 },
      { productName: "Roku", amountUsd: 50 }, // no ecosystem match
    ]);
    for (let i = 1; i < r.ecosystems.length; i++) {
      expect(r.ecosystems[i - 1]!.estimatedSwitchingCost).toBeGreaterThanOrEqual(
        r.ecosystems[i]!.estimatedSwitchingCost,
      );
    }
  });

  it("(judge P0-1) totalGross de-duplicates a purchase that matches multiple ecosystems", () => {
    // Tesla Model Y productName matches both `tesla` and `tesla-fsd` tokens.
    // totalGross must count the $48990 ONCE, not twice.
    const r = computeLockin([
      { productName: "Tesla Model Y with Full Self-Driving", brand: "Tesla", amountUsd: 48990 },
    ]);
    expect(r.totalGross).toBeCloseTo(48990, 1);
    expect(r.ecosystems.length).toBeGreaterThanOrEqual(2);
  });

  it("totalGross sums cleanly across independent ecosystem spend", () => {
    const r = computeLockin([
      { productName: "iPhone 15 Pro", brand: "Apple", amountUsd: 999 },
      { productName: "Peloton Bike+", brand: "Peloton", amountUsd: 2495 },
    ]);
    expect(r.totalGross).toBeCloseTo(999 + 2495, 1);
  });

  it("one purchase can match multiple ecosystems when tokens span both", () => {
    // Tesla Model Y with FSD: matches both `tesla` (model y token) and `tesla-fsd` (full self-driving token).
    const r = computeLockin([
      { productName: "Tesla Model Y with Full Self-Driving", brand: "Tesla", amountUsd: 48990 },
    ]);
    const slugs = r.ecosystems.map((e) => e.slug);
    expect(slugs).toContain("tesla");
    expect(slugs).toContain("tesla-fsd");
  });

  it("ignores non-finite amounts", () => {
    const r = computeLockin([
      { productName: "iPhone 15 Pro", brand: "Apple", amountUsd: Number.NaN as number },
      { productName: "AirPods", brand: "Apple", amountUsd: 249 },
    ]);
    const apple = r.ecosystems.find((e) => e.slug === "apple")!;
    expect(apple.gross).toBe(249);
  });

  it("generates ISO timestamp", () => {
    const r = computeLockin([]);
    expect(r.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

describe("ECOSYSTEM_FIXTURES sanity", () => {
  it("has at least 20 entries", () => {
    expect(ECOSYSTEM_FIXTURES.length).toBeGreaterThanOrEqual(20);
  });

  it("every fixture has a slug + label + at least one citation", () => {
    for (const fx of ECOSYSTEM_FIXTURES) {
      expect(fx.slug).toMatch(/^[a-z0-9-]+$/);
      expect(fx.label.length).toBeGreaterThan(0);
      expect(fx.citations.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("slugs are unique", () => {
    const slugs = ECOSYSTEM_FIXTURES.map((f) => f.slug);
    const unique = new Set(slugs);
    expect(unique.size).toBe(slugs.length);
  });

  it("lockInMultiplier is in [0.5, 3.0]", () => {
    for (const fx of ECOSYSTEM_FIXTURES) {
      expect(fx.lockInMultiplier).toBeGreaterThanOrEqual(0.5);
      expect(fx.lockInMultiplier).toBeLessThanOrEqual(3.0);
    }
  });

  it("every fixture has at least one non-dollar lock-in description", () => {
    for (const fx of ECOSYSTEM_FIXTURES) {
      expect(fx.nonDollarLockIn.length).toBeGreaterThanOrEqual(1);
    }
  });
});
