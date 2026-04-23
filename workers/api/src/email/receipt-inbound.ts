// VISION #21 — Inbound receipt forwarder.
// Originally scoped as `lens+receipts@…` via Cloudflare Email Routing, which
// needs DNS config. This endpoint is the parallel HTTP path: any 3rd-party
// tool (Zapier, Make.com, Shortcuts, a manual curl from a Gmail filter) can
// POST a parsed-or-raw email body and Lens persists it as a purchase row.
//
// Shape — either of:
//   { from: string, subject: string, date?: string, snippet?: string,
//     product?: string, priceCents?: number, retailer?: string,
//     rawBody?: string (optional, first 32KB kept) }
//   — or — application/json { emailJson: <any> } proxying a Zapier webhook.
//
// The endpoint is authed — we require either a signed-in session cookie
// (cookie → userId) or a bearer token (`x-lens-receipt-token`) that the user
// configures in their preferences. If neither is present we refuse.

import type { Context } from "hono";

interface Env {
  LENS_D1?: D1Database;
  LENS_RECEIPT_TOKEN?: string;
}

interface ReceiptPayload {
  from?: string;
  subject?: string;
  date?: string;
  snippet?: string;
  product?: string;
  priceCents?: number;
  retailer?: string;
  rawBody?: string;
  emailJson?: Record<string, unknown>;
}

export async function handleReceiptInbound(c: Context<{ Bindings: Env }>): Promise<Response> {
  const env = c.env;
  if (!env.LENS_D1) return c.json({ error: "bootstrapping" }, 503);

  // Auth: session cookie OR shared bearer token.
  const userId = (c.get("userId" as never) as string | undefined) ?? null;
  const bearer = c.req.header("x-lens-receipt-token");
  const tokenOk = !!bearer && !!env.LENS_RECEIPT_TOKEN && bearer === env.LENS_RECEIPT_TOKEN;
  if (!userId && !tokenOk) {
    return c.json({ error: "auth_required", hint: "session cookie or x-lens-receipt-token" }, 401);
  }

  let body: ReceiptPayload;
  try {
    body = (await c.req.json()) as ReceiptPayload;
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const from = (body.from ?? "").trim();
  const subject = (body.subject ?? "").trim();
  if (!subject && !body.product) {
    return c.json({ error: "missing_fields", need: "subject or product" }, 400);
  }

  const productName = (body.product ?? subject).slice(0, 200);
  const retailer = (body.retailer ?? extractRetailer(from)).slice(0, 80);
  const purchasedAt = parseDate(body.date);
  const payload = {
    from,
    subject,
    date: body.date ?? null,
    snippet: body.snippet ?? null,
    product: body.product ?? null,
    priceCents: body.priceCents ?? null,
    emailJson: body.emailJson ?? null,
    rawBody: body.rawBody ? body.rawBody.slice(0, 32_000) : null,
  };

  try {
    await env.LENS_D1.prepare(
      `INSERT OR IGNORE INTO purchases (user_id, product_name, retailer, purchased_at, price_cents, raw_payload_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(
      userId ?? "receipt-forwarder",
      productName,
      retailer,
      purchasedAt,
      body.priceCents ?? null,
      JSON.stringify(payload).slice(0, 32_000),
    ).run();
  } catch (err) {
    return c.json({ error: "db_failure", message: (err as Error).message }, 500);
  }

  return c.json({
    ok: true,
    received: { product: productName, retailer, purchased_at: purchasedAt },
  });
}

function extractRetailer(from: string): string {
  const m = from.match(/@([a-z0-9.-]+)/i);
  if (!m) return "unknown";
  return m[1]!.replace(/\.com$/i, "").replace(/^www\./, "");
}

function parseDate(d?: string): string {
  if (!d) return new Date().toISOString().slice(0, 19);
  const t = Date.parse(d);
  if (Number.isNaN(t)) return new Date().toISOString().slice(0, 19);
  return new Date(t).toISOString().slice(0, 19);
}
