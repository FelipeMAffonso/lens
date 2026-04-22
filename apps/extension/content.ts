// Content script. Runs on ChatGPT / Claude / Gemini / Rufus / Amazon / general retailers.
// Two jobs:
//   1. Extract last-assistant-message text for the /audit popup flow (on AI chat sites).
//   2. Passive dark-pattern detection on any page load (lightweight CSS/DOM heuristics).

import { scanDocument, renderBadges, type HeuristicHit } from "./darkPatterns.js";

type HostAI = "chatgpt" | "claude" | "gemini" | "rufus" | "unknown";

function detectHost(): HostAI {
  const h = location.hostname;
  if (h.includes("chatgpt")) return "chatgpt";
  if (h.includes("claude.ai")) return "claude";
  if (h.includes("gemini.google")) return "gemini";
  if (h.includes("amazon")) return "rufus";
  return "unknown";
}

function extractLastAssistantText(host: HostAI): string {
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

// Passive dark-pattern scan on initial page load + after 1.5s + on DOM changes.
function runPassiveScan(): void {
  try {
    const hits = scanDocument();
    if (hits.length > 0) {
      console.log("[Lens] detected", hits.length, "dark pattern hits:", hits);
      renderBadges(hits);
      // Notify background for telemetry (opt-in).
      chrome.runtime.sendMessage({ type: "LENS_SCAN_HITS", hits });
    }
  } catch (e) {
    console.error("[Lens] scan error:", e);
  }
}

// Run on initial load
if (document.readyState === "complete" || document.readyState === "interactive") {
  setTimeout(runPassiveScan, 500);
} else {
  document.addEventListener("DOMContentLoaded", () => setTimeout(runPassiveScan, 500));
}

// Run again after SPA-style navigation / late content renders
setTimeout(runPassiveScan, 2500);

// Message handler for the popup to request AI-chat extraction
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "LENS_EXTRACT") {
    const host = detectHost();
    const raw = extractLastAssistantText(host);
    sendResponse({ host, raw });
  }
  if (msg?.type === "LENS_RESCAN") {
    runPassiveScan();
    sendResponse({ ok: true });
  }
});
