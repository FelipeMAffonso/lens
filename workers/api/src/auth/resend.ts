// F1 — Resend email client for magic-link delivery.
// Uses the plain Resend HTTP API; no SDK dependency.
//
// When RESEND_API_KEY is absent (local dev, or production before the secret is
// set), we fall back to logging the magic link to the Worker console so tests
// and local flows can still complete.

export interface SendMagicLinkParams {
  email: string;
  magicLinkUrl: string;
  apiKey?: string | undefined;
  fromAddress?: string | undefined;
}

export interface SendResult {
  ok: boolean;
  via: "resend" | "console";
  error?: string;
}

const SUBJECT = "Sign in to Lens";

function renderText(url: string): string {
  return [
    "Click this link to sign in. It expires in 15 minutes.",
    "",
    url,
    "",
    "If you didn't request this, ignore this email — nothing happens without clicking.",
    "— Lens, the consumer's independent shopping agent",
  ].join("\n");
}

function renderHtml(url: string): string {
  return `<!doctype html><html><body style="font:15px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a1a;background:#fafbfc;padding:40px 24px;">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e8ec;border-radius:8px;padding:32px;">
  <h1 style="font-size:20px;margin:0 0 16px;letter-spacing:-0.01em;">Sign in to Lens</h1>
  <p style="color:#4a5260;margin:0 0 20px;">Click the button below to sign in. The link expires in 15 minutes.</p>
  <p style="margin:0 0 20px;"><a href="${escapeHtml(url)}" style="display:inline-block;background:#DA7756;color:#fff;text-decoration:none;padding:12px 20px;border-radius:4px;font-weight:600;">Sign in</a></p>
  <p style="color:#6a7488;font-size:13px;margin:0;">If the button doesn't work, paste this link into your browser: <br/><code style="word-break:break-all;">${escapeHtml(url)}</code></p>
  <p style="color:#6a7488;font-size:12px;margin:24px 0 0;border-top:1px solid #e5e8ec;padding-top:16px;">If you didn't request this, ignore this email. Nothing happens without clicking. — Lens, the consumer's independent shopping agent.</p>
</div></body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export async function sendMagicLink(params: SendMagicLinkParams): Promise<SendResult> {
  const { email, magicLinkUrl, apiKey, fromAddress } = params;
  if (!apiKey) {
    console.log(`[auth:magic-link] (no RESEND_API_KEY) ${email} -> ${magicLinkUrl}`);
    return { ok: true, via: "console" };
  }
  const from = fromAddress ?? "Lens <no-reply@lens.example>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: SUBJECT,
        text: renderText(magicLinkUrl),
        html: renderHtml(magicLinkUrl),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[auth:magic-link] resend failed ${res.status}: ${body.slice(0, 200)}`);
      return { ok: false, via: "resend", error: `${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true, via: "resend" };
  } catch (e) {
    return { ok: false, via: "resend", error: (e as Error).message };
  }
}
