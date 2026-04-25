import { describe, expect, it } from "vitest";
import { CustomerJourneyMapSchema } from "@lens/shared";
import { buildCustomerJourneyMap } from "./map.js";

describe("buildCustomerJourneyMap", () => {
  it("builds the seven-stage consumer journey contract", () => {
    const map = buildCustomerJourneyMap({
      generatedAt: "2026-04-25T00:00:00.000Z",
      workflowIds: ["recall.watch", "price.poll", "firmware.watch", "digest.send", "gmail.poll"],
      totalPacks: 106,
      sourceCount: 27,
    });

    expect(CustomerJourneyMapSchema.safeParse(map).success).toBe(true);
    expect(map.stages.map((s) => s.id)).toEqual([
      "pre_search",
      "ai_research",
      "product_page",
      "cart_checkout",
      "post_purchase",
      "ownership",
      "end_of_life",
    ]);
    expect(map.readiness).toEqual({ live: 5, partial: 2, planned: 0, total: 7, score: 0.857 });
  });

  it("anchors product-page and checkout coverage to real public endpoints", () => {
    const map = buildCustomerJourneyMap();
    const productPage = map.stages.find((s) => s.id === "product_page")!;
    const checkout = map.stages.find((s) => s.id === "cart_checkout")!;

    expect(productPage.endpoints).toContain("/resolve-url");
    expect(productPage.endpoints).toContain("/counterfeit/check");
    expect(productPage.edgeCasesCovered).toContain("Amazon URL with affiliate/ref tracking parameters");
    expect(checkout.endpoints).toContain("/checkout/summary");
    expect(checkout.failureRecovery).toContain("require multiple signals before interrupting");
  });

  it("keeps sensitive post-purchase data behind explicit consent controls", () => {
    const map = buildCustomerJourneyMap();
    const postPurchase = map.stages.find((s) => s.id === "post_purchase")!;

    expect(postPurchase.consentTier).toBe("oauth_sensitive");
    expect(postPurchase.userControls).toContain("connect or revoke Gmail");
    expect(postPurchase.nextHardening.join(" ")).toContain("Plaid");
    expect(map.privacyControls.join(" ")).toContain("Plaid-style financial signals");
  });

  it("gives every stage edge cases and recovery states", () => {
    const map = buildCustomerJourneyMap();
    for (const stage of map.stages) {
      expect(stage.edgeCasesCovered.length).toBeGreaterThanOrEqual(6);
      expect(stage.failureRecovery.length).toBeGreaterThanOrEqual(4);
      expect(stage.userControls.length).toBeGreaterThanOrEqual(4);
    }
  });
});
