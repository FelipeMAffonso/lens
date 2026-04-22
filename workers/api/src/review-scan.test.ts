import { describe, expect, it } from "vitest";
import { ReviewScanRequestSchema, scanReviews, type Review } from "./review-scan.js";

// Reviews that look authentic — varied length, varied phrasing, varied dates, mix of ratings.
const CLEAN_REVIEWS: Review[] = [
  {
    text: "I've had this espresso machine for about three months now and the 9-bar OPV setup finally gives me real espresso. Grinder matters more than pressure though — my Baratza Encore was the limiting factor until I upgraded.",
    date: "2025-11-02",
    rating: 4,
    reviewer: "A. Khan",
  },
  {
    text: "Honestly the plastic housing bothers me less than I expected. The stainless boiler holds heat well once it's warmed up. Steam wand takes practice.",
    date: "2025-12-20",
    rating: 4,
    reviewer: "M. Cruz",
  },
  {
    text: "Broke after 13 months. Warranty replacement went smoothly, give them credit for that. Second unit has been fine for 8 months so far.",
    date: "2026-02-11",
    rating: 3,
    reviewer: "Reviewer-2026",
  },
  {
    text: "For someone who wants a single-boiler machine under $400 with real espresso output this is fine, just tune your grind.",
    date: "2025-09-30",
    rating: 5,
    reviewer: "J. Wu",
  },
  {
    text: "Not loud. Setup took 15 minutes. I appreciated the included milk frother pitcher, small thing but nice.",
    date: "2026-01-15",
    rating: 4,
    reviewer: "S. Patel",
  },
];

// Reviews engineered to trip every heuristic — bursty, templated, 5-star, length-homogeneous.
const FAKE_REVIEWS: Review[] = [
  {
    text: "I love this product, highly recommend it, five stars, worth every penny!",
    date: "2026-04-01",
    rating: 5,
  },
  {
    text: "I love this product, highly recommend, exactly what I needed, five stars!",
    date: "2026-04-01",
    rating: 5,
  },
  {
    text: "I love this product and highly recommend it, exactly what I needed, great quality!",
    date: "2026-04-01",
    rating: 5,
  },
  {
    text: "I love this product and highly recommend it, exactly what I needed, worth every penny!",
    date: "2026-04-02",
    rating: 5,
  },
  {
    text: "I love this product, highly recommend, exactly what I needed, easy to use, game changer!",
    date: "2026-04-02",
    rating: 5,
  },
  {
    text: "I love this product. Highly recommend! Exactly what I needed. Arrived quickly. Perfect for me!",
    date: "2026-04-02",
    rating: 5,
  },
];

describe("ReviewScanRequestSchema", () => {
  it("accepts 2+ reviews", () => {
    const r = ReviewScanRequestSchema.safeParse({ reviews: CLEAN_REVIEWS });
    expect(r.success).toBe(true);
  });
  it("rejects empty list", () => {
    const r = ReviewScanRequestSchema.safeParse({ reviews: [] });
    expect(r.success).toBe(false);
  });
  it("rejects 1-review list (min 2)", () => {
    const r = ReviewScanRequestSchema.safeParse({ reviews: [CLEAN_REVIEWS[0]!] });
    expect(r.success).toBe(false);
  });
  it("rejects > 500 reviews", () => {
    const big = Array.from({ length: 501 }, () => ({ text: "hi" }));
    const r = ReviewScanRequestSchema.safeParse({ reviews: big });
    expect(r.success).toBe(false);
  });
  it("rejects review with empty text", () => {
    const r = ReviewScanRequestSchema.safeParse({ reviews: [{ text: "" }, { text: "ok" }] });
    expect(r.success).toBe(false);
  });
  it("rejects rating outside 1..5", () => {
    const r = ReviewScanRequestSchema.safeParse({
      reviews: [{ text: "a", rating: 0 }, { text: "b" }],
    });
    expect(r.success).toBe(false);
  });
});

describe("scanReviews - clean corpus", () => {
  const result = scanReviews({ reviews: CLEAN_REVIEWS });
  it("returns high authenticity score", () => {
    expect(result.authenticityScore).toBeGreaterThanOrEqual(0.7);
  });
  it("flags zero or minimal signals", () => {
    expect(result.signalsFound.length).toBeLessThanOrEqual(1);
  });
  it("includes the expected pack slug", () => {
    expect(result.packSlug).toBe("dark-pattern/fake-social-proof");
  });
  it("heuristics are populated with numbers", () => {
    expect(typeof result.heuristics.temporalClusteringPct).toBe("number");
    expect(typeof result.heuristics.languageHomogeneityScore).toBe("number");
    expect(typeof result.heuristics.fiveStarSharePct).toBe("number");
    expect(typeof result.heuristics.templatePhrasingHitPct).toBe("number");
    expect(typeof result.heuristics.lengthHomogeneityScore).toBe("number");
  });
});

describe("scanReviews - manipulated corpus", () => {
  const result = scanReviews({ reviews: FAKE_REVIEWS, productName: "FakeBrand Espresso" });

  it("returns low authenticity score", () => {
    expect(result.authenticityScore).toBeLessThanOrEqual(0.55);
  });

  it("flags temporal clustering", () => {
    const found = result.signalsFound.some((s) => s.startsWith("temporal-clustering"));
    expect(found).toBe(true);
  });

  it("flags template phrasing", () => {
    const found = result.signalsFound.some((s) => s.startsWith("template-phrasing"));
    expect(found).toBe(true);
  });

  it("flags rating skew", () => {
    const found = result.signalsFound.some((s) => s.startsWith("rating-skew"));
    expect(found).toBe(true);
  });

  it("flags language homogeneity", () => {
    const found = result.signalsFound.some((s) => s.startsWith("language-homogeneity"));
    expect(found).toBe(true);
  });

  it("flags individual reviews with template phrases", () => {
    expect(result.flaggedReviewIndices.length).toBeGreaterThanOrEqual(5);
  });

  it("summary mentions manipulation or inauthentic pattern", () => {
    expect(
      /inauthentic|manipulated|fabrication|caution/i.test(result.summary),
    ).toBe(true);
  });
});

describe("scanReviews - edge cases", () => {
  it("no-rating corpus → fiveStarSharePct = 0", () => {
    const r = scanReviews({
      reviews: [
        { text: "this is a review about the product, with some useful detail" },
        { text: "another review with distinct wording and length that reads authentic" },
      ],
    });
    expect(r.heuristics.fiveStarSharePct).toBe(0);
  });

  it("returns consistent shape for every invocation", () => {
    const r = scanReviews({ reviews: CLEAN_REVIEWS });
    expect(r).toMatchObject({
      authenticityScore: expect.any(Number),
      signalsFound: expect.any(Array),
      flaggedReviewIndices: expect.any(Array),
      summary: expect.any(String),
      packSlug: "dark-pattern/fake-social-proof",
      heuristics: expect.any(Object),
    });
  });
});
