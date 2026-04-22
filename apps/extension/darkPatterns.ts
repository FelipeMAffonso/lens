/**
 * Dark-pattern detection — lightweight pass.
 *
 * This is the CSS/DOM heuristic stage of the two-stage detection pipeline
 * described in docs/DELIVERY_ARCHITECTURE.md. Runs entirely in the content
 * script with no Worker call. When a heuristic fires, the extension optionally
 * escalates to the Worker for LLM verification against the matching pack's
 * llmVerifyPrompt.
 *
 * The rules below are a subset of what the Worker's pack registry holds. They
 * mirror packs/dark-pattern/*.json but are embedded in the extension for
 * offline detection. When the pack registry updates, refresh these by running
 * scripts/extract-extension-heuristics.mjs (roadmap).
 */

export interface HeuristicHit {
  packSlug: string;
  brignullId: string;
  severity: "nuisance" | "manipulative" | "deceptive" | "illegal-in-jurisdiction";
  matchedElement: { tag: string; text: string; selector?: string | undefined };
}

const URGENCY_PATTERNS = /ends in \d+:\d+|hurry.+offer|flash sale.+today|limited time only|deal expires in/i;
const SCARCITY_PATTERNS = /only \d+ (left|remaining)|almost sold out|\d+ (viewing|looking at) (this|right now)/i;
const CONFIRMSHAME_PATTERNS = /no thanks, i (don.?t|do not) want|i.?m fine paying full price|i don.?t care about|i hate (good )?deals/i;
const HIDDEN_COST_KEYWORDS = /service fee|convenience fee|processing fee|handling fee|resort fee|destination fee|facility fee/i;
const FORCED_CONTINUITY_PATTERNS = /free trial.+(auto-?renew|automatically charged|unless you cancel)|first month free.+auto/i;

/**
 * Run the lightweight scan against the current document. Returns hits with
 * matched element context. The second-stage LLM verification is not done here
 * — the content script posts hits to /passive-scan for Worker-side verdict.
 */
export function scanDocument(doc: Document = document): HeuristicHit[] {
  const hits: HeuristicHit[] = [];

  // Fake urgency — countdown timers, "ends in" copy
  doc
    .querySelectorAll<HTMLElement>(
      "[class*='countdown'], [class*='timer'], [data-countdown], .deal-timer, .flash-sale",
    )
    .forEach((el) => {
      hits.push({
        packSlug: "dark-pattern/fake-urgency",
        brignullId: "fake-urgency",
        severity: "deceptive",
        matchedElement: {
          tag: el.tagName,
          text: el.innerText?.slice(0, 120) ?? "",
          selector: el.className || undefined,
        },
      });
    });
  doc.querySelectorAll<HTMLElement>("body *").forEach((el) => {
    const text = el.innerText?.slice(0, 200);
    if (text && URGENCY_PATTERNS.test(text) && el.children.length === 0) {
      hits.push({
        packSlug: "dark-pattern/fake-urgency",
        brignullId: "fake-urgency",
        severity: "deceptive",
        matchedElement: { tag: el.tagName, text },
      });
    }
  });

  // Fake scarcity — "only N left" text, stock counters
  doc.querySelectorAll<HTMLElement>(".stock-counter, [data-stock], .urgency-badge").forEach((el) => {
    hits.push({
      packSlug: "dark-pattern/fake-scarcity",
      brignullId: "fake-scarcity",
      severity: "deceptive",
      matchedElement: { tag: el.tagName, text: el.innerText?.slice(0, 120) ?? "" },
    });
  });
  const bodyText = doc.body?.innerText ?? "";
  for (const m of bodyText.matchAll(new RegExp(SCARCITY_PATTERNS.source, SCARCITY_PATTERNS.flags + "g"))) {
    hits.push({
      packSlug: "dark-pattern/fake-scarcity",
      brignullId: "fake-scarcity",
      severity: "deceptive",
      matchedElement: { tag: "text", text: m[0] },
    });
  }

  // Confirmshaming — scan button/link text
  doc.querySelectorAll<HTMLElement>("button, a[role='button']").forEach((el) => {
    const text = (el.innerText ?? "").slice(0, 200);
    if (CONFIRMSHAME_PATTERNS.test(text)) {
      hits.push({
        packSlug: "dark-pattern/confirmshaming",
        brignullId: "confirmshaming",
        severity: "manipulative",
        matchedElement: { tag: el.tagName, text },
      });
    }
  });

  // Hidden costs — keyword match on checkout/cart pages
  const url = doc.location.href.toLowerCase();
  if (url.includes("checkout") || url.includes("cart") || url.includes("payment")) {
    if (HIDDEN_COST_KEYWORDS.test(bodyText)) {
      hits.push({
        packSlug: "dark-pattern/hidden-costs",
        brignullId: "hidden-costs",
        severity: "deceptive",
        matchedElement: {
          tag: "text",
          text: bodyText.match(HIDDEN_COST_KEYWORDS)?.[0] ?? "fee keyword",
        },
      });
    }
  }

  // Forced continuity — free trial + auto-renew language
  if (FORCED_CONTINUITY_PATTERNS.test(bodyText)) {
    hits.push({
      packSlug: "dark-pattern/forced-continuity",
      brignullId: "forced-continuity",
      severity: "deceptive",
      matchedElement: { tag: "text", text: bodyText.match(FORCED_CONTINUITY_PATTERNS)?.[0] ?? "" },
    });
  }

  // Preselection — pre-checked controls advantageous to business
  doc
    .querySelectorAll<HTMLInputElement>("input[type='checkbox'][checked], input[type='checkbox'][data-default='checked']")
    .forEach((el) => {
      const label = el.closest("label")?.innerText ?? el.getAttribute("name") ?? "";
      if (/newsletter|marketing|sub(scribe|scription)|warranty|protection|insurance|auto-renew/i.test(label)) {
        hits.push({
          packSlug: "dark-pattern/preselection",
          brignullId: "preselection",
          severity: "manipulative",
          matchedElement: { tag: "INPUT", text: label.slice(0, 120) },
        });
      }
    });

  // Sneak into basket — pre-checked on cart/product pages
  if (url.includes("cart") || url.includes("product")) {
    doc
      .querySelectorAll<HTMLInputElement>(
        "input[type='checkbox'][checked][name*='protection'], input[type='checkbox'][checked][name*='warranty'], input[type='checkbox'][checked][name*='insurance']",
      )
      .forEach((el) => {
        hits.push({
          packSlug: "dark-pattern/sneak-into-basket",
          brignullId: "sneak-into-basket",
          severity: "deceptive",
          matchedElement: {
            tag: "INPUT",
            text: el.closest("label")?.innerText?.slice(0, 120) ?? el.getAttribute("name") ?? "",
          },
        });
      });
  }

  return hits;
}

/**
 * F7 — Per-pattern Shadow-DOM badges pinned to matched elements; aggregate
 * snackbar when >3 hits; per-host learned suppression after 3 dismissals.
 * Legacy single-overlay path preserved as the fallback when no matched
 * elements can be located.
 */
import { attachDarkPatternBadge } from "./content/overlay/badge.js";
import { renderAggregateSnackbar } from "./content/overlay/snackbar.js";

const AGGREGATE_THRESHOLD = 3;

export function renderBadges(hits: HeuristicHit[]): void {
  // Clear any legacy overlay from the prior implementation.
  document.getElementById("lens-overlay")?.remove();
  document.getElementById("lens-snackbar")?.remove();
  if (hits.length === 0) return;

  // Try to attach per-hit inline badges for hits with an anchorable element.
  const attached: Array<{ hit: HeuristicHit; host: HTMLElement }> = [];
  for (const hit of hits) {
    const anchor = locateAnchor(hit);
    if (!anchor) continue;
    const host = attachDarkPatternBadge(anchor, hit);
    if (host) attached.push({ hit, host });
  }

  // AMBIENT_MODEL §2 "one badge per page" — when >3 are anchored OR hits lack
  // anchors, aggregate into a snackbar so we never overwhelm the page.
  if (attached.length === 0 || hits.length > AGGREGATE_THRESHOLD) {
    renderAggregateSnackbar(hits, () => {
      window.open("https://lens-b1h.pages.dev", "_blank", "noopener,noreferrer");
    });
  }
}

function locateAnchor(hit: HeuristicHit): HTMLElement | null {
  const sel = hit.matchedElement.selector;
  if (sel) {
    try {
      const el = document.querySelector<HTMLElement>("." + sel.split(/\s+/).join("."));
      if (el) return el;
    } catch {
      // invalid selector, fall through
    }
  }
  // Fallback: find a visible element whose textContent contains the hit text.
  const text = (hit.matchedElement.text || "").slice(0, 50).trim();
  if (!text) return null;
  // Cheap O(DOM) scan — only run for small hit counts, acceptable cost.
  const candidates = document.querySelectorAll<HTMLElement>(
    "span, div, label, td, li, p, strong, em, small",
  );
  for (const c of candidates) {
    if ((c.innerText ?? "").includes(text)) {
      return c;
    }
    if (candidates.length > 2000) break; // safety cap
  }
  return null;
}
