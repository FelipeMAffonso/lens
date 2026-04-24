// CJ-W53 — rotating status ticker shown during the Stage-2 audit wall.

import { ROTATING_STATUS_PHRASES } from "./stages.js";

export interface RotatingStatusHandle {
  root: HTMLElement;
  stop(): void;
  finalize(finalText?: string): void;
  /** Judge P0-3 (2026-04-24): externally set the phrase (from /audit/stream SSE
   * events). Calling setPhrase disables the internal rotation timer so the
   * real pipeline events don't fight the canned phrase cycle. */
  setPhrase(text: string): void;
}

export interface RotatingStatusOptions {
  intervalMs?: number;
  pauseWhenFocused?: HTMLElement | null;
}

export function mountRotatingStatus(
  parent: HTMLElement,
  phrases: readonly string[] = ROTATING_STATUS_PHRASES,
  opts: RotatingStatusOptions | number = {},
): RotatingStatusHandle {
  // Back-compat: legacy 3rd arg was the intervalMs number.
  const resolved: RotatingStatusOptions =
    typeof opts === "number" ? { intervalMs: opts } : opts;
  const intervalMs = resolved.intervalMs ?? 2500;
  const pauseEl = resolved.pauseWhenFocused ?? null;

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
  let cycles = 0;
  let stopped = false;
  let paused = false;

  const tick = (): void => {
    if (stopped || paused) return;
    // Judge P1-10: after one full cycle, hold on the last phrase rather
    // than looping back to the first — audit wall is ~25-30s, phrases are
    // 5x2.5s=12.5s. Looping feels repetitive; holding feels settled.
    if (idx >= phrases.length - 1) {
      cycles++;
      if (cycles >= 1) return; // stay on the last phrase
    }
    idx = (idx + 1) % phrases.length;
    textEl.classList.add("lc-rotator-text-out");
    setTimeout(() => {
      if (stopped) return;
      textEl.textContent = phrases[idx]!;
      textEl.classList.remove("lc-rotator-text-out");
    }, 180);
  };
  const timer = setInterval(tick, intervalMs);

  // Judge P1-5: pause announcements when the user focuses the composer so
  // we don't fight the focus with aria-live swaps.
  const onFocus = (): void => {
    paused = true;
    root.setAttribute("aria-live", "off");
  };
  const onBlur = (): void => {
    paused = false;
    root.setAttribute("aria-live", "polite");
  };
  if (pauseEl) {
    pauseEl.addEventListener("focus", onFocus);
    pauseEl.addEventListener("blur", onBlur);
  }

  const detachFocusHandlers = (): void => {
    if (!pauseEl) return;
    pauseEl.removeEventListener("focus", onFocus);
    pauseEl.removeEventListener("blur", onBlur);
  };

  return {
    root,
    stop(): void {
      stopped = true;
      clearInterval(timer);
      detachFocusHandlers();
      root.remove();
    },
    finalize(finalText?: string): void {
      stopped = true;
      clearInterval(timer);
      detachFocusHandlers();
      if (finalText) {
        textEl.textContent = finalText;
        root.classList.add("lc-rotator-done");
      }
      setTimeout(() => root.remove(), 600);
    },
    setPhrase(text: string): void {
      // Judge P0-3: once caller drives updates, silence the canned timer.
      clearInterval(timer);
      if (!text || stopped) return;
      textEl.classList.add("lc-rotator-text-out");
      setTimeout(() => {
        if (stopped) return;
        textEl.textContent = text;
        textEl.classList.remove("lc-rotator-text-out");
      }, 120);
    },
  };
}
