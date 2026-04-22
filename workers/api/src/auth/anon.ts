// F1 — Anonymous user identity (device-keyed opaque IDs).
//
// Every request to the Lens API carries EITHER a signed-in userId (via JWT cookie)
// OR an anonUserId (via `x-lens-anon-id` header from localStorage).
//
// anonUserId format: "anon_" + 26-char Crockford-base32 of 128 random bits.
// We use Crockford base32 (like ulid) so IDs round-trip cleanly in logs / URLs /
// analytics without case-collapsing ambiguity.

const BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford (no I/L/O/U)
const ID_BYTES = 16; // 128 bits
const ID_CHARS = 26; // ceil(128 / 5) = 26
export const ANON_PREFIX = "anon_";

export function mintAnonId(): string {
  const bytes = new Uint8Array(ID_BYTES);
  crypto.getRandomValues(bytes);
  return ANON_PREFIX + encodeCrockford(bytes, ID_CHARS);
}

export function isValidAnonId(input: unknown): input is string {
  if (typeof input !== "string") return false;
  if (!input.startsWith(ANON_PREFIX)) return false;
  const body = input.slice(ANON_PREFIX.length);
  if (body.length !== ID_CHARS) return false;
  for (const ch of body) if (!BASE32.includes(ch)) return false;
  return true;
}

function encodeCrockford(bytes: Uint8Array, chars: number): string {
  // Pack as a big integer then stringify in base32.
  let buf = 0n;
  for (const b of bytes) buf = (buf << 8n) | BigInt(b);
  const out: string[] = [];
  for (let i = 0; i < chars; i++) {
    const digit = Number(buf & 31n);
    out.push(BASE32[digit]!);
    buf >>= 5n;
  }
  return out.reverse().join("");
}

/** Read `x-lens-anon-id` header and mint a new one if missing / invalid. */
export function resolveAnonId(headerValue: string | null | undefined): { anonUserId: string; minted: boolean } {
  if (isValidAnonId(headerValue)) return { anonUserId: headerValue, minted: false };
  return { anonUserId: mintAnonId(), minted: true };
}
