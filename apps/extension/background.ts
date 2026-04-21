// Background service worker. Proxies audit requests to the Lens API.
// Kept minimal; most work happens in the content script + API.

const API_URL = "https://lens-api.felipemaffonso.workers.dev"; // placeholder; replace after deploy

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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
    return true; // async response
  }
  return false;
});
