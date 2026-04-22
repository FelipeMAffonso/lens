import { describe, expect, it } from "vitest";
import { ANON_PREFIX, isValidAnonId, mintAnonId, resolveAnonId } from "./anon.js";

describe("mintAnonId", () => {
  it("produces a valid-format id", () => {
    const id = mintAnonId();
    expect(id.startsWith(ANON_PREFIX)).toBe(true);
    expect(id.length - ANON_PREFIX.length).toBe(26);
    expect(isValidAnonId(id)).toBe(true);
  });

  it("uses only Crockford base32 characters (no I, L, O, U)", () => {
    for (let i = 0; i < 100; i++) {
      const id = mintAnonId();
      const body = id.slice(ANON_PREFIX.length);
      expect(body).toMatch(/^[0-9A-HJ-NP-TV-Z]+$/);
    }
  });

  it("generates distinct ids with overwhelming probability (1000 draws, 0 collisions)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(mintAnonId());
    expect(seen.size).toBe(1000);
  });
});

describe("isValidAnonId", () => {
  it("accepts a freshly minted id", () => {
    expect(isValidAnonId(mintAnonId())).toBe(true);
  });
  it("rejects missing prefix", () => {
    expect(isValidAnonId("0123456789ABCDEFGHJKMNPQRS")).toBe(false);
  });
  it("rejects wrong length", () => {
    expect(isValidAnonId(ANON_PREFIX + "ABC")).toBe(false);
    expect(isValidAnonId(ANON_PREFIX + "0".repeat(27))).toBe(false);
  });
  it("rejects non-base32 chars", () => {
    expect(isValidAnonId(ANON_PREFIX + "a".repeat(26))).toBe(false); // lowercase not allowed
    expect(isValidAnonId(ANON_PREFIX + "I".repeat(26))).toBe(false); // I excluded
    expect(isValidAnonId(ANON_PREFIX + "L".repeat(26))).toBe(false);
    expect(isValidAnonId(ANON_PREFIX + "O".repeat(26))).toBe(false);
    expect(isValidAnonId(ANON_PREFIX + "U".repeat(26))).toBe(false);
  });
  it("rejects non-string inputs", () => {
    expect(isValidAnonId(undefined)).toBe(false);
    expect(isValidAnonId(null)).toBe(false);
    expect(isValidAnonId(123)).toBe(false);
    expect(isValidAnonId({})).toBe(false);
  });
});

describe("resolveAnonId", () => {
  it("passes through a valid header id without minting", () => {
    const existing = mintAnonId();
    const r = resolveAnonId(existing);
    expect(r.anonUserId).toBe(existing);
    expect(r.minted).toBe(false);
  });
  it("mints a new id when header is missing", () => {
    const r = resolveAnonId(null);
    expect(isValidAnonId(r.anonUserId)).toBe(true);
    expect(r.minted).toBe(true);
  });
  it("mints a new id when header is empty", () => {
    const r = resolveAnonId("");
    expect(r.minted).toBe(true);
  });
  it("mints a new id when header is invalid", () => {
    const r = resolveAnonId("not-a-valid-id");
    expect(r.minted).toBe(true);
    expect(isValidAnonId(r.anonUserId)).toBe(true);
  });
});
