import { describe, expect, it } from "vitest";
import { draftClaim } from "./claim-drafter.js";
import type { ClaimDecision, PurchaseLike } from "./types.js";

const pur: PurchaseLike = {
  id: "p1",
  userId: "u",
  retailer: "Best Buy",
  productName: "MacBook Air M3",
  price: 1499,
  purchasedAt: "2026-04-10",
  orderId: "BBY-111",
};
const decision: Extract<ClaimDecision, { claim: true }> = {
  claim: true,
  delta: 100,
  deltaPct: 0.0667,
  windowDays: 15,
  expiresAt: "2026-04-25",
  originalPrice: 1499,
  currentPrice: 1399,
};

describe("draftClaim", () => {
  it("includes business + product + prices + delta + dates in the letter", () => {
    const d = draftClaim({ purchase: pur, decision });
    expect(d.businessName).toBe("Best Buy");
    expect(d.originalPrice).toBe(1499);
    expect(d.currentPrice).toBe(1399);
    expect(d.priceDelta).toBe(100);
    expect(d.purchaseDate).toBe("2026-04-10");
    expect(d.productName).toBe("MacBook Air M3");
    expect(d.orderId).toBe("BBY-111");
    expect(d.expiresAt).toBe("2026-04-25");
    expect(d.claimLetter).toContain("MacBook Air M3");
    expect(d.claimLetter).toContain("Best Buy");
    expect(d.claimLetter).toContain("$1499.00");
    expect(d.claimLetter).toContain("$1399.00");
    expect(d.claimLetter).toContain("$100.00");
    expect(d.claimLetter).toContain("15-day");
  });

  it("populates portal URL from windows table when available", () => {
    const d = draftClaim({ purchase: pur, decision });
    expect(d.contactUrls.portal).toBeTruthy();
    expect(d.contactUrls.portal).toContain("bestbuy.com");
  });

  it("omits orderId in the payload when absent", () => {
    const d = draftClaim({
      purchase: { ...pur, orderId: null },
      decision,
    });
    expect(d.orderId).toBeUndefined();
    expect(d.claimLetter).toContain("(order ID)");
  });

  it("falls back to retailer string when unknown", () => {
    const d = draftClaim({
      purchase: { ...pur, retailer: "ObscureMart" },
      decision,
    });
    expect(d.businessName).toBe("ObscureMart");
    expect(d.contactUrls.portal).toBeUndefined();
  });
});
