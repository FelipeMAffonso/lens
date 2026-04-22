import { describe, expect, it } from "vitest";
import { rufusAdapter } from "./rufus.js";

describe("rufusAdapter", () => {
  it("matches amazon.com + presence of rufus panel", () => {
    expect(rufusAdapter.match(new URL("https://www.amazon.com/"))).toBe(true);
    expect(rufusAdapter.match(new URL("https://amazon.com/"))).toBe(true);
    expect(rufusAdapter.match(new URL("https://example.com/"))).toBe(false);
  });

  it("detects responses only inside the rufus panel", () => {
    document.body.innerHTML = `
      <div data-feature-name="rufus">
        <div role="article">Rufus answer 1</div>
        <div role="article">Rufus answer 2</div>
      </div>
      <div role="article">Outside rufus (should NOT match)</div>
    `;
    const responses = rufusAdapter.detectResponses(document);
    expect(responses).toHaveLength(2);
    expect(rufusAdapter.extractText(responses[0]!)).toContain("Rufus answer 1");
  });

  it("returns empty array if no rufus panel", () => {
    document.body.innerHTML = `<div>Amazon page without rufus</div>`;
    expect(rufusAdapter.detectResponses(document)).toEqual([]);
  });
});
