// Background service worker. Tracks per-tab dark-pattern scan results + proxies to the Lens API.

const API_URL = "https://lens-api.webmarinelli.workers.dev";

// Per-tab scan hits memory
const hitsByTab = new Map<number, unknown[]>();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "LENS_SCAN_HITS") {
    const tabId = sender.tab?.id;
    if (tabId) hitsByTab.set(tabId, msg.hits ?? []);
    sendResponse({ ok: true });
    return false;
  }
  if (msg?.type === "LENS_GET_HITS") {
    const tabId = typeof msg.tabId === "number" ? msg.tabId : sender.tab?.id;
    sendResponse(tabId ? hitsByTab.get(tabId) ?? [] : []);
    return false;
  }
  if (msg?.type === "LENS_AUDIT") {
    void (async () => {
      try {
        const res = await fetch(`${API_URL}/audit`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(msg.payload),
        });
        const data = await res.json();
        sendResponse({ ok: res.ok, data });
      } catch (err) {
        sendResponse({ ok: false, error: (err as Error).message });
      }
    })();
    return true;
  }
  return false;
});

// Clear per-tab state on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  hitsByTab.delete(tabId);
});
