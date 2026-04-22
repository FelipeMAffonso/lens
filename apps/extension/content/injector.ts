// F6 — sidebar iframe injection + lifecycle.

import type { InitPayload } from "./bridge.js";
import { onSidebarMessage, postToSidebar } from "./bridge.js";

const IFRAME_ID = "lens-sidebar-iframe";
const SIDEBAR_WIDTH = "min(420px, 100vw)";

declare const chrome: {
  runtime: { getURL: (path: string) => string };
};

let currentInit: InitPayload | null = null;
let unsub: (() => void) | null = null;

function makeIframe(): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  iframe.id = IFRAME_ID;
  iframe.setAttribute("aria-label", "Lens sidebar");
  iframe.setAttribute("title", "Lens");
  iframe.src = chrome.runtime.getURL("sidebar/index.html");
  const prefersReduced =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  iframe.style.cssText = `
    position: fixed; top: 0; right: 0; bottom: 0;
    width: ${SIDEBAR_WIDTH}; height: 100vh;
    border: 0; margin: 0; padding: 0;
    background: transparent; z-index: 2147483647;
    transform: translateX(100%);
    transition: ${prefersReduced ? "none" : "transform 300ms cubic-bezier(0.22, 1, 0.36, 1)"};
    box-shadow: -12px 0 48px rgba(15, 20, 30, 0.18);
    color-scheme: light;
  `;
  return iframe;
}

export function openSidebar(init: InitPayload): void {
  currentInit = init;
  let iframe = document.getElementById(IFRAME_ID) as HTMLIFrameElement | null;
  const slideIn = (): void => {
    if (!iframe) return;
    requestAnimationFrame(() => {
      iframe!.style.transform = "translateX(0)";
    });
  };

  if (!iframe) {
    iframe = makeIframe();
    document.documentElement.append(iframe);
    // Wait for sidebar's "ready" before sending init + sliding in.
    unsub?.();
    unsub = onSidebarMessage(iframe, (msg) => {
      if (msg.type === "ready" && currentInit) {
        postToSidebar(iframe!.contentWindow!, { type: "init", payload: currentInit });
        slideIn();
      } else if (msg.type === "request-close") {
        closeSidebar();
      }
    });
  } else {
    // Re-use existing iframe: send a fresh init + slide in.
    postToSidebar(iframe.contentWindow!, { type: "init", payload: init });
    slideIn();
  }
  persistState(true);
}

export function closeSidebar(): void {
  const iframe = document.getElementById(IFRAME_ID) as HTMLIFrameElement | null;
  if (!iframe) return;
  iframe.style.transform = "translateX(100%)";
  persistState(false);
}

export function toggleSidebar(init: InitPayload): void {
  const iframe = document.getElementById(IFRAME_ID) as HTMLIFrameElement | null;
  if (!iframe) return openSidebar(init);
  const isOpen = iframe.style.transform === "translateX(0px)" || iframe.style.transform === "translateX(0)";
  if (isOpen) closeSidebar();
  else openSidebar(init);
}

// Key bindings — ESC closes when sidebar is visible.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const iframe = document.getElementById(IFRAME_ID) as HTMLIFrameElement | null;
  if (!iframe) return;
  if (iframe.style.transform !== "translateX(100%)") closeSidebar();
});

function persistState(open: boolean): void {
  try {
    const origin = window.location.origin;
    const key = `lens.sidebar.v1.${origin}`;
    const state = { open, at: Date.now() };
    // chrome.storage.local is async + typed; stash JSON for simplicity here
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // best-effort
  }
}
