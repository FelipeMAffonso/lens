// F12 — Gmail OAuth endpoint handlers.

import type { Context } from "hono";
import { buildAuthorizeUrl, exchangeCode, type GmailOAuthEnv } from "./oauth.js";
import { upsertToken } from "./tokens.js";

export async function handleAuthorize(c: Context): Promise<Response> {
  const env = c.env as GmailOAuthEnv;
  if (!env.GMAIL_OAUTH_CLIENT_ID) {
    return c.json(
      {
        error: "oauth_unconfigured",
        message:
          "GMAIL_OAUTH_CLIENT_ID not set. Run: wrangler secret put GMAIL_OAUTH_CLIENT_ID (value from https://console.cloud.google.com/apis/credentials).",
      },
      503,
    );
  }
  const userId = (c.get("userId") as string | undefined) ?? "";
  const anonUserId = (c.get("anonUserId") as string | undefined) ?? "anon";
  const stateSeed = userId || anonUserId;
  const { url, state } = buildAuthorizeUrl(env, stateSeed);
  if (!url) return c.json({ error: "oauth_unconfigured" }, 503);
  // Store state in a short-lived cookie so the callback can verify.
  c.header(
    "set-cookie",
    `lens_oauth_state=${encodeURIComponent(state)}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
  );
  return c.redirect(url, 302);
}

export async function handleCallback(c: Context): Promise<Response> {
  const env = c.env as GmailOAuthEnv & { LENS_D1?: unknown };
  const code = c.req.query("code");
  const stateFromQuery = c.req.query("state");
  const err = c.req.query("error");
  if (err) return c.json({ error: "oauth_denied", detail: err }, 400);
  if (!code || !stateFromQuery) return c.json({ error: "missing_code_or_state" }, 400);

  const cookieHeader = c.req.header("cookie") ?? "";
  const stateCookie = cookieHeader
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith("lens_oauth_state="));
  const storedState = stateCookie
    ? decodeURIComponent(stateCookie.slice("lens_oauth_state=".length))
    : "";
  if (storedState !== stateFromQuery) {
    return c.json({ error: "state_mismatch" }, 400);
  }

  const exchange = await exchangeCode(env, code);
  if (!exchange.ok || !exchange.tokens) {
    return c.json({ error: "exchange_failed", detail: exchange.error }, 500);
  }

  const userId = (c.get("userId") as string | undefined) ?? stateFromQuery.split(".")[0] ?? "";
  if (!userId) return c.json({ error: "no_user_context" }, 400);

  const expiresAt = new Date(Date.now() + exchange.tokens.expires_in * 1000).toISOString();
  try {
    await upsertToken(env.LENS_D1 as never, {
      user_id: userId,
      provider: "gmail",
      access_token: exchange.tokens.access_token,
      ...(exchange.tokens.refresh_token !== undefined
        ? { refresh_token: exchange.tokens.refresh_token }
        : { refresh_token: null }),
      scopes: exchange.tokens.scope,
      expires_at: expiresAt,
    });
  } catch (e) {
    return c.json({ error: "store_failed", detail: (e as Error).message }, 500);
  }

  // Redirect to web dashboard with a success flag.
  const redirectBase =
    (env as unknown as { MAGIC_LINK_BASE_URL?: string }).MAGIC_LINK_BASE_URL ?? "https://lens-b1h.pages.dev";
  return c.redirect(`${redirectBase}/?gmail=connected`, 302);
}
