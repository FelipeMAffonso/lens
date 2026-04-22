// F4 — KV-backed distributed lock. Prevents double-runs when the same cron
// fires in two isolates within the same window.
//
// Keys: `cron:lock:<jobId>`. Value: `{ holderId, acquiredAt, expiresAt }`. TTL
// via KV's built-in expirationTtl (seconds).

export interface LockEnv {
  LENS_KV?: KVNamespace;
}

export interface LockHandle {
  jobId: string;
  holderId: string;
  acquired: boolean;
}

export async function acquireLock(
  env: LockEnv,
  jobId: string,
  ttlSeconds: number,
): Promise<LockHandle> {
  const kv = env.LENS_KV;
  if (!kv) return { jobId, holderId: "no-kv", acquired: true }; // graceful fallback
  const holderId = crypto.randomUUID();
  const key = `cron:lock:${jobId}`;
  const existing = await kv.get(key);
  if (existing) return { jobId, holderId, acquired: false };
  await kv.put(
    key,
    JSON.stringify({ holderId, acquiredAt: new Date().toISOString() }),
    { expirationTtl: Math.max(60, ttlSeconds) },
  );
  // Verify ours won (TOCTOU — if another isolate wrote between our get + put).
  const readback = await kv.get(key);
  if (!readback) return { jobId, holderId, acquired: false };
  try {
    const parsed = JSON.parse(readback) as { holderId?: string };
    return { jobId, holderId, acquired: parsed.holderId === holderId };
  } catch {
    return { jobId, holderId, acquired: false };
  }
}

export async function releaseLock(env: LockEnv, handle: LockHandle): Promise<void> {
  const kv = env.LENS_KV;
  if (!kv) return;
  if (!handle.acquired) return;
  const key = `cron:lock:${handle.jobId}`;
  const current = await kv.get(key);
  if (!current) return;
  try {
    const parsed = JSON.parse(current) as { holderId?: string };
    if (parsed.holderId === handle.holderId) await kv.delete(key);
  } catch {
    // ignore
  }
}

/** Declarative wrapper: run fn iff lock acquired. */
export async function withLock<T>(
  env: LockEnv,
  jobId: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<{ ran: true; result: T } | { ran: false; reason: "locked" }> {
  const handle = await acquireLock(env, jobId, ttlSeconds);
  if (!handle.acquired) return { ran: false, reason: "locked" };
  try {
    const result = await fn();
    return { ran: true, result };
  } finally {
    await releaseLock(env, handle);
  }
}

/** Cloudflare Workers KVNamespace — minimal local shim so TS is happy without workers-types. */
interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}
