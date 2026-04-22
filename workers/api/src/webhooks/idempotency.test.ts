import { describe, expect, it } from "vitest";
import { claimIdempotencyKey, recordIdempotencyResult } from "./idempotency.js";

function makeKV() {
  const store = new Map<string, string>();
  return {
    env: {
      LENS_KV: {
        _store: store,
        get: async (k: string) => store.get(k) ?? null,
        put: async (k: string, v: string) => { store.set(k, v); },
      },
    },
    store,
  };
}

describe("claimIdempotencyKey", () => {
  it("returns fresh on first claim", async () => {
    const { env } = makeKV();
    const r = await claimIdempotencyKey(env, "hook1", "key1");
    expect(r.fresh).toBe(true);
  });

  it("returns not-fresh + cached body on replay", async () => {
    const { env } = makeKV();
    await claimIdempotencyKey(env, "hook1", "key1");
    await recordIdempotencyResult(env, "hook1", "key1", "{\"ok\":true}");
    const r = await claimIdempotencyKey(env, "hook1", "key1");
    expect(r.fresh).toBe(false);
    if (!r.fresh) expect(r.cached).toBe("{\"ok\":true}");
  });

  it("scopes by webhookId (same key, different hook → fresh)", async () => {
    const { env } = makeKV();
    await claimIdempotencyKey(env, "hook1", "same-key");
    const r = await claimIdempotencyKey(env, "hook2", "same-key");
    expect(r.fresh).toBe(true);
  });

  it("graceful fallback when KV missing", async () => {
    const r = await claimIdempotencyKey({}, "hook1", "key");
    expect(r.fresh).toBe(true);
  });

  it("recordIdempotencyResult is a no-op when KV missing", async () => {
    await recordIdempotencyResult({}, "hook1", "key", "body");
    expect(true).toBe(true);
  });

  it("intermediate pending state is still non-fresh on replay", async () => {
    const { env } = makeKV();
    await claimIdempotencyKey(env, "hook1", "key1");
    const r = await claimIdempotencyKey(env, "hook1", "key1");
    expect(r.fresh).toBe(false);
    if (!r.fresh) expect(r.cached).toBe("pending");
  });
});
