// F1 — handle the /auth/callback URL by posting the token to /auth/verify.

import { verifyToken, refreshSession } from "./session.js";

export async function runCallbackIfPresent(): Promise<void> {
  const url = new URL(window.location.href);
  if (url.pathname !== "/auth/callback") return;
  const token = url.searchParams.get("t");
  if (!token) return;

  const shell = document.createElement("div");
  shell.style.cssText = "padding:40px 24px;max-width:480px;margin:80px auto 0;text-align:center;font:15px/1.55 -apple-system,sans-serif;";
  shell.innerHTML = `<h2 style="margin:0 0 12px;">Signing you in…</h2><p style="color:#6a7488;">Verifying your magic link.</p>`;
  document.body.innerHTML = "";
  document.body.append(shell);

  const r = await verifyToken(token);
  if (r.ok) {
    await refreshSession();
    // Replace URL (strip token) and redirect to home.
    window.history.replaceState({}, "", "/");
    window.location.href = "/";
  } else {
    shell.innerHTML = `
      <h2 style="margin:0 0 12px;color:#b13b30;">Sign-in failed</h2>
      <p style="color:#4a5260;">${r.error ?? "Your link may have expired or already been used."}</p>
      <p><a href="/">Back to Lens</a></p>
    `;
  }
}
