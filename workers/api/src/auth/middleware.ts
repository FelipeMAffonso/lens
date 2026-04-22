// F1 — Hono middleware that resolves userId (from JWT cookie) + anonUserId
// (from x-lens-anon-id header, minting a new one if missing).

import type { MiddlewareHandler } from "hono";
import { getCookie, verifyJwt } from "./session.js";
import { resolveAnonId } from "./anon.js";
import type { AuthEnv } from "./magic-link.js";

export const authMiddleware: MiddlewareHandler<{ Bindings: AuthEnv; Variables: AuthVars }> = async (c, next) => {
  // 1. Session via JWT cookie.
  if (c.env.JWT_SECRET) {
    const cookieHeader = c.req.header("cookie");
    const jwt = getCookie(cookieHeader ?? null, "lens_session");
    if (jwt) {
      const claims = await verifyJwt(jwt, c.env.JWT_SECRET);
      if (claims && !(await isRevoked(c.env, claims.jti))) {
        c.set("userId", claims.sub);
        c.set("sessionClaims", claims);
      }
    }
  }

  // 2. Anon ID (always present).
  const headerAnon = c.req.header("x-lens-anon-id");
  const { anonUserId, minted } = resolveAnonId(headerAnon);
  c.set("anonUserId", anonUserId);
  if (minted) c.header("x-lens-anon-id-new", anonUserId);

  await next();
};

export interface AuthVars {
  userId?: string;
  anonUserId: string;
  sessionClaims?: { sub: string; jti: string; iat: number; exp: number; kind: "session" };
}

async function isRevoked(env: AuthEnv, sessionId: string): Promise<boolean> {
  if (!env.LENS_D1) return false;
  const row = (await env.LENS_D1
    .prepare(`SELECT revoked_at FROM sessions WHERE id = ? LIMIT 1`)
    .bind(sessionId)
    .first()) as { revoked_at: string | null } | null;
  if (!row) return true;
  return row.revoked_at !== null;
}
