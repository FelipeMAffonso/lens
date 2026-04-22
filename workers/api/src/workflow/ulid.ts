// Lightweight ULID generator for run IDs.
// 10-char timestamp (Crockford base32, ms precision) + 16-char random.

const BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function ulid(): string {
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
