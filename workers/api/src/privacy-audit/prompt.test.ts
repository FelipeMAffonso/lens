import { describe, expect, it } from "vitest";
import { buildSystemPrompt, buildUserMessage } from "./prompt.js";

describe("buildSystemPrompt", () => {
  it("declares the OUTPUT CONTRACT + six top-level fields", () => {
    const s = buildSystemPrompt();
    expect(s).toContain("OUTPUT CONTRACT");
    for (const f of [
      "dataCollected",
      "sharedWithThirdParties",
      "retention",
      "deletion",
      "consentDarkPatterns",
      "regulatoryFrameworks",
    ]) {
      expect(s).toContain(f);
    }
  });
});

describe("buildUserMessage", () => {
  it("includes URL + vendor + product when supplied", () => {
    const m = buildUserMessage({
      url: "https://x.com/privacy",
      policyText: "We collect email.",
      productName: "X Cam",
      vendor: "X Inc",
    });
    expect(m).toContain("URL: https://x.com/privacy");
    expect(m).toContain("VENDOR: X Inc");
    expect(m).toContain("PRODUCT: X Cam");
    expect(m).toContain("We collect email.");
  });

  it("truncates very long policy text", () => {
    const long = "abc ".repeat(10_000);
    const m = buildUserMessage({ url: "https://x", policyText: long });
    expect(m.length).toBeLessThan(13_000);
  });
});
