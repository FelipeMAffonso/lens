import { describe, expect, it } from "vitest";
import { hashToken, signGiftToken, verifyGiftToken } from "./token.js";

const SECRET = "test-secret-abcdefghijklmnopqrstuvwxyz";
const OTHER_SECRET = "different-secret-zzz-12345";

describe("gift token sign/verify", () => {
  it("round-trips a signed token", async () => {
    const token = await signGiftToken("gift-1", 2_000_000_000, SECRET);
    const parsed = await verifyGiftToken(token, SECRET, 1_800_000_000);
    expect(parsed).not.toBeNull();
    expect(parsed!.giftId).toBe("gift-1");
    expect(parsed!.expiresAtEpochSec).toBe(2_000_000_000);
    expect(parsed!.sigValid).toBe(true);
    expect(parsed!.expired).toBe(false);
  });

  it("returns sigValid=false when secret is wrong", async () => {
    const token = await signGiftToken("gift-1", 2_000_000_000, SECRET);
    const parsed = await verifyGiftToken(token, OTHER_SECRET, 1_800_000_000);
    expect(parsed).not.toBeNull();
    expect(parsed!.sigValid).toBe(false);
  });

  it("detects tampered payload", async () => {
    const token = await signGiftToken("gift-1", 2_000_000_000, SECRET);
    const [g, e, s] = token.split(".") as [string, string, string];
    const tampered = `${g}A.${e}.${s}`; // change the giftId chunk
    const parsed = await verifyGiftToken(tampered, SECRET);
    // Either returns null (parse failure) or sigValid=false. Both are fine.
    if (parsed) expect(parsed.sigValid).toBe(false);
  });

  it("detects tampered expiry", async () => {
    const token = await signGiftToken("gift-1", 2_000_000_000, SECRET);
    const [g, _e, s] = token.split(".") as [string, string, string];
    const tamperedExpiry = btoa("9999999999").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
    const tampered = `${g}.${tamperedExpiry}.${s}`;
    const parsed = await verifyGiftToken(tampered, SECRET);
    if (parsed) expect(parsed.sigValid).toBe(false);
  });

  it("flags expired when now > expiresAt", async () => {
    const token = await signGiftToken("gift-1", 1_700_000_000, SECRET);
    const parsed = await verifyGiftToken(token, SECRET, 1_800_000_000);
    expect(parsed!.expired).toBe(true);
  });

  it("returns null on malformed token (wrong piece count)", async () => {
    const parsed = await verifyGiftToken("a.b", SECRET);
    expect(parsed).toBeNull();
  });

  it("hashToken produces a stable SHA-256 hex digest", async () => {
    const a = await hashToken("same");
    const b = await hashToken("same");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashToken distinguishes different tokens", async () => {
    const a = await hashToken("tokenA");
    const b = await hashToken("tokenB");
    expect(a).not.toBe(b);
  });
});
