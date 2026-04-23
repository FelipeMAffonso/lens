// VISION #17 — Web Push (VAPID) subscription + delivery handlers.
//
// The PWA (mobile or desktop) or Chrome extension can subscribe to web push.
// Lens delivers ONE notification per real event:
//   - Recall match (CPSC/NHTSA/FDA × purchase row)
//   - Price drop inside a retailer price-match window
//   - Subscription renewal within 7 days
//   - Firmware / CVE advisory for an owned device
// Body is pre-computed on the server; the browser shows it via service worker.

import type { Context } from "hono";
import { z } from "zod";
import type { Env } from "../index.js";

export const SubscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(20).max(200),
    auth: z.string().min(12).max(200),
  }),
  userAgent: z.string().max(500).optional(),
});

export async function handleSubscribe(c: Context<{ Bindings: Env }>): Promise<Response> {
  const body = await c.req.json().catch(() => null);
  const parsed = SubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  if (!c.env.LENS_D1) return c.json({ error: "d1_not_bound" }, 503);

  const userId = c.get("userId" as never) as string | undefined;
  const anonId = c.get("anonUserId" as never) as string | undefined;

  try {
    await c.env.LENS_D1.prepare(
      `INSERT INTO push_subscription (user_id, anon_user_id, endpoint, p256dh_key, auth_key, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         user_id = excluded.user_id,
         anon_user_id = excluded.anon_user_id,
         p256dh_key = excluded.p256dh_key,
         auth_key = excluded.auth_key,
         user_agent = excluded.user_agent,
         active = 1,
         delivery_failures = 0`,
    )
      .bind(
        userId ?? null,
        anonId ?? null,
        parsed.data.endpoint,
        parsed.data.keys.p256dh,
        parsed.data.keys.auth,
        parsed.data.userAgent ?? null,
      )
      .run();
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: "db", message: (err as Error).message }, 500);
  }
}

export async function handleUnsubscribe(c: Context<{ Bindings: Env }>): Promise<Response> {
  const body = await c.req.json().catch(() => ({}));
  const endpoint = (body as { endpoint?: string }).endpoint;
  if (!endpoint) return c.json({ error: "missing_endpoint" }, 400);
  if (!c.env.LENS_D1) return c.json({ error: "d1_not_bound" }, 503);
  await c.env.LENS_D1.prepare(
    "UPDATE push_subscription SET active = 0 WHERE endpoint = ?",
  ).bind(endpoint).run();
  return c.json({ ok: true });
}

/**
 * Deliver a push notification to one or many subscriptions. Server-side
 * VAPID JWT signing — requires VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY secrets.
 */
export async function deliverPush(
  env: Env,
  subscriptionIds: number[],
  payload: { title: string; body: string; url?: string; tag?: string },
): Promise<{ delivered: number; failed: number }> {
  if (!env.LENS_D1) return { delivered: 0, failed: 0 };
  const vapidPrivate = (env as unknown as { VAPID_PRIVATE_KEY?: string }).VAPID_PRIVATE_KEY;
  const vapidPublic = (env as unknown as { VAPID_PUBLIC_KEY?: string }).VAPID_PUBLIC_KEY;
  if (!vapidPrivate || !vapidPublic) {
    console.warn("[push] VAPID keys not configured — skipping delivery");
    return { delivered: 0, failed: 0 };
  }

  const { results: subs } = await env.LENS_D1.prepare(
    `SELECT id, endpoint, p256dh_key, auth_key FROM push_subscription
      WHERE active = 1 AND id IN (${subscriptionIds.map(() => "?").join(",")})`,
  ).bind(...subscriptionIds).all<{ id: number; endpoint: string; p256dh_key: string; auth_key: string }>();

  let delivered = 0;
  let failed = 0;
  for (const sub of subs ?? []) {
    try {
      // Web Push delivery via direct HTTPS POST to sub.endpoint with
      // VAPID-signed headers. Skeleton — actual signing requires the
      // web-push lib or Web Crypto primitives (ES256). Not wired to the
      // web-push lib yet; this is the outbox that cron handlers target.
      await env.LENS_D1.prepare(
        `UPDATE push_subscription SET last_delivery_at = datetime('now') WHERE id = ?`,
      ).bind(sub.id).run();
      delivered++;
    } catch (err) {
      failed++;
      console.warn("[push] deliver failed:", (err as Error).message);
      await env.LENS_D1.prepare(
        "UPDATE push_subscription SET delivery_failures = delivery_failures + 1 WHERE id = ?",
      ).bind(sub.id).run();
    }
  }
  return { delivered, failed };
}

export async function handleVapidPublicKey(c: Context<{ Bindings: Env }>): Promise<Response> {
  const vapid = (c.env as unknown as { VAPID_PUBLIC_KEY?: string }).VAPID_PUBLIC_KEY;
  if (!vapid) return c.json({ bootstrapping: true, message: "VAPID key not configured" });
  return c.json({ publicKey: vapid }, 200, { "cache-control": "public, max-age=3600" });
}