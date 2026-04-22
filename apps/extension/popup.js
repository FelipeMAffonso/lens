const status = document.getElementById("status");
const hitsPanel = document.getElementById("hits-panel");

function set(msg) { status.textContent = msg; }

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Button 1: open the Lens dashboard with the current page's URL prefilled.
document.getElementById("audit-page").addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab?.url) { set("No active tab."); return; }
  const isAiChat = /chatgpt\.com|claude\.ai|gemini\.google|amazon\.com|perplexity\.ai/.test(tab.url);

  if (isAiChat) {
    // Extract the last assistant message and open Lens with it pre-filled
    set("Extracting AI assistant answer…");
    try {
      const extract = await chrome.tabs.sendMessage(tab.id, { type: "LENS_EXTRACT" });
      if (extract?.raw) {
        const url = new URL("https://lens-b1h.pages.dev/");
        url.searchParams.set("mode", "text");
        url.searchParams.set("source", extract.host);
        // Note: URL params have limits; we truncate and rely on the user pasting full context if needed
        url.searchParams.set("raw", extract.raw.slice(0, 3000));
        chrome.tabs.create({ url: url.toString() });
        set("Opened Lens with the AI answer pre-filled.");
      } else {
        set("Couldn't find an AI answer. Try pasting manually.");
      }
    } catch (e) {
      set("Error: " + e.message);
    }
  } else {
    // Product page — open Lens with the URL in URL-mode
    const url = new URL("https://lens-b1h.pages.dev/");
    url.searchParams.set("mode", "url");
    url.searchParams.set("url", tab.url);
    chrome.tabs.create({ url: url.toString() });
    set("Opened Lens with this page URL.");
  }
});

// Button 2: re-run the passive dark-pattern scan on the current page.
document.getElementById("rescan").addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab?.id) { set("No active tab."); return; }
  set("Re-scanning…");
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "LENS_RESCAN" });
    set("Scan complete — badge appears on page if patterns detected.");
  } catch (e) {
    set("Could not scan (page may not allow content scripts).");
  }
});

// On open, check telemetry for recent scan hits.
(async () => {
  try {
    const tab = await getActiveTab();
    if (!tab?.id) return;
    const hits = await chrome.runtime.sendMessage({ type: "LENS_GET_HITS", tabId: tab.id });
    if (hits && hits.length > 0) {
      hitsPanel.classList.add("show");
      hitsPanel.innerHTML = `<strong style="color:#ffa657;font-size:11px;">${hits.length} dark pattern${hits.length === 1 ? "" : "s"} detected on this page:</strong>` +
        hits.slice(0, 5).map(h => `<div class="hit-row">• ${h.brignullId} (${h.severity})</div>`).join("");
    }
  } catch {}
})();
