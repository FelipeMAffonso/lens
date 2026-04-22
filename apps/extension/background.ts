// Background service worker. Tracks per-tab dark-pattern scan results,
// proxies audits, AND (S4-W22) escalates Stage-1 hits to /passive-scan for
// LLM verification, then pushes confirmations back into the tab.

const API_URL = "https://lens-api.webmarinelli.workers.dev";

interface Hit {
  packSlug: string;
  brignullId: string;
  severity: "nuisance" | "manipulative" | "deceptive" | "illegal-in-jurisdiction";
  matchedElement: { tag: string; text: string; selector?: string };
}

interface PassiveScanPayload {
  host: string;
  pageType: string;
  url?: string;
  hits: Hit[];
}

// Per-tab scan hits memory.
const hitsByTab = new Map<number, unknown[]>();
// In-flight Stage-2 requests keyed by tabId to prevent duplicate escalation
// on rapid re-scans.
const inflightByTab = new Map<number, Promise<unknown>>();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "LENS_SCAN_HITS") {
    const tabId = sender.tab?.id;
    if (tabId) {
      hitsByTab.set(tabId, msg.hits ?? []);
      // S4-W22 — Stage-2 escalation only when the content script explicitly
      // opts in (stage2=true). The content script gates on per-host consent
      // before sending, so this stays silent on unconfirmed hosts.
      if (msg.stage2 === true && typeof msg.host === "string" && typeof msg.pageType === "string") {
        void escalateStage2(tabId, {
          host: msg.host,
          pageType: msg.pageType,
          url: typeof msg.url === "string" ? msg.url : undefined,
          hits: (msg.hits ?? []) as Hit[],
        });
      }
    }
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
  inflightByTab.delete(tabId);
});

/**
 * S4-W22 — send Stage-1 hits to /passive-scan and broadcast confirmations
 * back into the tab. Per-host consent is checked in the content script
 * before `stage2: true` is set on the outbound LENS_SCAN_HITS message.
 */
async function escalateStage2(tabId: number, payload: PassiveScanPayload): Promise<void> {
  if (payload.hits.length === 0) return;
  if (inflightByTab.has(tabId)) return;
  const request = fetch(`${API_URL}/passive-scan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      host: payload.host,
      pageType: payload.pageType,
      url: payload.url,
      hits: payload.hits.map((h) => ({
        packSlug: h.packSlug,
        brignullId: h.brignullId,
        severity: h.severity,
        // Truncate excerpt at 200 chars — schema guard is 400 on the server.
        excerpt: (h.matchedElement?.text ?? "").slice(0, 200),
      })),
    }),
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`passive-scan http ${res.status}`);
      return res.json() as Promise<{
        confirmed: Array<Record<string, unknown>>;
        dismissed: Array<{ packSlug: string; reason: string }>;
        ran: "opus" | "heuristic-only";
        runId: string;
      }>;
    })
    .then((result) => {
      void chrome.tabs
        .sendMessage(tabId, { type: "LENS_STAGE2_CONFIRMED", result })
        .catch(() => {
          // Tab closed or content script gone — not fatal.
        });
      return result;
    })
    .catch((err) => {
      console.error("[Lens bg] passive-scan failed:", (err as Error).message);
    })
    .finally(() => {
      inflightByTab.delete(tabId);
    });
  inflightByTab.set(tabId, request);
}
