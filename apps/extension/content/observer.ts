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
  return mo;
}
