// F7 — aggregate snackbar for pages with >3 hits (AMBIENT_MODEL §2 "one badge per page" rule).

import type { HeuristicHit } from "../../darkPatterns.js";

const SNACKBAR_ID = "lens-snackbar";

export function renderAggregateSnackbar(hits: HeuristicHit[], onOpen?: () => void): void {
  const existing = document.getElementById(SNACKBAR_ID);
  if (existing) existing.remove();
  if (hits.length === 0) return;

  const host = document.createElement("div");
  host.id = SNACKBAR_ID;
  host.style.cssText = `
    position: fixed; bottom: 16px; right: 16px; z-index: 2147483646;
    font: 500 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  `;
  const shadow = host.attachShadow({ mode: "closed" });
  const byPattern = groupBy(hits, (h) => h.brignullId);
  const patternList = Array.from(byPattern.entries())
    .map(([id, hs]) => `${id.replace(/-/g, " ")} (${hs.length})`)
    .join(" · ");
  shadow.innerHTML = `
    <style>
      :host, button { all: initial; box-sizing: border-box; }
      * { box-sizing: border-box; }
      .card {
        background: #1a1a1a; color: #fafbfc;
        padding: 12px 14px; border-radius: 8px;
        box-shadow: 0 8px 28px rgba(15,20,30,0.35);
        display: grid; gap: 8px; max-width: 360px;
        font: 500 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
      .title { font-weight: 700; color: #fafbfc; font-size: 13px; }
      .list { color: #c8ced7; font-size: 12px; line-height: 1.45; }
      .actions { display: flex; gap: 8px; }
      .btn {
        background: #DA7756; color: #fff; border: 0;
        padding: 6px 12px; border-radius: 4px; cursor: pointer;
        font: 600 12px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        transition: background 150ms ease;
      }
      .btn:hover { background: #c86a4a; }
      .btn.alt { background: transparent; color: #c8ced7; border: 1px solid rgba(200,206,215,0.35); }
      .btn.alt:hover { background: rgba(200,206,215,0.08); color: #fafbfc; }
      .close { background: none; border: 0; color: #9aa4b8; cursor: pointer; padding: 0 2px; font-size: 16px; line-height: 1; }
      @keyframes enter {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .card { animation: enter 250ms cubic-bezier(0.22, 1, 0.36, 1); }
      @media (prefers-reduced-motion: reduce) { .card { animation: none; } }
    </style>
    <div class="card" role="alert" aria-live="polite">
      <div class="head">
        <span class="title">⚠ ${hits.length} dark pattern${hits.length === 1 ? "" : "s"} detected</span>
        <button type="button" class="close" data-close aria-label="Dismiss">×</button>
      </div>
      <div class="list">${escapeHtml(patternList)}</div>
      <div class="actions">
        <button type="button" class="btn" data-open>See details</button>
        <button type="button" class="btn alt" data-close>Dismiss</button>
      </div>
    </div>
  `;
  document.body.append(host);
  shadow.querySelectorAll<HTMLElement>("[data-close]").forEach((el) =>
    el.addEventListener("click", (e) => {
      e.preventDefault();
      host.remove();
    }),
  );
  shadow.querySelector<HTMLButtonElement>("[data-open]")!.addEventListener("click", () => {
    onOpen?.();
    host.remove();
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function groupBy<T>(xs: T[], key: (x: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    const v = out.get(k);
    if (v) v.push(x); else out.set(k, [x]);
  }
  return out;
}
