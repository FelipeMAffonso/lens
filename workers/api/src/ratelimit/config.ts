// F18 — per-route rate-limit policy.
// Tiers: anon (unsigned-in) vs user (signed-in). Keys: `${tier}:${userId|anonUserId}:${route}`.

export interface RateLimitPolicy {
  route: string;
  windowSeconds: number;
  anonLimit: number;
  userLimit: number;
}

export const POLICIES: RateLimitPolicy[] = [
  { route: "audit", windowSeconds: 86_400, anonLimit: 30, userLimit: 500 },
  { route: "score", windowSeconds: 86_400, anonLimit: 200, userLimit: 2000 },
  { route: "voice", windowSeconds: 86_400, anonLimit: 20, userLimit: 200 },
  { route: "review-scan", windowSeconds: 3600, anonLimit: 100, userLimit: 1000 },
  { route: "passive-scan", windowSeconds: 3600, anonLimit: 60, userLimit: 600 },
  // Judge P0-4: /clarify + /clarify/apply both fire Opus 4.7 generation.
  // Unauthed calls without a cap let a botnet burn the Anthropic bill. Tight
  // window + low anon limit; generous user limit.
  { route: "clarify", windowSeconds: 3600, anonLimit: 20, userLimit: 200 },
  // S7-W41 judge P1-5: pure CPU today, but ifixit.ts makes outbound fetch
  // when IFIXIT_API_KEY is set. A botnet would burn iFixit quota + KV writes.
  { route: "repairability", windowSeconds: 3600, anonLimit: 60, userLimit: 600 },
  // S7-W40: pure CPU. Guard against flood (500-purchase batches × N).
  { route: "lockin", windowSeconds: 3600, anonLimit: 60, userLimit: 600 },
  // V-EXT-INLINE-g judge P0-4: the extension calls /price-history on every
  // product-page visit. Rate-limit to protect Keepa quota + KV writes.
  { route: "price-history", windowSeconds: 3600, anonLimit: 120, userLimit: 1200 },
  // V-EXT-INLINE-f judge P0-2: extension fires /checkout/summary on every
  // cart page view. Compose-only (no LLM) but still rate-limit.
  { route: "checkout-summary", windowSeconds: 3600, anonLimit: 120, userLimit: 1200 },
];

export function findPolicy(route: string): RateLimitPolicy | undefined {
  return POLICIES.find((p) => p.route === route);
}
