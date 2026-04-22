import type { HostAdapter } from "./common.js";
import { txt } from "./common.js";

export const rufusAdapter: HostAdapter = {
  id: "rufus",
  match: (url) => url.hostname.endsWith("amazon.com"),
  detectResponses: (root) => {
    const panel = root.querySelector<HTMLElement>('[data-feature-name="rufus"]');
    if (!panel) return [];
    // Rufus responses come in role=article (or similar) inside the panel.
    return [
      ...panel.querySelectorAll<HTMLElement>(
        '[role="article"], .rufus-response, [data-testid="rufus-response"]',
      ),
    ];
  },
  extractText: (el) => txt(el),
  responseAnchor: (el) => el,
};
