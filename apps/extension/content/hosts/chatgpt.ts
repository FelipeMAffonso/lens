import type { HostAdapter } from "./common.js";
import { txt } from "./common.js";

export const chatgptAdapter: HostAdapter = {
  id: "chatgpt",
  match: (url) => url.hostname === "chatgpt.com" || url.hostname === "chat.openai.com",
  detectResponses: (root) => {
    // Primary selector per ChatGPT's current DOM.
    const primary = [...root.querySelectorAll<HTMLElement>('[data-message-author-role="assistant"]')];
    if (primary.length > 0) return primary;
    // Judge P1-3 fallback: ChatGPT occasionally restructures assistant
    // markup. article[data-turn="assistant"] is a stable alt; .markdown.prose
    // under an assistant-authored turn is another. Warn once so the stale
    // selector is observable in devtools.
    const alt = [
      ...root.querySelectorAll<HTMLElement>('article[data-turn="assistant"]'),
      ...root.querySelectorAll<HTMLElement>('article[data-author-role="assistant"]'),
    ];
    if (alt.length > 0) {
      if (!(globalThis as { __lensChatgptStale?: boolean }).__lensChatgptStale) {
        console.warn("[Lens] chatgpt selector stale — using fallback");
        (globalThis as { __lensChatgptStale?: boolean }).__lensChatgptStale = true;
      }
      return alt;
    }
    return [];
  },
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
