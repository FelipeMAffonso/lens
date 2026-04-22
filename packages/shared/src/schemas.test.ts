import { describe, expect, it } from "vitest";
import {
  AuditInputSchema,
  CriterionSchema,
  HostAISchema,
  UserIntentSchema,
  AIRecommendationSchema,
} from "./schemas.js";

describe("HostAISchema", () => {
  it("accepts the five named hosts + unknown", () => {
    for (const host of ["chatgpt", "claude", "gemini", "rufus", "unknown"]) {
      expect(HostAISchema.safeParse(host).success).toBe(true);
    }
  });
  it("rejects unrecognized host", () => {
    expect(HostAISchema.safeParse("bing").success).toBe(false);
  });
});

describe("CriterionSchema", () => {
  it("accepts a well-formed criterion", () => {
    const r = CriterionSchema.safeParse({
      name: "pressure",
      weight: 0.3,
      direction: "higher_is_better",
    });
    expect(r.success).toBe(true);
  });
  it("rejects weight > 1", () => {
    expect(
      CriterionSchema.safeParse({ name: "x", weight: 1.5, direction: "higher_is_better" }).success,
    ).toBe(false);
  });
  it("rejects weight < 0", () => {
    expect(
      CriterionSchema.safeParse({ name: "x", weight: -0.1, direction: "higher_is_better" }).success,
    ).toBe(false);
  });
  it("accepts a target criterion with numeric target", () => {
    const r = CriterionSchema.safeParse({
      name: "brew_temp",
      weight: 0.2,
      direction: "target",
      target: 200,
    });
    expect(r.success).toBe(true);
  });
  it("rejects an invalid direction", () => {
    expect(
      CriterionSchema.safeParse({ name: "x", weight: 0.5, direction: "nope" }).success,
    ).toBe(false);
  });
});

describe("AuditInputSchema", () => {
  it("accepts text mode with source + raw", () => {
    const r = AuditInputSchema.safeParse({
      kind: "text",
      source: "chatgpt",
      raw: "The Sony WH-1000XM5 is the clear pick here.",
    });
    expect(r.success).toBe(true);
  });

  it("rejects text mode with empty raw", () => {
    const r = AuditInputSchema.safeParse({ kind: "text", source: "chatgpt", raw: "" });
    expect(r.success).toBe(false);
  });

  it("rejects text mode with raw > 50000 chars", () => {
    const r = AuditInputSchema.safeParse({
      kind: "text",
      source: "chatgpt",
      raw: "a".repeat(50_001),
    });
    expect(r.success).toBe(false);
  });

  it("accepts image mode with base64", () => {
    const r = AuditInputSchema.safeParse({
      kind: "image",
      source: "claude",
      imageBase64: "iVBORw0KGgo=",
    });
    expect(r.success).toBe(true);
  });

  it("rejects image mode with empty base64", () => {
    const r = AuditInputSchema.safeParse({
      kind: "image",
      source: "claude",
      imageBase64: "",
    });
    expect(r.success).toBe(false);
  });

  it("accepts query mode with userPrompt", () => {
    const r = AuditInputSchema.safeParse({
      kind: "query",
      userPrompt: "espresso machine under $400",
    });
    expect(r.success).toBe(true);
  });

  it("rejects query mode with empty userPrompt", () => {
    const r = AuditInputSchema.safeParse({ kind: "query", userPrompt: "" });
    expect(r.success).toBe(false);
  });

  it("accepts url mode with http URL", () => {
    const r = AuditInputSchema.safeParse({
      kind: "url",
      url: "https://www.amazon.com/dp/B07ABC",
    });
    expect(r.success).toBe(true);
  });

  it("rejects url mode with non-http string", () => {
    const r = AuditInputSchema.safeParse({ kind: "url", url: "ftp://foo" });
    expect(r.success).toBe(false);
  });

  it("rejects url mode with invalid URL", () => {
    const r = AuditInputSchema.safeParse({ kind: "url", url: "not a url" });
    expect(r.success).toBe(false);
  });

  it("rejects url longer than 2000 chars", () => {
    const r = AuditInputSchema.safeParse({
      kind: "url",
      url: "https://example.com/" + "a".repeat(2001),
    });
    expect(r.success).toBe(false);
  });

  it("accepts photo mode with category hint", () => {
    const r = AuditInputSchema.safeParse({
      kind: "photo",
      imageBase64: "iVBORw0KGgo=",
      category: "espresso",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown kind", () => {
    const r = AuditInputSchema.safeParse({ kind: "voicemail", raw: "hi" });
    expect(r.success).toBe(false);
  });
});

describe("UserIntentSchema", () => {
  it("accepts a minimal intent", () => {
    const r = UserIntentSchema.safeParse({
      category: "espresso machine",
      criteria: [{ name: "pressure", weight: 1, direction: "higher_is_better" }],
      rawCriteriaText: "pressure matters most",
    });
    expect(r.success).toBe(true);
  });

  it("requires at least one criterion", () => {
    const r = UserIntentSchema.safeParse({
      category: "espresso machine",
      criteria: [],
      rawCriteriaText: "",
    });
    expect(r.success).toBe(false);
  });

  it("accepts optional budget", () => {
    const r = UserIntentSchema.safeParse({
      category: "headphones",
      criteria: [{ name: "anc", weight: 0.5, direction: "higher_is_better" }],
      budget: { max: 300, currency: "USD" },
      rawCriteriaText: "ANC matters",
    });
    expect(r.success).toBe(true);
  });
});

describe("AIRecommendationSchema", () => {
  it("accepts a full recommendation", () => {
    const r = AIRecommendationSchema.safeParse({
      host: "chatgpt",
      pickedProduct: { name: "Stilosa", brand: "De'Longhi", price: 249, currency: "USD" },
      claims: [{ attribute: "pressure", statedValue: "15 bar" }],
      reasoningTrace: "Because it has 15 bar pressure.",
    });
    expect(r.success).toBe(true);
  });

  it("requires pickedProduct.name", () => {
    const r = AIRecommendationSchema.safeParse({
      host: "chatgpt",
      pickedProduct: { brand: "De'Longhi" },
      claims: [],
      reasoningTrace: "",
    });
    expect(r.success).toBe(false);
  });
});
