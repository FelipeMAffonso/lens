import { describe, expect, it } from "vitest";
import { chatgptAdapter } from "./chatgpt.js";

describe("chatgptAdapter", () => {
  it("matches chatgpt.com and chat.openai.com", () => {
    expect(chatgptAdapter.match(new URL("https://chatgpt.com/c/abc"))).toBe(true);
    expect(chatgptAdapter.match(new URL("https://chat.openai.com/c/abc"))).toBe(true);
    expect(chatgptAdapter.match(new URL("https://example.com/"))).toBe(false);
  });

  it("detects assistant responses via data-message-author-role", () => {
    const html = `
      <article data-message-author-role="user">What's the best espresso machine under $400?</article>
      <article data-message-author-role="assistant">The De'Longhi Stilosa is a great choice...</article>
      <article data-message-author-role="user">Thanks!</article>
      <article data-message-author-role="assistant">You're welcome.</article>
    `;
    document.body.innerHTML = html;
    const responses = chatgptAdapter.detectResponses(document);
    expect(responses).toHaveLength(2);
    expect(chatgptAdapter.extractText(responses[0]!)).toContain("De'Longhi Stilosa");
    expect(chatgptAdapter.extractText(responses[1]!)).toContain("welcome");
  });

  it("returns empty array when no responses present", () => {
    document.body.innerHTML = `<div>nothing here</div>`;
    expect(chatgptAdapter.detectResponses(document)).toEqual([]);
  });

  it("extractUserPrompt walks back to the preceding user message", () => {
    document.body.innerHTML = `
      <article data-message-author-role="user">espresso under $400</article>
      <article data-message-author-role="assistant">...answer here...</article>
    `;
    const assistant = document.querySelectorAll<HTMLElement>(
      '[data-message-author-role="assistant"]',
    )[0]!;
    expect(chatgptAdapter.extractUserPrompt!(assistant)).toBe("espresso under $400");
  });

  it("responseAnchor returns the response element itself", () => {
    document.body.innerHTML = `<article data-message-author-role="assistant">x</article>`;
    const el = document.querySelector<HTMLElement>('[data-message-author-role="assistant"]')!;
    expect(chatgptAdapter.responseAnchor(el)).toBe(el);
  });
});
