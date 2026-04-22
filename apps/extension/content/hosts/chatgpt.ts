import type { HostAdapter } from "./common.js";
import { txt } from "./common.js";

export const chatgptAdapter: HostAdapter = {
  id: "chatgpt",
  match: (url) => url.hostname === "chatgpt.com" || url.hostname === "chat.openai.com",
  detectResponses: (root) =>
    [...root.querySelectorAll<HTMLElement>('[data-message-author-role="assistant"]')],
  extractText: (el) => txt(el),
  responseAnchor: (el) => el,
  extractUserPrompt: (el) => {
    // Walk backwards through siblings and ancestors looking for the prior user message.
    let n: Element | null = el.previousElementSibling;
    while (n) {
      const user = n.querySelector?.<HTMLElement>('[data-message-author-role="user"]') as
        | HTMLElement
        | null;
      if (user) return txt(user);
      if (n.matches?.('[data-message-author-role="user"]')) return txt(n as HTMLElement);
      n = n.previousElementSibling;
    }
    // Try the container's predecessor
    const container = el.closest?.("article, div[role]");
    let p = container?.previousElementSibling ?? null;
    while (p) {
      const user = p.querySelector?.<HTMLElement>('[data-message-author-role="user"]') as
        | HTMLElement
        | null;
      if (user) return txt(user);
      p = p.previousElementSibling;
    }
    return null;
  },
};
