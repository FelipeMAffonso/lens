import { describe, expect, it } from "vitest";
import { acquireLock, releaseLock, withLock } from "./lock.js";

// Minimal in-memory KV implementing the KVNamespace shape.
function makeKV(): { LENS_KV: { get: (k: string) => Promise<string | null>; put: (k: string, v: string, o?: { expirationTtl?: number }) => Promise<void>; delete: (k: string) => Promise<void>; _store: Map<string, string> } } {
  const store = new Map<string, string>();
  return {
    LENS_KV: {
      _store: store,
      get: async (k: string) => store.get(k) ?? null,
      put: async (k: string, v: string) => { store.set(k, v); },
      delete: async (k: string) => { store.delete(k); },
    },
  };
}

describe("acquireLock / releaseLock", () => {
  it("acquires when unheld", async () => {
    const env = makeKV();
    const h = await acquireLock(env, "job1", 60);
    expect(h.acquired).toBe(true);
    await releaseLock(env, h);
  });

  it("refuses when already held", async () => {
    const env = makeKV();
    await acquireLock(env, "job1", 60);
    const h2 = await acquireLock(env, "job1", 60);
    expect(h2.acquired).toBe(false);
  });

  it("release clears the key only for the holder", async () => {
    const env = makeKV();
    const h1 = await acquireLock(env, "job1", 60);
    await releaseLock(env, h1);
    const h2 = await acquireLock(env, "job1", 60);
    expect(h2.acquired).toBe(true);
  });

  it("releaseLock is a no-op when not acquired", async () => {
    const env = makeKV();
    await releaseLock(env, { jobId: "never", holderId: "x", acquired: false });
    // just make sure it doesn't throw
    expect(true).toBe(true);
  });

  it("graceful fallback when KV missing", async () => {
    const h = await acquireLock({}, "nokv", 60);
    expect(h.acquired).toBe(true);
  });
});

describe("withLock", () => {
  it("runs the fn when lock is acquired", async () => {
    const env = makeKV();
    const r = await withLock(env, "j", 60, async () => 42);
    expect(r).toEqual({ ran: true, result: 42 });
  });

  it("skips the fn when already locked", async () => {
    const env = makeKV();
    await acquireLock(env, "j", 60);
    const r = await withLock(env, "j", 60, async () => 42);
    expect(r).toEqual({ ran: false, reason: "locked" });
  });

  it("releases the lock after the fn completes", async () => {
    const env = makeKV();
    await withLock(env, "j", 60, async () => 1);
    const h = await acquireLock(env, "j", 60);
    expect(h.acquired).toBe(true);
  });

  it("releases even if the fn throws", async () => {
    const env = makeKV();
    await expect(
      withLock(env, "j", 60, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow(/boom/);
    const h = await acquireLock(env, "j", 60);
    expect(h.acquired).toBe(true);
  });
});
