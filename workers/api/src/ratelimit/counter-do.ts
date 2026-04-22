// F18 — Durable Object token-bucket counter. One instance per rate-limit key.
// Atomically increments a counter; resets when window elapses.
//
// Contract:
//   POST /check { limit, windowSeconds }
//   → { ok: true, remaining, resetAt, count }
//   → { ok: false, remaining: 0, resetAt, count } when exhausted
//
// Storage via state.storage:
//   "count"   : number — requests in the current window
//   "windowStart" : number — epoch ms of the window origin

interface CheckBody {
  limit: number;
  windowSeconds: number;
}

interface CheckResponse {
  ok: boolean;
  remaining: number;
  resetAt: string;   // ISO
  count: number;
  limit: number;
}

// Minimal DO state interface (avoid @cloudflare/workers-types requirement in src).
interface DOState {
  storage: {
    get: <T = unknown>(key: string) => Promise<T | undefined>;
    put: (key: string, value: unknown) => Promise<void>;
    delete: (key: string) => Promise<boolean>;
  };
}

export class RateLimitCounter {
  state: DOState;

  constructor(state: DOState) {
    this.state = state;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname !== "/check") return new Response("not_found", { status: 404 });
    if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });

    const body = (await req.json().catch(() => null)) as CheckBody | null;
    if (
      !body ||
      typeof body.limit !== "number" ||
      typeof body.windowSeconds !== "number" ||
      body.limit <= 0 ||
      body.windowSeconds <= 0
    ) {
      return new Response(JSON.stringify({ error: "invalid_body" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const now = Date.now();
    const windowMs = body.windowSeconds * 1000;

    const start = (await this.state.storage.get<number>("windowStart")) ?? 0;
    let count = (await this.state.storage.get<number>("count")) ?? 0;

    if (start === 0 || now - start >= windowMs) {
      await this.state.storage.put("windowStart", now);
      await this.state.storage.put("count", 1);
      const resetAt = new Date(now + windowMs).toISOString();
      return this.json({
        ok: true,
        remaining: body.limit - 1,
        resetAt,
        count: 1,
        limit: body.limit,
      });
    }

    // Inside current window.
    if (count >= body.limit) {
      const resetAt = new Date(start + windowMs).toISOString();
      return this.json(
        {
          ok: false,
          remaining: 0,
          resetAt,
          count,
          limit: body.limit,
        },
        429,
      );
    }
    count += 1;
    await this.state.storage.put("count", count);
    const resetAt = new Date(start + windowMs).toISOString();
    return this.json({
      ok: true,
      remaining: body.limit - count,
      resetAt,
      count,
      limit: body.limit,
    });
  }

  private json(body: CheckResponse, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }
}

/** Pure-function version of the counter logic, for unit tests. */
export function checkPure(
  now: number,
  limit: number,
  windowSeconds: number,
  state: { windowStart?: number; count?: number },
): { next: { windowStart: number; count: number }; response: CheckResponse; http: number } {
  const windowMs = windowSeconds * 1000;
  const start = state.windowStart ?? 0;
  let count = state.count ?? 0;
  if (start === 0 || now - start >= windowMs) {
    return {
      next: { windowStart: now, count: 1 },
      response: {
        ok: true,
        remaining: limit - 1,
        resetAt: new Date(now + windowMs).toISOString(),
        count: 1,
        limit,
      },
      http: 200,
    };
  }
  if (count >= limit) {
    return {
      next: { windowStart: start, count },
      response: {
        ok: false,
        remaining: 0,
        resetAt: new Date(start + windowMs).toISOString(),
        count,
        limit,
      },
      http: 429,
    };
  }
  count += 1;
  return {
    next: { windowStart: start, count },
    response: {
      ok: true,
      remaining: limit - count,
      resetAt: new Date(start + windowMs).toISOString(),
      count,
      limit,
    },
    http: 200,
  };
}
