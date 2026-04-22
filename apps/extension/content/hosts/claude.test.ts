import { describe, expect, it } from "vitest";
import { claudeAdapter } from "./claude.js";

describe("claudeAdapter", () => {
  it("matches claude.ai", () => {
    expect(claudeAdapter.match(new URL("https://claude.ai/chat/abc"))).toBe(true);
    expect(claudeAdapter.match(new URL("https://foo.claude.ai/"))).toBe(true);
    expect(claudeAdapter.match(new URL("https://example.com/"))).toBe(false);
  });

  it("detects responses via .font-claude-message + .font-claude-response", () => {
    document.body.innerHTML = `
      <div class="font-claude-message">Answer one.</div>
      <div class="font-claude-response">Answer two.</div>
      <div>plain div</div>
    `;
    const responses = claudeAdapter.detectResponses(document);
    expect(responses).toHaveLength(2);
    expect(claudeAdapter.extractText(responses[0]!)).toBe("Answer one.");
    expect(claudeAdapter.extractText(responses[1]!)).toBe("Answer two.");
  });

  it("returns empty array when no responses match", () => {
    document.body.innerHTML = `<div>random</div>`;
    expect(claudeAdapter.detectResponses(document)).toEqual([]);
  });
});
