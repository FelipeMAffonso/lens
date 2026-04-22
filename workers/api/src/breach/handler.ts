// S4-W26 — GET /breach-history handler.

import type { Context } from "hono";
import { breachesForHost, canonicalHost } from "./fixtures.js";
import { fetchHibpBreachesForHost } from "./hibp.js";
import { aggregateBreaches, bandFor, computeScore } from "./score.js";
import { BreachHistoryQuerySchema, type BreachHistoryResponse, type BreachRecord } from "./types.js";

interface EnvBindings {
  HIBP_API_KEY?: string;
  LENS_KV?: {
    get: (key: string) => Promise<string | null>;
    put: (key: string, value: string, opts?: { expirationTtl?: number }) => Promise<void>;
  };
}

const CACHE_TTL_SECONDS = 86_400;

export async function handleBreachHistory(
  c: Context<{ Bindings: EnvBindings }>,
): Promise<Response> {
  const parsed = BreachHistoryQuerySchema.safeParse({ host: c.req.query("host") });
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  const host = canonicalHost(parsed.data.host);

  const cacheKey = `breach:${host}`;
  const kv = c.env.LENS_KV;
  if (kv) {
    try {
      const raw = await kv.get(cacheKey);
      if (raw) {
        const cached = JSON.parse(raw) as BreachHistoryResponse;
        return c.json(cached);
      }
    } catch {
      // fall through to recompute
    }
  }

  const fixtureBreaches = breachesForHost(host);
  let hibpBreaches: BreachRecord[] | null = null;
  if (c.env.HIBP_API_KEY) {
    hibpBreaches = await fetchHibpBreachesForHost(host, { apiKey: c.env.HIBP_API_KEY });
  }

  // Merge + dedupe on id.
  const seen = new Set<string>();
  const merged: BreachRecord[] = [];
  for (const b of [...fixtureBreaches, ...(hibpBreaches ?? [])]) {
    if (seen.has(b.id)) continue;
    seen.add(b.id);
    merged.push(b);
  }

  const aggregate = aggregateBreaches({ breaches: merged });
  const score = computeScore(merged);
  const source: BreachHistoryResponse["source"] =
    fixtureBreaches.length > 0 && hibpBreaches && hibpBreaches.length > 0
      ? "mixed"
      : hibpBreaches && hibpBreaches.length > 0
        ? "hibp"
        : "fixture";

  const response: BreachHistoryResponse = {
    host,
    breaches: merged,
    aggregate,
    score,
    band: bandFor(score),
    source,
    generatedAt: new Date().toISOString(),
  };

  if (kv) {
    try {
      await kv.put(cacheKey, JSON.stringify(response), { expirationTtl: CACHE_TTL_SECONDS });
    } catch (err) {
      console.error("[breach] kv.put:", (err as Error).message);
    }
  }
  return c.json(response);
}
