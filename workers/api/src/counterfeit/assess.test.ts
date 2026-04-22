import { describe, expect, it } from "vitest";
import { assessCounterfeit } from "./assess.js";

describe("assessCounterfeit — positive cases (counterfeit-worthy)", () => {
  it("new seller + low feedback + bimodal + price-too-low → likely-counterfeit", () => {
    const r = assessCounterfeit({
      host: "amazon.com",
      sellerAgeDays: 42,
      feedbackCount: 8,
      feedbackDistribution: { star1: 3, star2: 0, star3: 0, star4: 0, star5: 10 },
      price: 99,
      category: "espresso machines",
    });
    expect(r.verdict).toBe("likely-counterfeit");
    expect(r.riskScore).toBeGreaterThanOrEqual(50);
    const ids = r.signals.map((s) => s.id);
    expect(ids).toContain("seller-age-too-new");
    expect(ids).toContain("feedback-volume-low");
    expect(ids).toContain("feedback-distribution-bimodal");
    expect(ids).toContain("price-too-low");
  });

  it("grey-market indicators bump risk", () => {
    const r = assessCounterfeit({
      host: "ebay.com",
      sellerAgeDays: 400,
      greyMarketIndicators: ["import-only", "no US warranty"],
    });
    expect(r.signals.some((s) => s.id === "grey-market-indicator")).toBe(true);
    expect(r.riskScore).toBe(20);
  });
});

describe("assessCounterfeit — negative cases (authentic)", () => {
  it("old established seller + natural feedback + plausible price → authentic", () => {
    const r = assessCounterfeit({
      host: "amazon.com",
      sellerAgeDays: 2000,
      feedbackCount: 50_000,
      feedbackDistribution: { star1: 2000, star2: 1000, star3: 2000, star4: 10000, star5: 35000 },
      price: 500,
      category: "espresso machines",
    });
    expect(r.verdict).toBe("authentic");
    expect(r.riskScore).toBe(0);
  });

  it("sparse signals → caution from insufficient-data bullet is fine", () => {
    const r = assessCounterfeit({ host: "ebay.com" });
    expect(r.signals).toHaveLength(1);
    expect(r.signals[0]!.id).toBe("insufficient-data");
  });
});

describe("assessCounterfeit — signal-by-signal", () => {
  it("seller-age 91-179 days → warn", () => {
    const r = assessCounterfeit({ host: "x.com", sellerAgeDays: 120 });
    expect(r.signals.find((s) => s.id === "seller-age-recent")?.verdict).toBe("warn");
  });

  it("authorizedRetailerClaim flag surfaces warn", () => {
    const r = assessCounterfeit({ host: "x.com", authorizedRetailerClaim: true });
    expect(r.signals.some((s) => s.id === "unauthorized-retailer-claim")).toBe(true);
  });

  it("price plausible → ok signal (no penalty)", () => {
    const r = assessCounterfeit({
      host: "x.com",
      price: 500,
      category: "espresso machines",
    });
    expect(r.signals.find((s) => s.id === "price-plausible")?.verdict).toBe("ok");
  });

  it("feedbackProfile surfaces the computed p1/p5", () => {
    const r = assessCounterfeit({
      host: "x.com",
      feedbackDistribution: { star1: 30, star2: 0, star3: 0, star4: 0, star5: 70 },
    });
    expect(r.feedbackProfile?.bimodal).toBe(true);
    expect(r.feedbackProfile?.p1).toBe(0.3);
    expect(r.feedbackProfile?.p5).toBe(0.7);
  });

  it("risk score clamps at 100", () => {
    const r = assessCounterfeit({
      host: "x.com",
      sellerAgeDays: 30,
      feedbackCount: 2,
      feedbackDistribution: { star1: 30, star2: 0, star3: 0, star4: 0, star5: 70 },
      price: 10,
      category: "espresso machines",
      authorizedRetailerClaim: true,
      greyMarketIndicators: ["no-warranty", "import-only", "international"],
    });
    expect(r.riskScore).toBeLessThanOrEqual(100);
    expect(r.verdict).toBe("likely-counterfeit");
  });

  it("verdict bands: < 20 authentic, 20-49 caution, ≥ 50 likely-counterfeit", () => {
    expect(
      assessCounterfeit({ host: "x", sellerAgeDays: 2000 }).verdict,
    ).toBe("authentic");
    expect(
      assessCounterfeit({
        host: "x",
        sellerAgeDays: 100, // warn +10
        feedbackCount: 5,    // warn +15
      }).verdict,
    ).toBe("caution");
    expect(
      assessCounterfeit({
        host: "x",
        sellerAgeDays: 42,   // fail +25
        price: 10,
        category: "laptops", // fail +30
      }).verdict,
    ).toBe("likely-counterfeit");
  });
});
