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
 * Render an inline warning badge on the page for each hit.
 * This is the "surface-and-warn" intervention (packs/intervention/surface-and-warn.json).
 */
export function renderBadges(hits: HeuristicHit[]): void {
  const existing = document.getElementById("lens-overlay");
  if (existing) existing.remove();

  if (hits.length === 0) return;

  const overlay = document.createElement("div");
  overlay.id = "lens-overlay";
  overlay.style.cssText = `
    position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;
    background: #161b22; color: #e8eaed; border: 2px solid #ff7b72;
    border-radius: 12px; padding: 14px 16px; max-width: 360px;
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  `;
  overlay.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
      <strong style="color: #ff7b72; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em;">⚠ Lens · ${hits.length} pattern${hits.length > 1 ? "s" : ""} detected</strong>
      <button id="lens-close" style="background: none; border: none; color: #8b949e; cursor: pointer; font-size: 16px; padding: 0;">×</button>
    </div>
    <ul style="margin: 0; padding-left: 16px; font-size: 13px; color: #e8eaed;">
      ${hits
        .slice(0, 5)
        .map(
          (h) => `
        <li style="margin-bottom: 4px;">
          <strong style="color: #ffa657;">${h.brignullId}</strong>
          <span style="color: #8b949e; font-size: 11px;"> · ${h.severity}</span>
          <div style="color: #8b949e; font-size: 12px; margin-top: 2px;">${(h.matchedElement.text || "").slice(0, 80)}</div>
        </li>
      `,
        )
        .join("")}
    </ul>
    <div style="font-size: 11px; color: #8b949e; margin-top: 8px;">
      Open <a href="https://lens-b1h.pages.dev" target="_blank" style="color: #7ee787;">Lens</a> for a full audit.
    </div>
  `;
  document.body.append(overlay);
  document.getElementById("lens-close")?.addEventListener("click", () => overlay.remove());
}
