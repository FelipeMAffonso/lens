// F1 — minimal vanilla-TS sign-in modal. Opens from the top-nav "Sign in" button.

import { requestSignIn } from "./session.js";

export function openSignInModal(): void {
  const existing = document.getElementById("lens-signin-modal");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "lens-signin-modal";
  overlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(15,20,30,0.45); z-index: 999;
    display: flex; align-items: center; justify-content: center; padding: 20px;
  `;

  overlay.innerHTML = `
    <div role="dialog" aria-labelledby="lens-signin-title" aria-modal="true" style="
      background: var(--surface, #fff); color: var(--fg, #1a1a1a);
      border: 1px solid var(--border, #e5e8ec); border-radius: 4px;
      padding: 28px 26px; max-width: 420px; width: 100%;
      box-shadow: 0 8px 28px rgba(15,20,30,0.18); font: 15px/1.55 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    ">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:12px;">
        <h2 id="lens-signin-title" style="margin:0;font-size:20px;letter-spacing:-0.015em;">Sign in to Lens</h2>
        <button type="button" id="lens-signin-close" aria-label="Close" style="background:none;border:0;font-size:22px;color:var(--fg-muted,#6a7488);cursor:pointer;line-height:1;">×</button>
      </div>
      <p style="margin:0 0 18px;color:var(--fg-dim,#4a5260);font-size:14px;">
        Signing in syncs your audit history and preferences across devices.
        We'll email you a one-time sign-in link — no password.
      </p>
      <form id="lens-signin-form" style="display:grid;gap:12px;">
        <label style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:var(--fg-muted,#6a7488);font-weight:600;">Email</label>
        <input type="email" id="lens-signin-email" required autocomplete="email" placeholder="you@example.com" style="
          width:100%;padding:11px 13px;border:1px solid var(--border,#e5e8ec);border-radius:4px;font:inherit;
        " />
        <button type="submit" id="lens-signin-submit" style="
          background: var(--accent,#DA7756); color:#fff; border:0;
          padding:11px 18px;border-radius:4px;font-weight:600;cursor:pointer;font:inherit;
        ">Send sign-in link</button>
      </form>
      <p id="lens-signin-status" style="margin:14px 0 0;font-size:13px;color:var(--fg-dim,#4a5260);"></p>
      <p style="margin:20px 0 0;font-size:11px;color:var(--fg-muted,#6a7488);border-top:1px solid var(--border,#e5e8ec);padding-top:14px;">
        No password ever. We send one magic-link per request; it expires in 15 minutes.
        See <a href="/privacy.html" style="color:inherit;">privacy notice</a>.
      </p>
    </div>
  `;

  document.body.append(overlay);

  const close = (): void => overlay.remove();
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.querySelector<HTMLButtonElement>("#lens-signin-close")!.addEventListener("click", close);
  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); }
  });

  const form = overlay.querySelector<HTMLFormElement>("#lens-signin-form")!;
  const input = overlay.querySelector<HTMLInputElement>("#lens-signin-email")!;
  const submit = overlay.querySelector<HTMLButtonElement>("#lens-signin-submit")!;
  const status = overlay.querySelector<HTMLParagraphElement>("#lens-signin-status")!;
  input.focus();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = input.value.trim();
    if (!email) return;
    submit.disabled = true;
    submit.textContent = "Sending…";
    status.textContent = "";
    const r = await requestSignIn(email);
    submit.disabled = false;
    submit.textContent = "Send sign-in link";
    if (r.ok) {
      status.textContent = `Check ${email} for a sign-in link. (The link expires in 15 minutes.)`;
      status.style.color = "var(--good, #1f8c5b)";
    } else {
      status.textContent = `Couldn't send. ${r.error ?? "Try again."}`;
      status.style.color = "var(--error, #b13b30)";
    }
  });
}
