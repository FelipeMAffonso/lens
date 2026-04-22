// F18 — Hono middleware that consults the RateLimitCounter DO before handling
// a request. Looks up policy by route prefix; identifies caller via signed-in
// userId or anonUserId. Graceful fallback when RATE_LIMIT_DO binding absent
// (pre-deploy / test envs): request is allowed.

import type { MiddlewareHandler } from "hono";
import { findPolicy } from "./config.js";

interface DurableObjectNamespace {
  idFromName: (name: string) => DurableObjectId;
  get: (id: DurableObjectId) => { fetch: (req: Request) => Promise<Response> };
}
interface DurableObjectId {
  toString: () => string;
}

export interface RateLimitEnv {
  RATE_LIMIT_DO?: DurableObjectNamespace;
}

export interface RateLimitVars {
  userId?: string;
  anonUserId?: string;
}

export function routeFromPath(path: string): string | null {
  // Map URL path → policy route. Order matters (longer first).
  if (path.startsWith("/audit")) return "audit";
  if (path.startsWith("/score")) return "score";
  if (path.startsWith("/voice/transcribe")) return "voice";
  if (path.startsWith("/review-scan")) return "review-scan";
  if (path.startsWith("/passive-scan")) return "passive-scan";
  if (path.startsWith("/clarify")) return "clarify"; // judge P0-4
  if (path.startsWith("/repairability")) return "repairability"; // S7-W41 judge P1-5
  if (path.startsWith("/lockin")) return "lockin"; // S7-W40
  if (path.startsWith("/price-history")) return "price-history"; // V-EXT-INLINE-g judge P0-4
  return null;
}

export const rateLimitMiddleware: MiddlewareHandler<{
  Bindings: RateLimitEnv;
  Variables: RateLimitVars;
}> = async (c, next) => {
  const route = routeFromPath(new URL(c.req.url).pathname);
  if (!route) return next();
  const policy = findPolicy(route);
  if (!policy) return next();
  if (!c.env.RATE_LIMIT_DO) return next(); // graceful: no binding → pass

  const userId = c.get("userId") as string | undefined;
  const anonUserId = c.get("anonUserId") as string | undefined;
  const tier = userId ? "user" : "anon";
  const principal = userId ?? anonUserId ?? "anonymous";
  const limit = userId ? policy.userLimit : policy.anonLimit;
  const key = `${tier}:${principal}:${route}`;

  try {
    const id = c.env.RATE_LIMIT_DO.idFromName(key);
    const stub = c.env.RATE_LIMIT_DO.get(id);
    const res = await stub.fetch(
      new Request("https://rl/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit, windowSeconds: policy.windowSeconds }),
      }),
    );
    const body = (await res.json()) as {
      ok: boolean;
      remaining: number;
      resetAt: string;
      limit: number;
      count: number;
    };
    c.header("x-ratelimit-limit", String(body.limit));
    c.header("x-ratelimit-remaining", String(body.remaining));
    c.header("x-ratelimit-reset", body.resetAt);
    if (!body.ok) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((Date.parse(body.resetAt) - Date.now()) / 1000),
      );
      c.header("retry-after", String(retryAfterSec));
      return c.json(
        {
          error: "rate_limited",
          message: `Too many ${route} requests. Try again at ${body.resetAt}.`,
          resetAt: body.resetAt,
          remaining: body.remaining,
        },
        429,
      );
    }
  } catch (err) {
    // Fail-open on DO errors; observability will surface them via the bus.
    console.error("[ratelimit] DO error:", (err as Error).message);
  }
  return next();
};
