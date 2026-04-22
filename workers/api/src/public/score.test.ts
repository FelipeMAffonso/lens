import { describe, expect, it } from "vitest";
import { computeScore, EMBED_JS, ScoreQuerySchema } from "./score.js";

describe("ScoreQuerySchema", () => {
  it("requires criteria", () => {
    expect(ScoreQuerySchema.safeParse({}).success).toBe(false);
  });
  it("accepts criteria alone", () => {
    expect(ScoreQuerySchema.safeParse({ criteria: "battery life" }).success).toBe(true);
  });
  it("accepts url + category + criteria", () => {
    const r = ScoreQuerySchema.safeParse({
      url: "https://example.com/x",
      category: "laptops",
      criteria: "battery life, build quality",
    });
    expect(r.success).toBe(true);
  });
  it("rejects criteria longer than 2000 chars", () => {
    const r = ScoreQuerySchema.safeParse({ criteria: "a".repeat(2001) });
    expect(r.success).toBe(false);
  });
});

describe("computeScore", () => {
  it("calls audit(kind=query) and returns the score envelope", async () => {
    const audit = async () => ({
      specOptimal: {
        name: "Test Product",
        brand: "TestCo",
        price: 199,
        utilityScore: 0.784,
        utilityBreakdown: [
          { criterion: "battery", weight: 0.5, score: 0.9, contribution: 0.45 },
        ],
      },
      intent: { category: "laptops" },
    });
    const r = await computeScore(
      { criteria: "battery life matters most", category: "laptops" },
      audit,
    );
    expect(r.score).toBe(0.784);
    expect(r.breakdown[0]!.criterion).toBe("battery");
    expect(r.productName).toBe("Test Product");
    expect(r.category).toBe("laptops");
    expect(r.price).toBe(199);
  });

  it("threads url into the prompt when provided", async () => {
    let captured = "";
    const audit = async (input: { kind: "query"; userPrompt: string }) => {
      captured = input.userPrompt;
      return {
        specOptimal: {
          name: "x", utilityScore: 0.5, utilityBreakdown: [],
        },
        intent: { category: "x" },
      };
    };
    await computeScore(
      { criteria: "x", url: "https://foo.com/p/1" },
      audit,
    );
    expect(captured).toContain("https://foo.com/p/1");
  });
});

describe("EMBED_JS", () => {
  it("is a self-executing IIFE", () => {
    expect(EMBED_JS.startsWith("(function(){")).toBe(true);
    expect(EMBED_JS.endsWith("})();")).toBe(true);
  });
  it("references the Lens API base", () => {
    expect(EMBED_JS).toContain("lens-api.webmarinelli.workers.dev");
  });
  it("is under 5kb", () => {
    expect(EMBED_JS.length).toBeLessThan(5000);
  });
});
