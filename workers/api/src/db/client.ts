// F2 — thin D1 wrapper. Avoids coupling repos to the @cloudflare/workers-types
// import so tests can pass an in-memory shim. Also centralizes error handling
// for the observability hook (F17).

export interface D1PreparedLike {
  bind: (...values: unknown[]) => D1PreparedLike;
  first: <T = unknown>() => Promise<T | null>;
  all: <T = unknown>() => Promise<{ results: T[]; success: boolean }>;
  run: () => Promise<{ success: boolean }>;
}

export interface D1Like {
  prepare: (sql: string) => D1PreparedLike;
  batch?: (stmts: D1PreparedLike[]) => Promise<unknown>;
}

/**
 * Crockford base32 ULID. Inline to avoid pulling a runtime dep for a single
 * generator. Good enough for opaque row IDs. `runtime-only` — not crypto.
 */
export function ulid(): string {
  const t = Date.now()
    .toString(32)
    .toUpperCase()
    .replace(/[ILOU]/g, "X")
    .padStart(10, "0")
    .slice(-10);
  const rand = Array.from({ length: 16 }, () =>
    "0123456789ABCDEFGHJKMNPQRSTVWXYZ".charAt(Math.floor(Math.random() * 32)),
  ).join("");
  return t + rand;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Execute a write and wrap errors with repo context for logs.
 */
export async function tryRun(
  label: string,
  stmt: D1PreparedLike,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await stmt.run();
    return { ok: true };
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    console.error(`[db] ${label}:`, message);
    return { ok: false, message };
  }
}

/**
 * Assert presence of a D1 binding. Handlers commonly branch on missing D1
 * (graceful-degrade during local dev + CI); this helper keeps the branch tidy.
 */
export function requireD1(d1: D1Like | null | undefined): D1Like {
  if (!d1) throw new Error("D1 binding LENS_D1 not available");
  return d1;
}
