// CJ-W48 — signed share-token + server-side SHA-256 for constant-time lookup.
// Token format: base64url(giftId) + "." + base64url(expiresAtEpochSec) + "." + base64url(hmac-sha256)
// Stored in D1: SHA-256(token) hex. The plaintext token only ever exists in
// (a) the response to the creating giver, (b) the URL the recipient follows.

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlString(s: string): string {
  return b64url(enc.encode(s));
}

function fromB64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const base64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signGiftToken(
  giftId: string,
  expiresAtEpochSec: number,
  secret: string,
): Promise<string> {
  const payload = `${b64urlString(giftId)}.${b64urlString(String(expiresAtEpochSec))}`;
  const key = await importHmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
  return `${payload}.${b64url(sig)}`;
}

export interface ParsedToken {
  giftId: string;
  expiresAtEpochSec: number;
  sigValid: boolean;
  expired: boolean;
}

export async function verifyGiftToken(
  token: string,
  secret: string,
  nowEpochSec: number = Math.floor(Date.now() / 1000),
): Promise<ParsedToken | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [gidB64, expB64, sigB64] = parts as [string, string, string];
  let giftId: string;
  let expiresAtEpochSec: number;
  try {
    giftId = new TextDecoder().decode(fromB64url(gidB64));
    expiresAtEpochSec = Number(new TextDecoder().decode(fromB64url(expB64)));
    if (!Number.isFinite(expiresAtEpochSec)) return null;
  } catch {
    return null;
  }
  const payload = `${gidB64}.${expB64}`;
  const key = await importHmacKey(secret);
  let sigValid = false;
  try {
    const sig = fromB64url(sigB64);
    sigValid = await crypto.subtle.verify("HMAC", key, sig, enc.encode(payload));
  } catch {
    sigValid = false;
  }
  return {
    giftId,
    expiresAtEpochSec,
    sigValid,
    expired: expiresAtEpochSec <= nowEpochSec,
  };
}

/** SHA-256(token) → hex; used for constant-time DB lookup without storing plaintext. */
export async function hashToken(token: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(token)));
  let hex = "";
  for (const b of digest) hex += b.toString(16).padStart(2, "0");
  return hex;
}
