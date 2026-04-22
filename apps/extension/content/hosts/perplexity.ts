import type { HostAdapter } from "./common.js";
import { markStale, txt } from "./common.js";

export const perplexityAdapter: HostAdapter = {
  id: "perplexity",
  match: (url) => url.hostname === "perplexity.ai" || url.hostname === "www.perplexity.ai",
  detectResponses: (root) => {
    const primary = [
      ...root.querySelectorAll<HTMLElement>(
        '[data-testid="answer-block"], [data-testid="copilot-answer"], .prose.dark\\:prose-invert',
      ),
    ];
    if (primary.length > 0) return primary;
    // Judge P1-8: anchor fallback inside the main thread region so Perplexity's
    // marketing pages (which also use .prose) don't get pills.
    const alt = [
      ...root.querySelectorAll<HTMLElement>('main [data-testid="answer"]'),
      ...root.querySelectorAll<HTMLElement>('[data-testid*="thread"] article.prose'),
      ...root.querySelectorAll<HTMLElement>('main article.prose'),
    ];
    if (alt.length > 0) {
      if (markStale("perplexity")) console.warn("[Lens] perplexity selector stale — using fallback");
      return alt;
    }
    return [];
  },
  extractText: (el) => txt(el),
  responseAnchor: (el) => el,
};
