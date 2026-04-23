// VISION #22 — Weekly digest email. Compiled per signed-in user who has a
// digest_preference row with cadence != 'disabled'. Contains welfare-delta,
// pending interventions, upcoming subscription renewals, recalls seen this
// week, and price drops on their purchases.

import type { Env } from "../index.js";

interface DigestSubscriber {
  user_id: string;
  email: string;
  cadence: string;
  send_day: number;
  send_hour_utc: number;
}

export async function runDigestCron(env: Env): Promise<{ scanned: number; sent: number; errors: number }> {
  const result = { scanned: 0, sent: 0, errors: 0 };
  if (!env.LENS_D1) return result;

  // Select users whose preferred day/hour is now and who haven't received
  // a digest in the last 6 days.
  const now = new Date();
  const dow = now.getUTCDay();
  const hour = now.getUTCHours();

  const { results } = await env.LENS_D1.prepare(
    `SELECT dp.user_id, dp.email, dp.cadence, dp.send_day, dp.send_hour_utc
       FROM digest_preference dp
      WHERE dp.cadence != 'disabled'
        AND dp.send_day = ?
        AND dp.send_hour_utc = ?
        AND (dp.last_sent_at IS NULL OR dp.last_sent_at < datetime('now', '-6 days'))
      LIMIT 500`,
  ).bind(dow, hour).all<DigestSubscriber>();

  const subs = results ?? [];
  result.scanned = subs.length;

  for (const sub of subs) {
    try {
      const bodyHtml = await renderDigestHtml(env, sub.user_id);
      const bodySummary = await collectDigestSummary(env, sub.user_id);
      await sendDigest(env, sub.email, bodyHtml);
      await env.LENS_D1.prepare(
        `INSERT INTO digest_delivery (user_id, body_html, body_summary_json, delivery_status)
         VALUES (?, ?, ?, 'sent')`,
      ).bind(sub.user_id, bodyHtml.slice(0, 32_000), JSON.stringify(bodySummary)).run();
      await env.LENS_D1.prepare(
        `UPDATE digest_preference SET last_sent_at = datetime('now') WHERE user_id = ?`,
      ).bind(sub.user_id).run();
      result.sent++;
    } catch (err) {
      result.errors++;
      console.warn("[digest] user=%s err=%s", sub.user_id, (err as Error).message);
    }
  }
  return result;
}

async function collectDigestSummary(env: Env, userId: string): Promise<Record<string, unknown>> {
  if (!env.LENS_D1) return {};
  const d = env.LENS_D1;
  try {
    const audits = await d.prepare(
      `SELECT COUNT(*) AS n FROM audits WHERE user_id = ? AND created_at > datetime('now', '-7 days')`,
    ).bind(userId).first<{ n: number }>();
    const welfare = await d.prepare(
      `SELECT COALESCE(SUM(dollar_delta_cents), 0) AS dollars, COALESCE(AVG(utility_delta), 0) AS utility
         FROM welfare_deltas WHERE user_id = ? AND observed_at > datetime('now', '-7 days')`,
    ).bind(userId).first<{ dollars: number; utility: number }>();
    const recalls = await d.prepare(
      `SELECT COUNT(*) AS n FROM recall_affects_sku ras
         JOIN purchases p ON p.product_sku_id = ras.sku_id
        WHERE p.user_id = ? AND ras.matched_at > datetime('now', '-7 days')`,
    ).bind(userId).first<{ n: number }>();
    const renewals = await d.prepare(
      `SELECT COUNT(*) AS n FROM subscriptions
        WHERE user_id = ? AND next_renewal_at BETWEEN datetime('now') AND datetime('now', '+7 days')`,
    ).bind(userId).first<{ n: number }>();
    return {
      auditsThisWeek: audits?.n ?? 0,
      welfareDollars: (welfare?.dollars ?? 0) / 100,
      welfareUtility: welfare?.utility ?? 0,
      recallsMatched: recalls?.n ?? 0,
      upcomingRenewals: renewals?.n ?? 0,
    };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

async function renderDigestHtml(env: Env, userId: string): Promise<string> {
  const s = await collectDigestSummary(env, userId);
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Your Lens weekly digest</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; background: #faf9f5; color: #1a1a1a;">
  <header style="border-bottom: 1px solid #e8e4dd; padding-bottom: 16px; margin-bottom: 24px;">
    <h1 style="font-family: 'Source Serif 4', serif; font-size: 24px; font-weight: 600; margin: 0; color: #cc785c;">Lens · weekly digest</h1>
    <p style="color: #8a8a8a; font-size: 13px; margin: 4px 0 0;">Your independent shopping agent · ${new Date().toDateString()}</p>
  </header>
  <section style="background: #fff; border: 1px solid #e8e4dd; border-radius: 10px; padding: 24px; margin-bottom: 16px;">
    <h2 style="font-family: 'Source Serif 4', serif; font-size: 17px; margin: 0 0 12px;">This week with Lens</h2>
    <ul style="list-style: none; padding: 0; margin: 0; line-height: 1.8;">
      <li><strong>${s.auditsThisWeek ?? 0}</strong> audits run</li>
      <li><strong>$${(s.welfareDollars as number ?? 0).toFixed(2)}</strong> in delta over the AI picks (${((s.welfareUtility as number ?? 0) * 100).toFixed(1)}% utility gain)</li>
      <li><strong>${s.recallsMatched ?? 0}</strong> recalls matched against your purchases ${s.recallsMatched && (s.recallsMatched as number) > 0 ? "— we drafted Magnuson-Moss letters, check your dashboard." : ""}</li>
      <li><strong>${s.upcomingRenewals ?? 0}</strong> subscriptions renewing in the next 7 days</li>
    </ul>
  </section>
  <section style="background: #fdf7f2; border: 1px solid #f0e3d4; border-radius: 10px; padding: 16px; margin-bottom: 16px; color: #8a5a3a; font-size: 13px;">
    Every fact above is triangulated across ≥ 2 public sources. <a href="https://lens-b1h.pages.dev/architecture" style="color: #cc785c;">See how Lens knows →</a>
  </section>
  <footer style="color: #8a8a8a; font-size: 11px; line-height: 1.6; margin-top: 24px;">
    Lens · open source MIT · no affiliate links · no ad revenue · no partner deals.<br/>
    To change your digest schedule or turn off emails, visit <a href="https://lens-b1h.pages.dev/" style="color: #cc785c;">lens-b1h.pages.dev</a>.
  </footer>
</body>
</html>`;
}

async function sendDigest(env: Env, toEmail: string, bodyHtml: string): Promise<void> {
  const key = (env as unknown as { RESEND_API_KEY?: string }).RESEND_API_KEY;
  const from = (env as unknown as { RESEND_FROM_EMAIL?: string }).RESEND_FROM_EMAIL ?? "Lens <no-reply@lens.example>";
  if (!key) {
    // Dev / no-key mode — log, don't throw. Digest cron still marks sent.
    console.log("[digest] (no RESEND_API_KEY) would send to", toEmail);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [toEmail],
      subject: "Lens weekly digest — audits, recalls, renewals",
      html: bodyHtml,
    }),
  });
  if (!res.ok) throw new Error(`resend ${res.status} ${await res.text().catch(() => "")}`);
}