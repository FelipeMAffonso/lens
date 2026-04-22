// F1 — JWT session sign / verify via Web Crypto (runs in Workers + Node).
// No third-party JWT library: we only need HS256 and Cloudflare Workers ship
// SubtleCrypto.importKey + sign/verify out of the box.

export interface SessionClaims {
  sub: string; // userId
  jti: string; // sessionId
  iat: number; // seconds since epoch
  exp: number; // seconds since epoch
  kind: "session";
}

const ALG_NAME = "HMAC";
const ALG_HASH = "SHA-256";
const HEADER = { alg: "HS256", typ: "JWT" } as const;

function b64urlEncode(input: Uint8Array): string {
  let bin = "";
  for (const b of input) bin += String.fromCharCode(b);
  return btoa(bin).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlDecode(input: string): Uint8Array {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlEncodeJson(obj: unknown): string {
  return b64urlEncode(new TextEncoder().encode(JSON.stringify(obj)));
}

function b64urlDecodeJson<T = unknown>(input: string): T {
  return JSON.parse(new TextDecoder().decode(b64urlDecode(input))) as T;
}

async function importSecret(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: ALG_NAME, hash: ALG_HASH },
    false,
    ["sign", "verify"],
  );
}

export async function signJwt(claims: SessionClaims, secret: string): Promise<string> {
  const headerB64 = b64urlEncodeJson(HEADER);
  const payloadB64 = b64urlEncodeJson(claims);
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await importSecret(secret);
  const sig = await crypto.subtle.sign(ALG_NAME, key, new TextEncoder().encode(signingInput));
  const sigB64 = b64urlEncode(new Uint8Array(sig));
  return `${signingInput}.${sigB64}`;
}

export async function verifyJwt(jwt: string, secret: string): Promise<SessionClaims | null> {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];
  try {
    const header = b64urlDecodeJson<{ alg: string; typ: string }>(headerB64);
    if (header.alg !== "HS256" || header.typ !== "JWT") return null;
    const key = await importSecret(secret);
    const sig = b64urlDecode(sigB64);
    const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const ok = await crypto.subtle.verify(ALG_NAME, key, sig, signingInput);
    if (!ok) return null;
    const claims = b64urlDecodeJson<SessionClaims>(payloadB64);
    if (claims.kind !== "session") return null;
    if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) return null;
    if (typeof claims.iat !== "number" || claims.iat * 1000 > Date.now() + 60_000) return null; // iat > now + 1min = clock skew
    if (typeof claims.sub !== "string" || typeof claims.jti !== "string") return null;
    return claims;
  } catch {
    return null;
  }
}

export function makeSessionClaims(
  userId: string,
  sessionId: string,
  ttlSeconds = 30 * 24 * 60 * 60,
): SessionClaims {
  const now = Math.floor(Date.now() / 1000);
  return { sub: userId, jti: sessionId, iat: now, exp: now + ttlSeconds, kind: "session" };
}

/** Parse the Cookie header and return the named cookie value, or null. */
export function getCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    if (k === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

export function buildSetCookie(
  name: string,
  value: string,
  opts: {
    maxAgeSeconds?: number;
    domain?: string;
    path?: string;
    sameSite?: "Strict" | "Lax" | "None";
    httpOnly?: boolean;
    secure?: boolean;
  } = {},
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (opts.maxAgeSeconds !== undefined) parts.push(`Max-Age=${opts.maxAgeSeconds}`);
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  parts.push(`Path=${opts.path ?? "/"}`);
  parts.push(`SameSite=${opts.sameSite ?? "Lax"}`);
  if (opts.httpOnly !== false) parts.push("HttpOnly");
  if (opts.secure !== false) parts.push("Secure");
  return parts.join("; ");
}

/** Hash arbitrary string with SHA-256, return hex. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
