// CJ-W53 — speech-bubble DOM helpers.

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

// Render **bold** markers from the Study 3 tradeoff pattern into <strong>.
// Nothing else is allowed (no italic, no links, no html). Keeps bot output safe.
// Judge P0-5: only apply bold when `**` count is even, so a stray unbalanced
// marker ("**really important") leaves clean text rather than a broken <strong>.
function renderBoldOnly(s: string): string {
  const esc = escapeHtml(s);
  const starCount = (esc.match(/\*\*/g) ?? []).length;
  if (starCount % 2 !== 0) return esc.replace(/\*\*/g, "");
  return esc.replace(/\*\*([^*]+)\*\*/g, (_m, inner: string) => `<strong>${inner}</strong>`);
}

export function userBubble(text: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "lc-bubble lc-bubble-user";
  el.setAttribute("role", "article");
  el.setAttribute("aria-label", "You said");
  el.innerHTML = `<div class="lc-bubble-body">${escapeHtml(text)}</div>`;
  return el;
}

export function botBubble(text: string, opts: { live?: boolean } = {}): HTMLElement {
  const el = document.createElement("div");
  el.className = "lc-bubble lc-bubble-bot";
  if (opts.live) {
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
  } else {
    el.setAttribute("role", "article");
    el.setAttribute("aria-label", "Lens said");
  }
  el.innerHTML = `<div class="lc-bubble-body">${renderBoldOnly(text)}</div>`;
  return el;
}

export function typingBubble(): HTMLElement {
  const el = document.createElement("div");
  el.className = "lc-bubble lc-bubble-bot lc-bubble-typing";
  el.setAttribute("role", "status");
  el.setAttribute("aria-label", "Lens is thinking");
  el.innerHTML = `
    <div class="lc-bubble-body">
      <span class="lc-dot"></span><span class="lc-dot"></span><span class="lc-dot"></span>
    </div>
  `;
  return el;
}
