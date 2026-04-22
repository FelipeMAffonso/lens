import { describe, expect, it } from "vitest";
import { perplexityAdapter } from "./perplexity.js";

describe("perplexityAdapter", () => {
  it("matches perplexity.ai", () => {
    expect(perplexityAdapter.match(new URL("https://www.perplexity.ai/"))).toBe(true);
    expect(perplexityAdapter.match(new URL("https://perplexity.ai/search?q=x"))).toBe(true);
    expect(perplexityAdapter.match(new URL("https://example.com/"))).toBe(false);
  });

  it("detects answer blocks via data-testid", () => {
    document.body.innerHTML = `
      <div data-testid="answer-block">The best espresso is...</div>
      <div data-testid="copilot-answer">Or consider these alternatives</div>
    `;
    const responses = perplexityAdapter.detectResponses(document);
    expect(responses).toHaveLength(2);
  });
});
