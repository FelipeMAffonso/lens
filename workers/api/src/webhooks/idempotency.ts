// F5 — KV-backed idempotency keys for webhooks.
// Any external service that POSTs the same (webhookId, idempotencyKey) twice
// within 24h gets a cached response instead of re-triggering the workflow.

interface KVMinimal {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    opts?: { expirationTtl?: number },
  ): Promise<void>;
}

export interface IdempotencyEnv {
  LENS_KV?: KVMinimal;
}

const TTL_SECONDS = 24 * 60 * 60; // 24h

/**
 * Check + claim an idempotency slot. Returns:
 *  - { fresh: true } if this is the first time we've seen this key (slot now reserved)
 *  - { fresh: false, cached: string } if we saw this key before
 */
export async function claimIdempotencyKey(
  env: IdempotencyEnv,
  webhookId: string,
  key: string,
): Promise<{ fresh: true } | { fresh: false; cached: string }> {
  if (!env.LENS_KV) return { fresh: true }; // graceful fallback
  const fullKey = `idemp:${webhookId}:${key}`;
  const existing = await env.LENS_KV.get(fullKey);
  if (existing) return { fresh: false, cached: existing };
  await env.LENS_KV.put(fullKey, "pending", { expirationTtl: TTL_SECONDS });
  return { fresh: true };
}

/** Store the response body against the idempotency slot so replays get the same result. */
export async function recordIdempotencyResult(
  env: IdempotencyEnv,
  webhookId: string,
  key: string,
  body: string,
): Promise<void> {
  if (!env.LENS_KV) return;
  const fullKey = `idemp:${webhookId}:${key}`;
  await env.LENS_KV.put(fullKey, body, { expirationTtl: TTL_SECONDS });
}
