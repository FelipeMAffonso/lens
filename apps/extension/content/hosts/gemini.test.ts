import { describe, expect, it } from "vitest";
import { geminiAdapter } from "./gemini.js";

describe("geminiAdapter", () => {
  it("matches gemini.google.com", () => {
    expect(geminiAdapter.match(new URL("https://gemini.google.com/app"))).toBe(true);
    expect(geminiAdapter.match(new URL("https://example.com/"))).toBe(false);
  });

  it("detects model-response and data-response-id elements", () => {
    document.body.innerHTML = `
      <model-response>First answer</model-response>
      <div data-response-id="r1">Second answer</div>
      <message-content>Third answer</message-content>
    `;
    const responses = geminiAdapter.detectResponses(document);
    expect(responses.length).toBeGreaterThanOrEqual(2);
  });
});
