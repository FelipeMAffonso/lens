import { describe, expect, it } from "vitest";
import {
  buildSetCookie,
  getCookie,
  makeSessionClaims,
  sha256Hex,
  signJwt,
  verifyJwt,
} from "./session.js";

const SECRET = "test-secret-at-least-32-bytes-of-entropy-xxxxxxxxxxxxxxxxxxxxxxx";

describe("signJwt / verifyJwt", () => {
  it("round-trips a valid session token", async () => {
    const claims = makeSessionClaims("usr_abc", "ses_xyz", 3600);
    const jwt = await signJwt(claims, SECRET);
    expect(jwt.split(".")).toHaveLength(3);
    const back = await verifyJwt(jwt, SECRET);
    expect(back).not.toBeNull();
    expect(back!.sub).toBe("usr_abc");
    expect(back!.jti).toBe("ses_xyz");
    expect(back!.kind).toBe("session");
  });

  it("rejects tampered payload", async () => {
    const claims = makeSessionClaims("usr_abc", "ses_xyz", 3600);
    const jwt = await signJwt(claims, SECRET);
    const parts = jwt.split(".");
    // Re-base64 a mutated payload
    const p = JSON.parse(Buffer.from(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    p.sub = "usr_hacker";
    const mutated = [
      parts[0],
      Buffer.from(JSON.stringify(p)).toString("base64url").replace(/=+$/g, ""),
      parts[2],
    ].join(".");
    expect(await verifyJwt(mutated, SECRET)).toBeNull();
  });

  it("rejects wrong secret", async () => {
    const claims = makeSessionClaims("usr_a", "ses_b", 3600);
    const jwt = await signJwt(claims, SECRET);
    expect(await verifyJwt(jwt, "different-secret-wrong-64-bytes-aaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBeNull();
  });

  it("rejects expired token", async () => {
    const now = Math.floor(Date.now() / 1000);
    const claims = { sub: "u", jti: "s", iat: now - 7200, exp: now - 3600, kind: "session" as const };
    const jwt = await signJwt(claims, SECRET);
    expect(await verifyJwt(jwt, SECRET)).toBeNull();
  });

  it("rejects a malformed JWT", async () => {
    expect(await verifyJwt("not.a.jwt", SECRET)).toBeNull();
    expect(await verifyJwt("only-one-part", SECRET)).toBeNull();
    expect(await verifyJwt("", SECRET)).toBeNull();
  });

  it("rejects wrong alg header", async () => {
    // Build a JWT with alg=none manually.
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url").replace(/=+$/g, "");
    const payload = Buffer.from(JSON.stringify(makeSessionClaims("u", "s", 60))).toString("base64url").replace(/=+$/g, "");
    expect(await verifyJwt(`${header}.${payload}.`, SECRET)).toBeNull();
  });
});

describe("getCookie / buildSetCookie", () => {
  it("reads a named cookie from the header", () => {
    expect(getCookie("foo=bar; lens_session=abc; other=x", "lens_session")).toBe("abc");
  });

  it("returns null when cookie absent", () => {
    expect(getCookie("foo=bar", "lens_session")).toBeNull();
  });

  it("returns null when header is null", () => {
    expect(getCookie(null, "lens_session")).toBeNull();
  });

  it("builds a Set-Cookie string with all flags by default", () => {
    const s = buildSetCookie("lens_session", "JWT_VALUE", { maxAgeSeconds: 60 });
    expect(s).toContain("lens_session=JWT_VALUE");
    expect(s).toContain("HttpOnly");
    expect(s).toContain("Secure");
    expect(s).toContain("SameSite=Lax");
    expect(s).toContain("Max-Age=60");
  });

  it("supports domain + custom same-site", () => {
    const s = buildSetCookie("lens_session", "x", { domain: ".example.com", sameSite: "Strict" });
    expect(s).toContain("Domain=.example.com");
    expect(s).toContain("SameSite=Strict");
  });

  it("omits httpOnly + secure when explicitly false", () => {
    const s = buildSetCookie("lens_session", "x", { httpOnly: false, secure: false });
    expect(s).not.toContain("HttpOnly");
    expect(s).not.toContain("Secure");
  });
});

describe("sha256Hex", () => {
  it("produces a 64-char lowercase hex digest", async () => {
    const h = await sha256Hex("hello");
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[0-9a-f]+$/);
  });

  it("is deterministic", async () => {
    expect(await sha256Hex("lens")).toBe(await sha256Hex("lens"));
  });

  it("differs for different inputs", async () => {
    expect(await sha256Hex("a")).not.toBe(await sha256Hex("b"));
  });
});

describe("makeSessionClaims", () => {
  it("sets iat and exp consistent with the ttl", () => {
    const c = makeSessionClaims("u", "s", 60);
    expect(c.exp - c.iat).toBe(60);
    expect(c.kind).toBe("session");
  });
});
