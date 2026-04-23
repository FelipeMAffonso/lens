// VISION #23 — Drafted-letter outbound.
// Takes a filled intervention letter (subject + body, usually produced by
// lens.intervention_draft or /returns/draft) and dispatches it via Resend
// to a user-specified recipient. Logs the send in the `interventions`
// table so the user can see "1 filed, awaiting response, 7 days" in the
// dashboard (per VISION-COMPLETE §6).
//
// Auth: requires a signed-in session (cookie → userId). No anonymous sends.
// Transport: Resend. If RESEND_API_KEY is not set we return 503 with a
// hint that the operator needs to configure it.
//
// Body shape:
//   { to: string,           // recipient email
//     subject: string,
//     body: string,         // plain text or markdown; we'll wrap HTML
//     packSlug?: string,    // e.g. 'intervention/file-ftc-complaint'
//     meta?: Record<string, unknown>  // order id, vendor, purchase_id, ...
//   }
//
// Behaviour:
//   - Refuses if missing any of to / subject / body
//   - Renders the plain-text body into a simple HTML wrapper so the
//     letter reads well in Gmail / Outlook
//   - Persists an intervention row with status='sent' + outbound JSON
//   - Returns { ok, interventionId, sentAt }

import type { Context } from "hono";

interface Env {
  LENS_D1?: D1Database;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
}

interface SendPayload {
  to?: string;
  subject?: string;
  body?: string;
  packSlug?: string;
  meta?: Record<string, unknown>;
}

export async function handleInterventionSend(c: Context<{ Bindings: Env }>): Promise<Response> {
  const env = c.env;
  const userId = (c.get("userId" as never) as string | undefined) ?? null;
  if (!userId) return c.json({ error: "auth_required" }, 401);

  let body: SendPayload;
  try {
    body = (await c.req.json()) as SendPayload;
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const to = (body.to ?? "").trim();
  const subject = (body.subject ?? "").trim();
  const text = (body.body ?? "").trim();
  if (!to || !subject || !text) {
    return c.json({ error: "missing_fields", need: "to, subject, body" }, 400);
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return c.json({ error: "invalid_to_address" }, 400);
  }

  if (!env.RESEND_API_KEY) {
    return c.json(
      { error: "resend_not_configured", hint: "operator must set RESEND_API_KEY secret" },
      503,
    );
  }

  const from = env.RESEND_FROM_EMAIL ?? "Lens <noreply@lens.webmarinelli.com>";
  const html = renderHtml(subject, text);

  let sendRes: { ok: boolean; status: number; body: unknown };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
        html,
      }),
    });
    const resBody = await res.json().catch(() => null);
    sendRes = { ok: res.ok, status: res.status, body: resBody };
  } catch (err) {
    return c.json({ error: "resend_failure", message: (err as Error).message }, 502);
  }

  if (!sendRes.ok) {
    return c.json({ error: "resend_rejected", status: sendRes.status, body: sendRes.body }, 502);
  }

  // Persist intervention record.
  if (env.LENS_D1) {
    try {
      await env.LENS_D1.prepare(
        `INSERT INTO interventions (user_id, pack_slug, to_address, subject, body_preview, status, meta_json, created_at, sent_at)
         VALUES (?, ?, ?, ?, ?, 'sent', ?, datetime('now'), datetime('now'))`,
      ).bind(
        userId,
        body.packSlug ?? null,
        to,
        subject.slice(0, 200),
        text.slice(0, 1000),
        JSON.stringify({ meta: body.meta ?? null, resend: sendRes.body }).slice(0, 16_000),
      ).run();
    } catch {
      // Non-fatal: email sent even if DB log failed.
    }
  }

  return c.json({
    ok: true,
    sentAt: new Date().toISOString(),
    resend: (sendRes.body as { id?: string })?.id ?? null,
  });
}

function renderHtml(subject: string, text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px 0;">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
  return `<!doctype html>
<html>
  <body style="font-family: 'Source Serif 4', Georgia, serif; max-width: 640px; margin: 0 auto; padding: 24px; color: #1a1a1a; background: #faf9f5;">
    <div style="font-size: 12px; color: #6e6c66; border-bottom: 1px solid #e3dfd4; padding-bottom: 12px; margin-bottom: 20px;">
      Sent via Lens · Consumer-welfare agent · <a href="https://lens-b1h.pages.dev" style="color: #CC785C; text-decoration: none;">lens-b1h.pages.dev</a>
    </div>
    <h2 style="font-size: 20px; font-weight: 600; margin: 0 0 14px 0;">${escape(subject)}</h2>
    ${paragraphs}
    <div style="font-size: 11px; color: #888; border-top: 1px dashed #e3dfd4; margin-top: 24px; padding-top: 12px;">
      This letter was drafted from a public-record consumer-protection template and reviewed by the sender before dispatch. Lens is an independent welfare agent; no affiliate relationship with any party exists.
    </div>
  </body>
</html>`;
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
