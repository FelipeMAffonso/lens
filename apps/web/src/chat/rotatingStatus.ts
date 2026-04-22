// CJ-W53 — rotating status ticker shown during the Stage-2 audit wall.

import { ROTATING_STATUS_PHRASES } from "./stages.js";

export interface RotatingStatusHandle {
  root: HTMLElement;
  stop(): void;
  finalize(finalText?: string): void;
}

export function mountRotatingStatus(
  parent: HTMLElement,
  phrases: readonly string[] = ROTATING_STATUS_PHRASES,
  intervalMs = 2500,
): RotatingStatusHandle {
  const root = document.createElement("div");
  root.className = "lc-rotator";
  root.setAttribute("role", "status");
  root.setAttribute("aria-live", "polite");
  root.innerHTML = `
    <span class="lc-rotator-spinner" aria-hidden="true"></span>
    <span class="lc-rotator-text">${phrases[0]}</span>
  `;
  parent.append(root);

  const textEl = root.querySelector<HTMLElement>(".lc-rotator-text")!;
  let idx = 0;
  let stopped = false;
  const tick = (): void => {
    if (stopped) return;
    idx = (idx + 1) % phrases.length;
    // crossfade via class swap; CSS handles the timing
    textEl.classList.add("lc-rotator-text-out");
    setTimeout(() => {
      if (stopped) return;
      textEl.textContent = phrases[idx]!;
      textEl.classList.remove("lc-rotator-text-out");
    }, 180);
  };
  const timer = setInterval(tick, intervalMs);

  return {
    root,
    stop(): void {
      stopped = true;
      clearInterval(timer);
      root.remove();
    },
    finalize(finalText?: string): void {
      stopped = true;
      clearInterval(timer);
      if (finalText) {
        textEl.textContent = finalText;
        root.classList.add("lc-rotator-done");
      }
      setTimeout(() => root.remove(), 600);
    },
  };
}
