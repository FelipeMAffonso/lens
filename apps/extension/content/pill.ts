// F6 — Lens pill (◉). One per AI response. Shadow-DOM-isolated.

import type { HostAdapter } from "./hosts/common.js";
import { openSidebar } from "./injector.js";

const PILL_ATTR = "data-lens-pill";

const PILL_TEMPLATE = `
<style>
  :host, button { all: initial; }
  .lens-pill {
    display: inline-flex; align-items: center; justify-content: center;
    width: 28px; height: 28px; border-radius: 999px;
    background: #DA7756; color: #fff;
    font: 600 14px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    cursor: pointer;
    box-shadow: 0 1px 4px rgba(15, 20, 30, 0.2);
    transform: scale(1);
    transition: transform 150ms cubic-bezier(0.22, 1, 0.36, 1),
                box-shadow 150ms ease, background 150ms ease;
    border: 1px solid rgba(0, 0, 0, 0.04);
    outline: none;
  }
  .lens-pill:hover, .lens-pill:focus-visible {
    transform: scale(1.06);
    box-shadow: 0 2px 8px rgba(15, 20, 30, 0.28);
    background: #c86a4a;
  }
  .lens-pill:focus-visible {
    box-shadow: 0 0 0 3px rgba(218, 119, 86, 0.35), 0 2px 8px rgba(15, 20, 30, 0.28);
  }
  .lens-pill:active { transform: scale(0.96); }
  @media (prefers-reduced-motion: reduce) {
    .lens-pill { transition: none; }
  }
  .lens-label {
    position: absolute; bottom: calc(100% + 6px); right: 0;
    background: #1a1a1a; color: #fafbfc;
    font: 500 11px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    padding: 5px 9px; border-radius: 4px; white-space: nowrap;
    opacity: 0; transform: translateY(4px); pointer-events: none;
    transition: opacity 150ms ease, transform 150ms ease;
  }
  .lens-pill:hover + .lens-label,
  .lens-pill:focus-visible + .lens-label {
    opacity: 1; transform: translateY(0);
  }
  .wrap { position: relative; display: inline-block; }
</style>
<div class="wrap">
  <button type="button" class="lens-pill" aria-label="Audit this AI recommendation with Lens">◉</button>
  <span class="lens-label">Audit with Lens</span>
</div>
`;

export function attachPill(responseEl: HTMLElement, adapter: HostAdapter): void {
  if (responseEl.getAttribute(PILL_ATTR) === "1") return;
  // Ensure response is positioned so the pill can absolute-position inside.
  const cs = window.getComputedStyle(responseEl);
  if (cs.position === "static") {
    responseEl.style.position = "relative";
  }

  const host = document.createElement("span");
  host.style.cssText =
    "position:absolute;bottom:8px;right:8px;z-index:2147483646;line-height:0;";
  host.setAttribute("data-lens", "pill-host");
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = PILL_TEMPLATE;
  const btn = shadow.querySelector<HTMLButtonElement>(".lens-pill")!;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const text = adapter.extractText(responseEl);
    const userPrompt = adapter.extractUserPrompt?.(responseEl) ?? null;
    openSidebar({
      origin: window.location.origin,
      host: adapter.id,
      responseText: text,
      userPrompt,
      apiBase: "https://lens-api.webmarinelli.workers.dev",
    });
  });
  responseEl.append(host);
  responseEl.setAttribute(PILL_ATTR, "1");
}
