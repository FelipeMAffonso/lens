// F7 — Shadow-DOM-isolated dark-pattern badge. Pinned near the matched element,
// Apple-motion smooth, dismissible, per-host learned suppression.

import type { HeuristicHit } from "../../darkPatterns.js";
import { shouldSuppress, recordDismissal } from "./suppression.js";

const BADGE_ATTR = "data-lens-badge";

const TEMPLATE = `
<style>
  :host, button { all: initial; box-sizing: border-box; }
  * { box-sizing: border-box; }
  .root {
    position: absolute; top: -4px; right: -4px; z-index: 2147483646;
    pointer-events: auto; font: 500 12px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  .pill {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 5px 9px 5px 8px; background: #fff6f2; color: #b13b30;
    border: 1px solid rgba(226, 89, 80, 0.32);
    border-radius: 999px; cursor: pointer;
    box-shadow: 0 1px 4px rgba(15, 20, 30, 0.16);
    transform: scale(1);
    transition: transform 150ms cubic-bezier(0.22, 1, 0.36, 1),
                box-shadow 150ms ease, background 150ms ease;
    max-width: 240px;
  }
  .pill:hover { transform: scale(1.03); box-shadow: 0 2px 8px rgba(15, 20, 30, 0.22); }
  .pill:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(226, 89, 80, 0.25); }
  .dot { width: 6px; height: 6px; border-radius: 999px; background: #e25950; flex-shrink: 0; }
  .name { font-weight: 600; }
  .close { background: none; border: 0; color: rgba(177, 59, 48, 0.75); cursor: pointer; padding: 0 2px; margin-left: 2px; font-size: 13px; line-height: 1; }
  .close:hover { color: #b13b30; }
  .tooltip {
    position: absolute; bottom: calc(100% + 6px); right: 0;
    background: #1a1a1a; color: #fafbfc;
    padding: 8px 10px; border-radius: 6px; white-space: nowrap;
    opacity: 0; transform: translateY(4px); pointer-events: none;
    transition: opacity 150ms ease, transform 150ms ease;
    font-size: 11px; line-height: 1.45; max-width: 320px; white-space: normal;
  }
  .pill:hover ~ .tooltip, .pill:focus-visible ~ .tooltip { opacity: 1; transform: translateY(0); }
  @keyframes enter {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .root { animation: enter 200ms cubic-bezier(0.22, 1, 0.36, 1); }
  @media (prefers-reduced-motion: reduce) {
    .root, .pill { animation: none; transition: none; }
  }
</style>
<div class="root" role="alert" aria-live="polite">
  <button type="button" class="pill" aria-label="Dark pattern detected">
    <span class="dot" aria-hidden="true"></span>
    <span class="name">PATTERN</span>
    <span class="close" data-close aria-label="Dismiss">×</span>
  </button>
  <span class="tooltip">TOOLTIP</span>
</div>
`;

export function attachDarkPatternBadge(
  anchor: HTMLElement,
  hit: HeuristicHit,
  onClick?: (hit: HeuristicHit) => void,
): HTMLElement | null {
  // If we've already suppressed this pattern on this host, no badge.
  if (shouldSuppress(window.location.host, hit.brignullId)) return null;
  // Already badged?
  if (anchor.getAttribute(BADGE_ATTR) === hit.brignullId) return null;

  const cs = window.getComputedStyle(anchor);
  if (cs.position === "static") anchor.style.position = "relative";

  const host = document.createElement("span");
  host.style.cssText = "display:inline-block;position:relative;line-height:0;";
  host.setAttribute("data-lens", "badge-host");
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = TEMPLATE
    .replace("PATTERN", labelFor(hit.brignullId))
    .replace("TOOLTIP", tooltipFor(hit));

  const pill = shadow.querySelector<HTMLButtonElement>(".pill")!;
  const closeBtn = shadow.querySelector<HTMLSpanElement>("[data-close]")!;

  pill.addEventListener("click", (e) => {
    // If click was on the close×, suppress that path.
    if ((e.target as Element).hasAttribute("data-close")) return;
    e.preventDefault();
    e.stopPropagation();
    onClick?.(hit);
  });
  closeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    recordDismissal(window.location.host, hit.brignullId);
    host.remove();
    anchor.removeAttribute(BADGE_ATTR);
  });

  anchor.append(host);
  anchor.setAttribute(BADGE_ATTR, hit.brignullId);
  return host;
}

function labelFor(id: string): string {
  return id.replace(/-/g, " ");
}

function tooltipFor(hit: HeuristicHit): string {
  return `${hit.severity.toUpperCase()} · Lens caught a ${hit.brignullId.replace(/-/g, " ")} pattern. Click for remediation.`;
}
