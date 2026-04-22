import { describe, expect, it } from "vitest";
import { adapterForUrl, ADAPTERS } from "./registry.js";

describe("adapter registry", () => {
  it("exposes all 5 host adapters", () => {
    const ids = ADAPTERS.map((a) => a.id);
    expect(new Set(ids)).toEqual(new Set(["chatgpt", "claude", "gemini", "rufus", "perplexity"]));
  });

  it("resolves chatgpt.com → chatgpt adapter", () => {
    expect(adapterForUrl(new URL("https://chatgpt.com/"))?.id).toBe("chatgpt");
  });
  it("resolves claude.ai → claude adapter", () => {
    expect(adapterForUrl(new URL("https://claude.ai/"))?.id).toBe("claude");
  });
  it("resolves gemini.google.com → gemini adapter", () => {
    expect(adapterForUrl(new URL("https://gemini.google.com/"))?.id).toBe("gemini");
  });
  it("resolves amazon.com → rufus adapter", () => {
    expect(adapterForUrl(new URL("https://amazon.com/"))?.id).toBe("rufus");
  });
  it("resolves perplexity.ai → perplexity adapter", () => {
    expect(adapterForUrl(new URL("https://perplexity.ai/"))?.id).toBe("perplexity");
  });
  it("returns null for unknown hosts", () => {
    expect(adapterForUrl(new URL("https://google.com/"))).toBeNull();
  });
});
