// F6 — content script entry point.
// Preserves the F7 passive dark-pattern scan + adds:
//   - host detection (AI-chat hosts get the ◉ Lens pill + sidebar)
//   - ESC / click-outside sidebar close (handled in injector)
//   - MutationObserver for dynamic AI responses
// S4-W22 — gates Stage-2 dark-pattern verification behind per-host consent
// and upgrades badges in place when confirmations arrive from the Worker.

import { scanDocument, renderBadges } from "./darkPatterns.js";
import { adapterForUrl } from "./content/hosts/registry.js";
import { watchForResponses } from "./content/observer.js";
import { canStage2, askForConsent, getConsent } from "./content/consent.js";
import { upgradeBadge, findBadgeByBrignullId, type BadgeConfirmation } from "./content/overlay/badge.js";
import { bootPriceHistory } from "./content/retail/price-history-badge.js";
import { bootCheckoutSummary, isCartOrCheckout } from "./content/retail/cart-summary-badge.js";
import { bootReviewScan } from "./content/retail/review-scan-badge.js";

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

// Page-type classifier — maps URL to the server's PageTypeEnum.
function classifyPageType(): string {
  const u = location.href.toLowerCase();
  if (u.includes("/checkout") || u.includes("/booking/confirm") || u.includes("/payment"))
    return "checkout";
  if (u.includes("/cart")) return "cart";
  if (u.includes("/product") || u.includes("/dp/") || u.includes("/p/")) return "product";
  if (u.includes("/review")) return "review";
  if (u.includes("/marketplace") || u.includes("/seller") || u.includes("/sp/")) return "marketplace";
  return "other";
}

// Passive dark-pattern scan on initial load + after 1.5s + on DOM changes.
// S4-W22: after Stage 1 fires, gate Stage 2 escalation on per-host consent.
function runPassiveScan(): void {
  try {
    const hits = scanDocument();
    if (hits.length === 0) return;
    console.log("[Lens] detected", hits.length, "dark pattern hits:", hits);
    renderBadges(hits);

    const host = location.host;
    const pageType = classifyPageType();
    // Send Stage-1 hits to the background regardless (for telemetry + popup).
    chrome.runtime.sendMessage({
      type: "LENS_SCAN_HITS",
      hits,
      host,
      pageType,
      url: location.origin + location.pathname, // query + fragment stripped
      stage2: false,
    });

    // Gate Stage 2 on per-host consent. "always" → fire immediately;
    // null | "ask" → render a consent modal for the most severe hit;
    // "never" → skip Stage 2 entirely (badges stay in heuristic styling).
    if (canStage2(host)) {
      chrome.runtime.sendMessage({
        type: "LENS_SCAN_HITS",
        hits,
        host,
        pageType,
        url: location.origin + location.pathname,
        stage2: true,
      });
      return;
    }
    if (getConsent(host) === "never") return;
    // Ask once; pick the most severe hit as the representative pattern.
    const top = pickMostSevere(hits);
    const patternName = top.brignullId.replace(/-/g, " ");
    void askForConsent(host, patternName).then((decision) => {
      if (decision === "always") {
        chrome.runtime.sendMessage({
          type: "LENS_SCAN_HITS",
          hits,
          host,
          pageType,
          url: location.origin + location.pathname,
          stage2: true,
        });
      }
      // "ask" and "never" → do nothing this time.
    });
  } catch (e) {
    console.error("[Lens] scan error:", e);
  }
}

function pickMostSevere(hits: ReturnType<typeof scanDocument>): ReturnType<typeof scanDocument>[number] {
  const order = ["illegal-in-jurisdiction", "deceptive", "manipulative", "nuisance"] as const;
  const sorted = hits.slice().sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
  return sorted[0]!;
}

// F6 ambient pill attachment on AI-chat hosts.
// Judge P0-3: with `all_frames: true`, content.ts runs in every iframe — useful
// for Amazon Rufus (rendered in a nested iframe) but noisy elsewhere. Gate
// everything except the Amazon adapter to the top frame.
function bootAIChatPills(): void {
  const adapter = adapterForUrl();
  if (!adapter) return;
  const inTopFrame = window === window.top;
  if (!inTopFrame && adapter.id !== "rufus") {
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const mo = watchForResponses(adapter);
  console.log("[Lens] ambient pill active for host:", adapter.id, "topFrame:", inTopFrame);
}

// Boot sequence
const boot = (): void => {
  runPassiveScan();
  bootAIChatPills();
  // V-EXT-INLINE-g: retailer product-page price-history badge. No-op when not
  // on a supported retailer product page. Top-frame only.
  if (window === window.top) {
    void bootPriceHistory();
    // V-EXT-INLINE-h: Amazon review-authenticity banner. Amazon-only; runs
    // after short delay so the review list has time to render below the fold.
    setTimeout(() => {
      void bootReviewScan();
    }, 1500);
    // V-EXT-INLINE-f: cart/checkout-summary badge. Runs after a short delay so
    // the passive-scan hit-list stabilizes first; composes the hits into a
    // single checkout-readiness verdict.
    if (isCartOrCheckout()) {
      setTimeout(() => {
        try {
          const hits = scanDocument();
          const topPattern = hits[0]?.brignullId;
          const signal = {
            confirmedCount: hits.length,
            ...(topPattern ? { topPattern } : {}),
            ran: "heuristic-only" as const,
          };
          void bootCheckoutSummary(signal);
        } catch (e) {
          console.error("[Lens] cart-summary boot error:", e);
        }
      }, 1200);
    }
  }
};
if (document.readyState === "complete" || document.readyState === "interactive") {
  setTimeout(boot, 500);
} else {
  document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 500));
}

// Late-bind for SPA-style apps that render after initial paint
setTimeout(boot, 2500);

// V-EXT-INLINE-g + V-EXT-INLINE-f judge P0-3: SPA reattach. Walmart/Target/
// Amazon pushState between product + cart pages. Re-run both retail boots.
function retailReboot(): void {
  if (window !== window.top) return;
  void bootPriceHistory();
  void bootReviewScan();
  if (isCartOrCheckout()) {
    try {
      const hits = scanDocument();
      const topPattern = hits[0]?.brignullId;
      const signal = {
        confirmedCount: hits.length,
        ...(topPattern ? { topPattern } : {}),
        ran: "heuristic-only" as const,
      };
      void bootCheckoutSummary(signal);
    } catch (e) {
      console.error("[Lens] cart-summary reboot error:", e);
    }
  }
}
window.addEventListener("popstate", () => setTimeout(retailReboot, 400));
const _origPushState = history.pushState.bind(history);
history.pushState = function (...args: Parameters<typeof _origPushState>): void {
  _origPushState(...args);
  setTimeout(retailReboot, 400);
};

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
  if (msg?.type === "LENS_STAGE2_CONFIRMED") {
    applyStage2Confirmations(msg.result as {
      confirmed: BadgeConfirmation[];
      dismissed: Array<{ packSlug: string; reason: string }>;
      ran: "opus" | "heuristic-only";
    });
    sendResponse({ ok: true });
  }
});

/**
 * S4-W22 — upgrade existing badges in place with Stage-2 confirmation data.
 * If the server dismissed a hit as a false positive, remove that badge.
 */
function applyStage2Confirmations(result: {
  confirmed: BadgeConfirmation[];
  dismissed: Array<{ packSlug: string; reason: string }>;
}): void {
  for (const c of result.confirmed ?? []) {
    const host = findBadgeByBrignullId(c.brignullId);
    if (host) upgradeBadge(host, c);
  }
  // Dismissed: hide the badge for that pattern.
  for (const d of result.dismissed ?? []) {
    const brignullId = d.packSlug.replace(/^dark-pattern\//, "");
    const host = findBadgeByBrignullId(brignullId);
    if (host) host.remove();
  }
}
