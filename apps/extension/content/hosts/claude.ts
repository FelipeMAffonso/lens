import type { HostAdapter } from "./common.js";
import { txt } from "./common.js";

export const claudeAdapter: HostAdapter = {
  id: "claude",
  match: (url) => url.hostname === "claude.ai" || url.hostname.endsWith(".claude.ai"),
  detectResponses: (root) =>
    [...root.querySelectorAll<HTMLElement>(".font-claude-message, .font-claude-response")],
  extractText: (el) => txt(el),
  responseAnchor: (el) => el,
  extractUserPrompt: (el) => {
    let n: Element | null = el.parentElement?.previousElementSibling ?? el.previousElementSibling;
    while (n) {
      const user = n.querySelector?.<HTMLElement>('[data-testid="user-message"]') as
        | HTMLElement
        | null;
      if (user) return txt(user);
      n = n.previousElementSibling;
    }
    return null;
  },
};
