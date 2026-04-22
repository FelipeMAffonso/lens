// F1 — Magic-link auth endpoints: /auth/request, /auth/verify, /auth/whoami, /auth/signout.
//
// Depends on D1 tables `users`, `sessions`, `magic_tokens` from migrations/0001_auth.sql.
// When LENS_D1 binding is missing (pre-wrangler-login, local bootstrap), these
// endpoints return 503 with a friendly message so the rest of the API still
// runs unaffected.

import { z } from "zod";
import type { Context } from "hono";
import { buildSetCookie, makeSessionClaims, sha256Hex, signJwt } from "./session.js";
import { isValidAnonId } from "./anon.js";
import { sendMagicLink } from "./resend.js";

// ---------- types -----------------------------------------------------------

export interface AuthEnv {
  LENS_D1?: D1Database;
  JWT_SECRET?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  MAGIC_LINK_BASE_URL?: string;
  LENS_COOKIE_DOMAIN?: string;
}

export const RequestSchema = z.object({
  email: z.string().email().max(254),
  anonUserId: z.string().optional(),
});

export const VerifySchema = z.object({
  token: z.string().min(16).max(128),
  anonUserId: z.string().optional(),
  /** optional payload: anon-held local state to migrate on upgrade */
  localHistory: z.array(z.record(z.unknown())).max(500).optional(),
  localProfiles: z.record(z.record(z.unknown())).optional(),
});

interface UserRow {
  id: string;
  email: string;
  created_at: string;
  last_seen_at: string;
  anon_ref: string | null;
  display_name: string | null;
  tier: string;
}

// ---------- helpers ---------------------------------------------------------

/** ULID-light: 26 Crockford base32 chars, time-sortable. */
function ulid(): string {
  const BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let ts = BigInt(Date.now());
  const timeChars: string[] = [];
  for (let i = 0; i < 10; i++) {
    timeChars.push(BASE32[Number(ts & 31n)]!);
    ts >>= 5n;
  }
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let rand = 0n;
  for (const b of bytes) rand = (rand << 8n) | BigInt(b);
  const randChars: string[] = [];
  for (let i = 0; i < 16; i++) {
    randChars.push(BASE32[Number(rand & 31n)]!);
    rand >>= 5n;
  }
  return timeChars.reverse().join("") + randChars.reverse().join("");
}

function genRawToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function requireD1(env: AuthEnv): D1Database {
  if (!env.LENS_D1) {
    throw new HttpError(503, "auth_unavailable", "D1 binding not configured. Run `wrangler d1 create` + migrations first.");
  }
  return env.LENS_D1;
}

function requireSecret(env: AuthEnv): string {
  if (!env.JWT_SECRET) {
    throw new HttpError(503, "auth_unavailable", "JWT_SECRET not set. Run `wrangler secret put JWT_SECRET`.");
  }
  return env.JWT_SECRET;
}

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

// ---------- handlers --------------------------------------------------------

export async function handleRequest(c: Context<{ Bindings: AuthEnv }>): Promise<Response> {
  const body = await c.req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  const { email, anonUserId } = parsed.data;

  let db: D1Database;
  try {
    db = requireD1(c.env);
  } catch (e) {
    const err = e as HttpError;
    return c.json({ error: err.code, message: err.message }, err.status as 503);
  }

  const rawToken = genRawToken();
  const tokenHash = await sha256Hex(rawToken);
  const now = new Date();
  const expires = new Date(now.getTime() + 15 * 60 * 1000);

  await db
    .prepare(
      `INSERT INTO magic_tokens (token_hash, email, issued_at, expires_at, requesting_anon_id)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(tokenHash, email, now.toISOString(), expires.toISOString(), anonUserId ?? null)
    .run();

  const base = c.env.MAGIC_LINK_BASE_URL ?? "https://lens-b1h.pages.dev";
  const magicLinkUrl = `${base.replace(/\/$/, "")}/auth/callback?t=${rawToken}`;

  const sent = await sendMagicLink({
    email,
    magicLinkUrl,
    apiKey: c.env.RESEND_API_KEY,
    fromAddress: c.env.RESEND_FROM_EMAIL,
  });
  if (!sent.ok) console.error("[auth:request] email failed:", sent.error);

  // Always 200 regardless of existence → email-enumeration protection.
  return c.json({ ok: true, message: "Check your inbox." });
}

export async function handleVerify(c: Context<{ Bindings: AuthEnv }>): Promise<Response> {
  const body = await c.req.json().catch(() => null);
  const parsed = VerifySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  const { token, anonUserId } = parsed.data;

  let db: D1Database;
  let secret: string;
  try {
    db = requireD1(c.env);
    secret = requireSecret(c.env);
  } catch (e) {
    const err = e as HttpError;
    return c.json({ error: err.code, message: err.message }, err.status as 503);
  }

  const tokenHash = await sha256Hex(token);

  const row = (await db
    .prepare(
      `SELECT token_hash, email, issued_at, expires_at, used_at, requesting_anon_id
       FROM magic_tokens WHERE token_hash = ? LIMIT 1`,
    )
    .bind(tokenHash)
    .first()) as { email: string; expires_at: string; used_at: string | null; requesting_anon_id: string | null } | null;

  if (!row) return c.json({ error: "invalid_token" }, 400);
  if (row.used_at) return c.json({ error: "token_used" }, 400);
  if (new Date(row.expires_at).getTime() < Date.now()) return c.json({ error: "token_expired" }, 400);

  // Mark the token used (single-use).
  await db
    .prepare(`UPDATE magic_tokens SET used_at = ? WHERE token_hash = ?`)
    .bind(new Date().toISOString(), tokenHash)
    .run();

  // Find or create user.
  let user = (await db.prepare(`SELECT * FROM users WHERE email = ?`).bind(row.email).first()) as UserRow | null;
  if (!user) {
    const id = "usr_" + ulid();
    await db
      .prepare(
        `INSERT INTO users (id, email, created_at, last_seen_at, anon_ref) VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(id, row.email, new Date().toISOString(), new Date().toISOString(), anonUserId ?? null)
      .run();
    user = (await db.prepare(`SELECT * FROM users WHERE id = ?`).bind(id).first()) as UserRow;
  } else {
    await db.prepare(`UPDATE users SET last_seen_at = ? WHERE id = ?`).bind(new Date().toISOString(), user.id).run();
  }

  // Create session row + JWT.
  const sessionId = "ses_" + ulid();
  const ttlSeconds = 30 * 24 * 60 * 60;
  const issued = new Date();
  const expires = new Date(issued.getTime() + ttlSeconds * 1000);

  const ua = c.req.header("user-agent") ?? "";
  const ipRaw = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "";
  const ipHash = ipRaw ? await sha256Hex(ipRaw) : "";

  await db
    .prepare(
      `INSERT INTO sessions (id, user_id, issued_at, expires_at, user_agent, ip_hash) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(sessionId, user.id, issued.toISOString(), expires.toISOString(), ua, ipHash)
    .run();

  const claims = makeSessionClaims(user.id, sessionId, ttlSeconds);
  const jwt = await signJwt(claims, secret);

  const cookieOpts: Parameters<typeof buildSetCookie>[2] = {
    maxAgeSeconds: ttlSeconds,
    httpOnly: true,
    secure: true,
    sameSite: "None", // cross-site (pages.dev frontend → workers.dev API)
  };
  if (c.env.LENS_COOKIE_DOMAIN) cookieOpts.domain = c.env.LENS_COOKIE_DOMAIN;
  const cookie = buildSetCookie("lens_session", jwt, cookieOpts);

  c.header("set-cookie", cookie);
  return c.json({ ok: true, user: { id: user.id, email: user.email }, anonUserId: anonUserId ?? null });
}

export async function handleWhoami(c: Context<{ Bindings: AuthEnv; Variables: { userId?: string; anonUserId: string; sessionClaims?: { sub: string; jti: string; iat: number; exp: number; kind: "session" } } }>): Promise<Response> {
  const userId = c.get("userId") as string | undefined;
  const anonUserId = c.get("anonUserId") as string | undefined;
  if (userId && c.env.LENS_D1) {
    const user = (await c.env.LENS_D1
      .prepare(`SELECT id, email FROM users WHERE id = ?`)
      .bind(userId)
      .first()) as { id: string; email: string } | null;
    if (user) return c.json({ userId: user.id, email: user.email, anonUserId: anonUserId ?? null });
  }
  return c.json({ userId: null, email: null, anonUserId: anonUserId ?? null });
}

export async function handleSignout(c: Context<{ Bindings: AuthEnv; Variables: { sessionClaims?: { jti: string } } }>): Promise<Response> {
  const claims = c.get("sessionClaims") as { jti?: string } | undefined;
  if (claims?.jti && c.env.LENS_D1) {
    await c.env.LENS_D1
      .prepare(`UPDATE sessions SET revoked_at = ? WHERE id = ?`)
      .bind(new Date().toISOString(), claims.jti)
      .run();
  }
  const cookieOpts: Parameters<typeof buildSetCookie>[2] = {
    maxAgeSeconds: 0,
    httpOnly: true,
    secure: true,
    sameSite: "None", // cross-site (pages.dev frontend → workers.dev API)
  };
  if (c.env.LENS_COOKIE_DOMAIN) cookieOpts.domain = c.env.LENS_COOKIE_DOMAIN;
  const cookie = buildSetCookie("lens_session", "", cookieOpts);
  c.header("set-cookie", cookie);
  return c.json({ ok: true });
}

// Re-exports for test harness + middleware wiring
export { isValidAnonId };
