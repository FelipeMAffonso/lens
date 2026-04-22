// F12 — oauth_tokens CRUD.

interface D1Minimal {
  prepare: (sql: string) => {
    bind: (...values: unknown[]) => {
      run: () => Promise<unknown>;
      first: () => Promise<unknown>;
      all: () => Promise<{ results: unknown[] }>;
    };
  };
}

export interface OAuthTokenRow {
  id: string;
  user_id: string;
  provider: string;
  access_token: string;
  refresh_token: string | null;
  scopes: string | null;
  expires_at: string | null;
  last_refreshed_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

function ulid(): string {
  const BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let ts = BigInt(Date.now());
  const timeChars: string[] = [];
  for (let i = 0; i < 10; i++) {
    timeChars.push(BASE32[Number(ts & 31n)]!);
    ts >>= 5n;
  }
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let rand = 0n;
  for (const b of bytes) rand = (rand << 8n) | BigInt(b);
  const randChars: string[] = [];
  for (let i = 0; i < 16; i++) {
    randChars.push(BASE32[Number(rand & 31n)]!);
    rand >>= 5n;
  }
  return timeChars.reverse().join("") + randChars.reverse().join("");
}

export async function upsertToken(
  db: D1Minimal | undefined,
  row: Omit<OAuthTokenRow, "id" | "created_at" | "last_refreshed_at" | "revoked_at"> & {
    id?: string;
    last_refreshed_at?: string | null;
  },
): Promise<string> {
  if (!db) throw new Error("d1_unavailable");
  const id = row.id ?? "tok_" + ulid();
  const now = new Date().toISOString();
  // Delete any prior token for (user_id, provider) — UNIQUE index would also
  // prevent re-insertion, but we want to preserve insertion semantics for
  // observability.
  await db
    .prepare(`DELETE FROM oauth_tokens WHERE user_id = ? AND provider = ?`)
    .bind(row.user_id, row.provider)
    .run();
  await db
    .prepare(
      `INSERT INTO oauth_tokens (id, user_id, provider, access_token, refresh_token, scopes, expires_at, last_refreshed_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      row.user_id,
      row.provider,
      row.access_token,
      row.refresh_token ?? null,
      row.scopes ?? null,
      row.expires_at ?? null,
      row.last_refreshed_at ?? now,
      now,
    )
    .run();
  return id;
}

export async function getToken(
  db: D1Minimal | undefined,
  userId: string,
  provider: string,
): Promise<OAuthTokenRow | null> {
  if (!db) return null;
  const row = (await db
    .prepare(
      `SELECT * FROM oauth_tokens WHERE user_id = ? AND provider = ? AND revoked_at IS NULL LIMIT 1`,
    )
    .bind(userId, provider)
    .first()) as OAuthTokenRow | null;
  return row ?? null;
}

export async function updateAccessToken(
  db: D1Minimal | undefined,
  id: string,
  accessToken: string,
  expiresAt: string,
): Promise<void> {
  if (!db) return;
  await db
    .prepare(
      `UPDATE oauth_tokens SET access_token = ?, expires_at = ?, last_refreshed_at = ? WHERE id = ?`,
    )
    .bind(accessToken, expiresAt, new Date().toISOString(), id)
    .run();
}

export async function revokeToken(
  db: D1Minimal | undefined,
  id: string,
): Promise<void> {
  if (!db) return;
  await db
    .prepare(`UPDATE oauth_tokens SET revoked_at = ? WHERE id = ?`)
    .bind(new Date().toISOString(), id)
    .run();
}
