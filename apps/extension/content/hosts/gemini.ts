import type { HostAdapter } from "./common.js";
import { txt } from "./common.js";

export const geminiAdapter: HostAdapter = {
  id: "gemini",
  match: (url) => url.hostname === "gemini.google.com",
  detectResponses: (root) =>
    [
      ...root.querySelectorAll<HTMLElement>(
        "model-response, [data-response-id], message-content",
      ),
    ],
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
