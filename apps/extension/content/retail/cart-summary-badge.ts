// V-EXT-INLINE-f — cart-page checkout-readiness badge.

import { canStage2, getConsent } from "../consent.js";
import { detectHost, type RetailHost } from "./detect-product-page.js";

const API_BASE = "https://lens-api.webmarinelli.workers.dev";
const BADGE_ATTR = "data-lens-cart-summary";

type Verdict = "proceed" | "hesitate" | "rethink";

interface RationaleItem {
  signal: string;
  severity: "info" | "warn" | "blocker";
  message: string;
}

interface CheckoutSummaryResponse {
  verdict: Verdict;
  score: number;
  rationale: RationaleItem[];
  recommendation: string;
  signalCount: number;
  generatedAt: string;
}

interface PassiveScanSignal {
  confirmedCount: number;
  topPattern?: string;
  ran?: "opus" | "heuristic-only";
}

const BADGED_ANCHORS = new WeakSet<HTMLElement>();

const VERDICT_UI: Record<Verdict, { color: string; bg: string; border: string; icon: string; label: string }> = {
  proceed: { color: "#247a50", bg: "#ecfaf2", border: "#3fb27f", icon: "✓", label: "Proceed" },
  hesitate: { color: "#9c6b14", bg: "#fdf5e6", border: "#c78a1f", icon: "⚠", label: "Hesitate" },
  rethink: { color: "#8a2f2f", bg: "#fdecec", border: "#d85a5a", icon: "✗", label: "Rethink" },
};

export function isCartOrCheckout(url: URL = new URL(window.location.href)): boolean {
  const p = url.pathname.toLowerCase();
  return (
    p.includes("/cart") ||
    p.includes("/checkout") ||
    p.includes("/basket") ||
    p.includes("/booking/confirm") ||
    p.includes("/payment")
  );
}

export function cartTotalAnchor(host: RetailHost): HTMLElement | null {
  const find = (sel: string): HTMLElement | null => document.querySelector<HTMLElement>(sel);
  switch (host) {
    case "amazon":
      return (
        find("#sc-subtotal-amount-buybox") ??
        find("#sc-subtotal-amount-activecart") ??
        find('[data-name="Subtotal"] .a-price .a-offscreen') ??
        find(".ewc-subtotal .a-price") ??
        null
      );
    case "bestbuy":
      return (
        find('[data-testid="order-summary-subtotal-value"]') ??
        find(".order-summary__total") ??
        null
      );
    case "walmart":
      return (
        find('[data-testid="order-summary-sub-total"]') ??
        find('[data-automation-id="sub-total"]') ??
        null
      );
    case "target":
      return (
        find('[data-test="order-summary-subtotal"]') ??
        find('[data-test="cart-summary-sub-total"]') ??
        null
      );
    case "homedepot":
      return find(".price-detailed__total") ?? find('[data-automation="price-format"]') ?? null;
    case "costco":
      return find('[data-automation-id="orderSummarySubtotal"]') ?? null;
    default:
      return null;
  }
}

async function postCheckoutSummary(
  host: string,
  passiveScan: PassiveScanSignal,
): Promise<CheckoutSummaryResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/checkout/summary`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        host,
        signals: { passiveScan },
      }),
    });
    if (!res.ok) return null;
    return (await res.json()) as CheckoutSummaryResponse;
  } catch (err) {
    console.warn("[Lens] checkout-summary fetch failed:", (err as Error).message);
    return null;
  }
}

function renderVerdictBadge(resp: CheckoutSummaryResponse, anchor: HTMLElement): HTMLElement | null {
  if (anchor.hasAttribute(BADGE_ATTR)) return null;
  if (BADGED_ANCHORS.has(anchor)) return null;
  if (anchor.nextElementSibling?.getAttribute("data-lens") === "cart-summary-host") return null;
  // Judge P1-1: document-wide guard — on SPA re-renders the anchor can be
  // replaced, WeakSet/attr evaporate, and we'd double-insert. Any existing
  // cart-summary-host in the doc means we already rendered this cart view.
  if (document.querySelector('[data-lens="cart-summary-host"]')) return null;

  // Silent-unless-signal: no badge when proceed + 0 signals contributed.
  if (resp.verdict === "proceed" && resp.signalCount === 0) {
    anchor.setAttribute(BADGE_ATTR, "1");
    BADGED_ANCHORS.add(anchor);
    return null;
  }
  const ui = VERDICT_UI[resp.verdict];
  const topRationale = resp.rationale[0];
  const topMsg = topRationale ? topRationale.message : resp.recommendation;

  const host = document.createElement("div");
  host.setAttribute("data-lens", "cart-summary-host");
  host.style.cssText = "margin:12px 0;line-height:0;";
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = `
    <style>
      :host, button, details, summary { all: initial; }
      .wrap {
        display: block;
        background: ${ui.bg}; color: ${ui.color};
        border: 1px solid ${ui.border}; border-radius: 8px;
        padding: 10px 12px;
        font: 500 13px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        line-height: 1.4;
      }
      .head { display: flex; align-items: center; gap: 8px; font-weight: 700; cursor: pointer; }
      .head:focus-visible { outline: 2px solid #DA7756; outline-offset: 2px; }
      .icon { font-size: 15px; line-height: 1; }
      .label { font-weight: 700; letter-spacing: 0.02em; }
      .score { margin-left: auto; font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 12px; font-weight: 500; opacity: 0.8; }
      .top-msg { margin-top: 4px; font-weight: 500; opacity: 0.92; }
      .details { margin-top: 10px; border-top: 1px solid ${ui.border}30; padding-top: 10px; display: none; }
      .details.open { display: block; }
      .details ul { margin: 0; padding: 0 0 0 18px; font-weight: 500; font-size: 12px; }
      .details li { margin: 3px 0; color: ${ui.color}; }
    </style>
    <section class="wrap" role="status" aria-live="polite" aria-label="Lens checkout verdict: ${ui.label}. ${topMsg}">
      <button type="button" class="head" aria-expanded="false">
        <span class="icon" aria-hidden="true">${ui.icon}</span>
        <span class="label">Lens: ${ui.label.toLowerCase()}</span>
        <span class="score">${resp.score}/100</span>
      </button>
      <div class="top-msg">${topMsg.replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
      )}</div>
      ${resp.rationale.length > 1
        ? `<div class="details">
             <ul>${resp.rationale.slice(0, 3).map((r) => `<li>${r.message.replace(/[&<>"']/g, (c) =>
               ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
             )}</li>`).join("")}</ul>
           </div>`
        : ""}
    </section>
  `;
  const head = shadow.querySelector<HTMLButtonElement>(".head")!;
  const details = shadow.querySelector<HTMLDivElement>(".details");
  head.addEventListener("click", () => {
    if (!details) return;
    const open = details.classList.toggle("open");
    head.setAttribute("aria-expanded", open ? "true" : "false");
  });
  // Judge P1-2: insert right after the anchor's parent element only, not a
  // far-up section/aside which could land the badge across the page from the
  // subtotal. parentElement keeps the badge visually adjacent to the total.
  const parent = anchor.parentElement ?? anchor;
  parent.insertAdjacentElement("afterend", host);
  anchor.setAttribute(BADGE_ATTR, "1");
  BADGED_ANCHORS.add(anchor);
  return host;
}

export async function bootCheckoutSummary(passiveScan: PassiveScanSignal): Promise<void> {
  if (!isCartOrCheckout()) return;
  const host = detectHost();
  if (!host) return;
  // Consent gate — same semantics as price-history badge.
  const hostName = location.host;
  if (getConsent(hostName) === "never") return;
  if (!canStage2(hostName)) return;
  const anchor = cartTotalAnchor(host);
  if (!anchor) {
    console.log("[Lens] cart-summary: no cart-total anchor on", host);
    return;
  }
  const resp = await postCheckoutSummary(hostName, passiveScan);
  if (!resp) return;
  renderVerdictBadge(resp, anchor);
}
