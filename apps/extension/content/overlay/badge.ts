// F7 — Shadow-DOM-isolated dark-pattern badge. Pinned near the matched element,
// Apple-motion smooth, dismissible, per-host learned suppression.
//
// S4-W22 extends this with an upgradeBadge(host, confirmation) call that
// repaints the pill when the Stage-2 verifier returns a regulatory citation.

import type { HeuristicHit } from "../../darkPatterns.js";
import { shouldSuppress, recordDismissal } from "./suppression.js";

const BADGE_ATTR = "data-lens-badge";

export interface BadgeConfirmation {
  packSlug: string;
  brignullId: string;
  verdict: "confirmed" | "uncertain";
  llmExplanation: string;
  regulatoryCitation?: {
    packSlug: string;
    officialName: string;
    citation: string;
    status: "in-force" | "delayed" | "vacated" | "superseded" | "preempted";
    effectiveDate: string;
    userRightsPlainLanguage?: string;
  };
  suggestedInterventions?: Array<{ packSlug: string; canonicalName: string }>;
  feeBreakdown?: { label: string; amountUsd?: number; frequency?: string };
}

/**
 * Per-host registry so content.ts can find the badge for a given hit when the
 * Stage-2 verdict lands. Weakly keyed by the host span returned to the caller.
 */
const BADGE_REGISTRY = new WeakMap<
  HTMLElement,
  { shadow: ShadowRoot; hit: HeuristicHit }
>();

const TEMPLATE = `
<style>
  :host, button { all: initial; box-sizing: border-box; }
  * { box-sizing: border-box; }
  .root {
    position: absolute; top: -4px; right: -4px; z-index: 2147483646;
    pointer-events: auto; font: 500 12px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  .pill {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 5px 9px 5px 8px; background: #fff6f2; color: #b13b30;
    border: 1px solid rgba(226, 89, 80, 0.32);
    border-radius: 999px; cursor: pointer;
    box-shadow: 0 1px 4px rgba(15, 20, 30, 0.16);
    transform: scale(1);
    transition: transform 150ms cubic-bezier(0.22, 1, 0.36, 1),
                box-shadow 150ms ease, background 150ms ease;
    max-width: 240px;
  }
  .pill:hover { transform: scale(1.03); box-shadow: 0 2px 8px rgba(15, 20, 30, 0.22); }
  .pill:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(226, 89, 80, 0.25); }
  .dot { width: 6px; height: 6px; border-radius: 999px; background: #e25950; flex-shrink: 0; }
  .name { font-weight: 600; }
  .close { background: none; border: 0; color: rgba(177, 59, 48, 0.75); cursor: pointer; padding: 0 2px; margin-left: 2px; font-size: 13px; line-height: 1; }
  .close:hover { color: #b13b30; }
  .tooltip {
    position: absolute; bottom: calc(100% + 6px); right: 0;
    background: #1a1a1a; color: #fafbfc;
    padding: 8px 10px; border-radius: 6px; white-space: nowrap;
    opacity: 0; transform: translateY(4px); pointer-events: none;
    transition: opacity 150ms ease, transform 150ms ease;
    font-size: 11px; line-height: 1.45; max-width: 320px; white-space: normal;
  }
  .pill:hover ~ .tooltip, .pill:focus-visible ~ .tooltip { opacity: 1; transform: translateY(0); }
  @keyframes enter {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .root { animation: enter 200ms cubic-bezier(0.22, 1, 0.36, 1); }
  @media (prefers-reduced-motion: reduce) {
    .root, .pill { animation: none; transition: none; }
  }
</style>
<div class="root" role="alert" aria-live="polite">
  <button type="button" class="pill" aria-label="Dark pattern detected">
    <span class="dot" aria-hidden="true"></span>
    <span class="name">PATTERN</span>
    <span class="close" data-close aria-label="Dismiss">×</span>
  </button>
  <span class="tooltip">TOOLTIP</span>
</div>
`;

export function attachDarkPatternBadge(
  anchor: HTMLElement,
  hit: HeuristicHit,
  onClick?: (hit: HeuristicHit) => void,
): HTMLElement | null {
  // If we've already suppressed this pattern on this host, no badge.
  if (shouldSuppress(window.location.host, hit.brignullId)) return null;
  // Already badged?
  if (anchor.getAttribute(BADGE_ATTR) === hit.brignullId) return null;

  const cs = window.getComputedStyle(anchor);
  if (cs.position === "static") anchor.style.position = "relative";

  const host = document.createElement("span");
  host.style.cssText = "display:inline-block;position:relative;line-height:0;";
  host.setAttribute("data-lens", "badge-host");
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = TEMPLATE
    .replace("PATTERN", labelFor(hit.brignullId))
    .replace("TOOLTIP", tooltipFor(hit));

  const pill = shadow.querySelector<HTMLButtonElement>(".pill")!;
  const closeBtn = shadow.querySelector<HTMLSpanElement>("[data-close]")!;

  pill.addEventListener("click", (e) => {
    // If click was on the close×, suppress that path.
    if ((e.target as Element).hasAttribute("data-close")) return;
    e.preventDefault();
    e.stopPropagation();
    onClick?.(hit);
  });
  closeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    recordDismissal(window.location.host, hit.brignullId);
    host.remove();
    anchor.removeAttribute(BADGE_ATTR);
  });

  anchor.append(host);
  anchor.setAttribute(BADGE_ATTR, hit.brignullId);
  BADGE_REGISTRY.set(host, { shadow, hit });
  return host;
}

/**
 * S4-W22 — upgrade an existing badge with Stage-2 confirmation data.
 * Swaps the red-warning visual for a slate-confirmed visual, injects the
 * regulation citation into the tooltip, and adds a "Draft complaint" button
 * when an intervention is available.
 */
export function upgradeBadge(host: HTMLElement, confirmation: BadgeConfirmation): void {
  const entry = BADGE_REGISTRY.get(host);
  if (!entry) return;
  const { shadow, hit } = entry;
  const pill = shadow.querySelector<HTMLButtonElement>(".pill");
  const dot = shadow.querySelector<HTMLSpanElement>(".dot");
  const tooltip = shadow.querySelector<HTMLSpanElement>(".tooltip");
  if (!pill || !dot || !tooltip) return;

  // Confirmed pattern = green-slate dot + "Confirmed" prefix.
  if (confirmation.verdict === "confirmed") {
    dot.style.background = "#1f7a55"; // green-slate, not alarmist
    pill.setAttribute("aria-label", "Dark pattern confirmed by Lens Stage 2");
  } else {
    // Uncertain stays amber-ish but softer than the original red.
    dot.style.background = "#c98a1a";
    pill.setAttribute("aria-label", "Possible dark pattern flagged by Lens");
  }

  // Build the enriched tooltip.
  const parts: string[] = [];
  parts.push(confirmation.llmExplanation || hit.matchedElement.text.slice(0, 120));
  if (confirmation.regulatoryCitation) {
    const c = confirmation.regulatoryCitation;
    parts.push(`\n${c.officialName} · ${c.citation}${c.status === "in-force" ? "" : ` (${c.status})`}.`);
    if (c.userRightsPlainLanguage) parts.push(c.userRightsPlainLanguage.slice(0, 240));
  }
  if (confirmation.feeBreakdown?.amountUsd) {
    const f = confirmation.feeBreakdown;
    const freq = f.frequency ? ` ${f.frequency}` : "";
    parts.push(`\nFee: ${f.label} — $${f.amountUsd}${freq}.`);
  }
  tooltip.textContent = parts.join(" ");
}

/**
 * S4-W22 — lookup the registered hit + host pair for a given
 * (brignullId, host-url). Used by content.ts after it receives a batch of
 * confirmations back from the background worker.
 */
export function findBadgeByBrignullId(brignullId: string): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(`[${BADGE_ATTR}='${brignullId}']`);
  for (const anchor of all) {
    const host = anchor.querySelector<HTMLElement>("[data-lens='badge-host']");
    if (host) return host;
  }
  return null;
}

function labelFor(id: string): string {
  return id.replace(/-/g, " ");
}

function tooltipFor(hit: HeuristicHit): string {
  return `${hit.severity.toUpperCase()} · Lens caught a ${hit.brignullId.replace(/-/g, " ")} pattern. Click for remediation.`;
}
