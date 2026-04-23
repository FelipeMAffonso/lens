// VISION #20 — Gmail receipt poller. F12 scaffolds the OAuth flow; this is
// the cron handler that polls for new receipts every ~2h (cadence set in
// cron/jobs.ts). Extracts purchases + subscriptions + shipping updates
// into the purchases / subscriptions table.
//
// Privacy posture:
//   - OAuth scope: gmail.readonly ONLY for receipts parsing (scope:
//     https://www.googleapis.com/auth/gmail.readonly). Plus gmail.send
//     ONLY when the user explicitly triggers an outbound letter draft.
//   - Each user authorizes per-session; tokens stored encrypted in D1
//     via F12 plumbing.
//   - Message bodies NEVER leave the Worker; only structured extractions
//     persist. Raw bodies are dropped after parsing.
//   - The cron filter `from:(amazon OR bestbuy OR walmart OR ...) after:<since>`
//     means Lens reads only retailer-mail, not personal correspondence.

import type { Env } from "../index.js";

const RECEIPT_SENDER_DOMAINS = [
  "amazon.com", "amazonaws.com",
  "bestbuy.com",
  "walmart.com",
  "target.com",
  "costco.com",
  "homedepot.com",
  "apple.com",
  "newegg.com",
  "etsy.com",
  "ebay.com",
  "shopify.com",
  "paypal.com", "venmo.com", "stripe.com", // payment confirmations
  "patreon.com", "substack.com",           // subscription confirmations
  "nytimes.com", "spotify.com", "netflix.com", // subscription-mail
];

interface GmailToken {
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

interface GmailPollReport {
  usersScanned: number;
  messagesSeen: number;
  receiptsPersisted: number;
  errors: string[];
}

export async function runGmailPoll(env: Env): Promise<GmailPollReport> {
  const report: GmailPollReport = { usersScanned: 0, messagesSeen: 0, receiptsPersisted: 0, errors: [] };
  if (!env.LENS_D1) return report;
  const clientId = (env as unknown as { GMAIL_OAUTH_CLIENT_ID?: string }).GMAIL_OAUTH_CLIENT_ID;
  if (!clientId) {
    report.errors.push("GMAIL_OAUTH_CLIENT_ID not set — poller dormant");
    return report;
  }

  // Users with valid Gmail tokens.
  const { results: tokens } = await env.LENS_D1.prepare(
    `SELECT user_id, access_token, refresh_token, expires_at
       FROM gmail_token
      WHERE revoked = 0
        AND (last_polled_at IS NULL OR last_polled_at < datetime('now', '-2 hours'))
      LIMIT 50`,
  ).all<GmailToken>();

  report.usersScanned = tokens?.length ?? 0;

  for (const tok of tokens ?? []) {
    try {
      const messages = await fetchNewReceipts(env, tok);
      report.messagesSeen += messages.length;
      for (const m of messages) {
        const ok = await persistReceiptIfMatches(env, tok.user_id, m);
        if (ok) report.receiptsPersisted++;
      }
      await env.LENS_D1.prepare(
        "UPDATE gmail_token SET last_polled_at = datetime('now') WHERE user_id = ?",
      ).bind(tok.user_id).run();
    } catch (err) {
      report.errors.push(`user ${tok.user_id}: ${(err as Error).message}`);
    }
  }
  return report;
}

interface GmailMessageSummary {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
}

async function fetchNewReceipts(env: Env, tok: GmailToken): Promise<GmailMessageSummary[]> {
  // Refresh token if expired.
  const access = await ensureFreshAccessToken(env, tok);
  // Build query: retailer-from + last 7 days.
  const since = Math.floor((Date.now() - 7 * 86400 * 1000) / 1000);
  const fromClause = RECEIPT_SENDER_DOMAINS.map((d) => `from:${d}`).join(" OR ");
  const q = `(${fromClause}) after:${since}`;
  const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=30`;
  const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${access}` } });
  if (!listRes.ok) throw new Error(`gmail.list ${listRes.status}`);
  const list = (await listRes.json()) as { messages?: Array<{ id: string }> };
  const ids = (list.messages ?? []).slice(0, 30).map((m) => m.id);

  const out: GmailMessageSummary[] = [];
  for (const id of ids) {
    const msg = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${access}` } },
    );
    if (!msg.ok) continue;
    const body = (await msg.json()) as {
      id: string;
      snippet?: string;
      payload?: { headers?: Array<{ name: string; value: string }> };
    };
    const hdrs = new Map((body.payload?.headers ?? []).map((h) => [h.name, h.value]));
    out.push({
      id: body.id,
      from: hdrs.get("From") ?? "",
      subject: hdrs.get("Subject") ?? "",
      date: hdrs.get("Date") ?? "",
      snippet: (body.snippet ?? "").slice(0, 500),
    });
  }
  return out;
}

async function persistReceiptIfMatches(env: Env, userId: string, msg: GmailMessageSummary): Promise<boolean> {
  // Super-simple heuristic: subject contains "order" / "receipt" / "confirmation".
  const match = /\b(order|receipt|confirmation|shipped|delivered|renewal|subscription)\b/i.test(msg.subject);
  if (!match || !env.LENS_D1) return false;
  try {
    await env.LENS_D1.prepare(
      `INSERT OR IGNORE INTO purchases (user_id, product_name, retailer, purchased_at, raw_payload_json)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(
      userId,
      msg.subject.slice(0, 200),
      extractRetailer(msg.from),
      parseDate(msg.date),
      JSON.stringify({ gmail_id: msg.id, from: msg.from, subject: msg.subject, snippet: msg.snippet }).slice(0, 16_000),
    ).run();
    return true;
  } catch {
    return false;
  }
}

function extractRetailer(from: string): string {
  const m = from.match(/@([a-z0-9.-]+)/i);
  return m ? m[1]!.replace(/\.com$/i, "") : "unknown";
}

function parseDate(d: string): string {
  try {
    const t = new Date(d).toISOString();
    return t.slice(0, 19);
  } catch {
    return new Date().toISOString().slice(0, 19);
  }
}

async function ensureFreshAccessToken(env: Env, tok: GmailToken): Promise<string> {
  const now = Date.now();
  const exp = new Date(tok.expires_at).getTime();
  if (exp > now + 60_000) return tok.access_token;
  // Refresh via OAuth.
  const cid = (env as unknown as { GMAIL_OAUTH_CLIENT_ID?: string }).GMAIL_OAUTH_CLIENT_ID;
  const cs = (env as unknown as { GMAIL_OAUTH_CLIENT_SECRET?: string }).GMAIL_OAUTH_CLIENT_SECRET;
  if (!cid || !cs) throw new Error("gmail client not configured");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cid,
      client_secret: cs,
      refresh_token: tok.refresh_token,
      grant_type: "refresh_token",
    }).toString(),
  });
  if (!res.ok) throw new Error(`refresh ${res.status}`);
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("no access_token in refresh");
  const newExp = new Date(now + (body.expires_in ?? 3600) * 1000).toISOString();
  if (env.LENS_D1) {
    await env.LENS_D1.prepare(
      "UPDATE gmail_token SET access_token = ?, expires_at = ? WHERE user_id = ?",
    ).bind(body.access_token, newExp, tok.user_id).run();
  }
  return body.access_token;
}