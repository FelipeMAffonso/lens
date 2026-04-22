// F6 — content script entry point.
// Preserves the F7 passive dark-pattern scan + adds:
//   - host detection (AI-chat hosts get the ◉ Lens pill + sidebar)
//   - ESC / click-outside sidebar close (handled in injector)
//   - MutationObserver for dynamic AI responses

import { scanDocument, renderBadges } from "./darkPatterns.js";
import { adapterForUrl } from "./content/hosts/registry.js";
import { watchForResponses } from "./content/observer.js";

type HostAI = "chatgpt" | "claude" | "gemini" | "rufus" | "unknown";

function detectHostLegacy(): HostAI {
  const h = location.hostname;
  if (h.includes("chatgpt")) return "chatgpt";
  if (h.includes("claude.ai")) return "claude";
  if (h.includes("gemini.google")) return "gemini";
  if (h.includes("amazon")) return "rufus";
  return "unknown";
}

function extractLastAssistantText(host: HostAI): string {
  const adapter = adapterForUrl();
  if (adapter) {
    const responses = adapter.detectResponses(document);
    const last = responses.at(-1);
    return last ? adapter.extractText(last) : "";
  }
  // Legacy fallback (for hosts we haven't adaptered yet)
  switch (host) {
    case "chatgpt":
      return (
        [...document.querySelectorAll('[data-message-author-role="assistant"]')].at(-1)?.textContent?.trim() ?? ""
      );
    case "claude":
      return (
        [...document.querySelectorAll<HTMLElement>(".font-claude-message,.font-claude-response")]
          .at(-1)?.innerText?.trim() ?? ""
      );
    case "gemini":
      return (
        [...document.querySelectorAll<HTMLElement>("model-response,[data-response-id]")]
          .at(-1)?.innerText?.trim() ?? ""
      );
    case "rufus":
      return document.querySelector<HTMLElement>('[data-feature-name="rufus"]')?.innerText?.trim() ?? "";
    default:
      return "";
  }
}

// Passive dark-pattern scan on initial load + after 1.5s + on DOM changes.
function runPassiveScan(): void {
  try {
    const hits = scanDocument();
    if (hits.length > 0) {
      console.log("[Lens] detected", hits.length, "dark pattern hits:", hits);
      renderBadges(hits);
      chrome.runtime.sendMessage({ type: "LENS_SCAN_HITS", hits });
    }
  } catch (e) {
    console.error("[Lens] scan error:", e);
  }
}

// F6 ambient pill attachment on AI-chat hosts.
function bootAIChatPills(): void {
  const adapter = adapterForUrl();
  if (!adapter) return;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const mo = watchForResponses(adapter);
  console.log("[Lens] ambient pill active for host:", adapter.id);
}

// Boot sequence
if (document.readyState === "complete" || document.readyState === "interactive") {
  setTimeout(() => {
    runPassiveScan();
    bootAIChatPills();
  }, 500);
} else {
  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
      runPassiveScan();
      bootAIChatPills();
    }, 500);
  });
}

// Late-bind for SPA-style apps that render after initial paint
setTimeout(() => {
  runPassiveScan();
  bootAIChatPills();
}, 2500);

// Popup message handler (legacy popup still works)
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "LENS_EXTRACT") {
    const host = detectHostLegacy();
    const raw = extractLastAssistantText(host);
    sendResponse({ host, raw });
  }
  if (msg?.type === "LENS_RESCAN") {
    runPassiveScan();
    sendResponse({ ok: true });
  }
});
