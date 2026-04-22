import type { HostAdapter } from "./common.js";
import { markStale, txt } from "./common.js";

export const geminiAdapter: HostAdapter = {
  id: "gemini",
  match: (url) => url.hostname === "gemini.google.com",
  detectResponses: (root) => {
    const primary = [
      ...root.querySelectorAll<HTMLElement>(
        "model-response, [data-response-id], message-content",
      ),
    ];
    if (primary.length > 0) return primary;
    const alt = [
      ...root.querySelectorAll<HTMLElement>('[data-test-id="conversation-model-response"]'),
      ...root.querySelectorAll<HTMLElement>('[role="region"][aria-label*="response" i]'),
    ];
    if (alt.length > 0) {
      if (markStale("gemini")) console.warn("[Lens] gemini selector stale — using fallback");
      return alt;
    }
    return [];
  },
  extractText: (el) => txt(el),
  responseAnchor: (el) => el,
  extractUserPrompt: (el) => {
    let n: Element | null = el.parentElement?.previousElementSibling ?? null;
    while (n) {
      const user = n.querySelector?.<HTMLElement>("user-query, [data-test-id='user-message']") as
        | HTMLElement
        | null;
      if (user) return txt(user);
      n = n.previousElementSibling;
    }
    return null;
  },
};
