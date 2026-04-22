import type { HostAdapter } from "./common.js";
import { txt } from "./common.js";

export const perplexityAdapter: HostAdapter = {
  id: "perplexity",
  match: (url) => url.hostname === "perplexity.ai" || url.hostname === "www.perplexity.ai",
  detectResponses: (root) =>
    [
      ...root.querySelectorAll<HTMLElement>(
        '[data-testid="answer-block"], [data-testid="copilot-answer"], .prose.dark\\:prose-invert',
      ),
    ],
  extractText: (el) => txt(el),
  responseAnchor: (el) => el,
};
