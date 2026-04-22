import { describe, expect, it } from "vitest";
import { detectClaim } from "./detector.js";
import { windowFor } from "./windows.js";
import type { PurchaseLike } from "./types.js";

function purchase(over: Partial<PurchaseLike> = {}): PurchaseLike {
  return {
    id: "p1",
    userId: "u1",
    retailer: "Best Buy",
    productName: "MacBook Air M3",
    price: 1499,
    currency: "USD",
    purchasedAt: "2026-04-10",
    orderId: "BBY-111",
    ...over,
  };
}

const NOW = new Date("2026-04-20T12:00:00Z"); // 10 days after purchase

describe("detectClaim — positive path", () => {
  it("Best Buy within 15-day window + 6.7% drop", () => {
    const r = detectClaim({
      purchase: purchase(),
      currentPrice: 1399,
      now: NOW,
      window: windowFor("Best Buy"),
    });
    expect(r.claim).toBe(true);
    if (r.claim) {
      expect(r.delta).toBe(100);
      expect(r.deltaPct).toBeCloseTo(0.0667, 3);
      expect(r.windowDays).toBe(15);
      expect(r.expiresAt).toBe("2026-04-25"); // 10+15 = Apr 25
    }
  });

  it("Target 14-day window on day 13", () => {
    // Purchase 2026-04-07, now 2026-04-20T12 → ~13.5 days, inside the 14-day window.
    const r = detectClaim({
      purchase: purchase({ retailer: "Target", purchasedAt: "2026-04-07" }),
      currentPrice: 1350,
      now: NOW,
      window: windowFor("Target"),
    });
    expect(r.claim).toBe(true);
  });

  it("Costco 30-day window", () => {
    const r = detectClaim({
      purchase: purchase({ retailer: "Costco", purchasedAt: "2026-04-01" }),
      currentPrice: 1250,
      now: NOW,
      window: windowFor("Costco"),
    });
    expect(r.claim).toBe(true);
    if (r.claim) expect(r.windowDays).toBe(30);
  });
});

describe("detectClaim — negative paths", () => {
  it("unknown retailer → 'retailer policy not known'", () => {
    const r = detectClaim({
      purchase: purchase({ retailer: "ObscureMart" }),
      currentPrice: 1300,
      now: NOW,
      window: windowFor("ObscureMart"),
    });
    expect(r.claim).toBe(false);
    if (!r.claim) expect(r.reason).toContain("not known");
  });

  it("Amazon → retired-policy message", () => {
    const r = detectClaim({
      purchase: purchase({ retailer: "Amazon" }),
      currentPrice: 1300,
      now: NOW,
      window: windowFor("Amazon"),
    });
    expect(r.claim).toBe(false);
    if (!r.claim) expect(r.reason).toContain("does not offer");
  });

  it("current price ≥ purchase price", () => {
    const r = detectClaim({
      purchase: purchase(),
      currentPrice: 1499,
      now: NOW,
      window: windowFor("Best Buy"),
    });
    expect(r.claim).toBe(false);
    if (!r.claim) expect(r.reason).toContain("at or above");
  });

  it("drop too small absolute (< $1)", () => {
    const r = detectClaim({
      purchase: purchase({ price: 100 }),
      currentPrice: 99.5,
      now: NOW,
      window: windowFor("Best Buy"),
    });
    expect(r.claim).toBe(false);
    if (!r.claim) expect(r.reason).toContain("too small");
  });

  it("drop below 2% relative threshold", () => {
    const r = detectClaim({
      purchase: purchase({ price: 1000 }),
      currentPrice: 990, // 1% off
      now: NOW,
      window: windowFor("Best Buy"),
    });
    expect(r.claim).toBe(false);
    if (!r.claim) expect(r.reason).toContain("below 2%");
  });

  it("past window → explanatory reason with day count", () => {
    const r = detectClaim({
      purchase: purchase({ retailer: "Walmart", purchasedAt: "2026-04-01" }), // 19 days ago
      currentPrice: 1200,
      now: NOW,
      window: windowFor("Walmart"),
    });
    expect(r.claim).toBe(false);
    if (!r.claim) expect(r.reason).toContain("window");
  });

  it("missing original price", () => {
    const r = detectClaim({
      purchase: purchase({ price: null }),
      currentPrice: 1300,
      now: NOW,
      window: windowFor("Best Buy"),
    });
    expect(r.claim).toBe(false);
    if (!r.claim) expect(r.reason).toBe("original price unknown");
  });

  it("missing current price", () => {
    const r = detectClaim({
      purchase: purchase(),
      currentPrice: null,
      now: NOW,
      window: windowFor("Best Buy"),
    });
    expect(r.claim).toBe(false);
    if (!r.claim) expect(r.reason).toBe("current price unavailable");
  });

  it("purchase date in the future", () => {
    const r = detectClaim({
      purchase: purchase({ purchasedAt: "2026-05-01" }),
      currentPrice: 1200,
      now: NOW,
      window: windowFor("Best Buy"),
    });
    expect(r.claim).toBe(false);
    if (!r.claim) expect(r.reason).toContain("future");
  });

  it("malformed purchase date", () => {
    const r = detectClaim({
      purchase: purchase({ purchasedAt: "not-a-date" }),
      currentPrice: 1200,
      now: NOW,
      window: windowFor("Best Buy"),
    });
    expect(r.claim).toBe(false);
  });
});
