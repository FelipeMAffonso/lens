// F6 — MutationObserver: attach pills to newly-rendered AI responses.

import type { HostAdapter } from "./hosts/common.js";
import { attachPill } from "./pill.js";

export function watchForResponses(adapter: HostAdapter): MutationObserver {
  // Initial pass
  for (const el of adapter.detectResponses(document)) attachPill(el, adapter);

  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const n of m.addedNodes) {
        if (!(n instanceof HTMLElement)) continue;
        // Check the added node itself + descendants
        const candidates =
          adapter.detectResponses(n).length > 0
            ? adapter.detectResponses(n)
            : adapter.detectResponses(n.ownerDocument ?? document);
        for (const el of candidates) attachPill(el, adapter);
      }
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // Judge P1-5: SPA route changes. ChatGPT + Claude + Gemini are Next/React
  // SPAs — the MutationObserver catches most re-renders but `history.pushState`
  // can swap the tree without a top-level childList notification. Re-run the
  // full-document pass on popstate + custom navigation events.
  const reattach = (): void => {
    for (const el of adapter.detectResponses(document)) attachPill(el, adapter);
  };
  window.addEventListener("popstate", reattach);
  // Monkey-patch pushState so we catch SPA-level nav without library hooks.
  const origPush = history.pushState.bind(history);
  history.pushState = function (...args: Parameters<typeof origPush>): void {
    origPush(...args);
    setTimeout(reattach, 100);
  };

  return mo;
}
