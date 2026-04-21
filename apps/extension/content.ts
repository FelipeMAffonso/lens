// Content script. Runs in the page context of ChatGPT / Claude / Gemini / Amazon.
// On demand (when the popup button is clicked), extract the last assistant message and
// send it to the Lens API.

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
      // ChatGPT uses data-message-author-role="assistant"
      return [...document.querySelectorAll('[data-message-author-role="assistant"]')]
        .at(-1)?.textContent?.trim() ?? "";
    case "claude":
      // Claude.ai messages — selectors are unstable; fall back to last element with a font-claude-message class
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
      // Rufus panel lives inside Amazon
      return (
        document.querySelector<HTMLElement>('[data-feature-name="rufus"]')?.innerText?.trim() ?? ""
      );
    default:
      return "";
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "LENS_EXTRACT") {
    const host = detectHost();
    const raw = extractLastAssistantText(host);
    sendResponse({ host, raw });
  }
});
