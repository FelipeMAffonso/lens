import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAuthorizeUrl,
  exchangeCode,
  GMAIL_SCOPES,
  refreshAccessToken,
} from "./oauth.js";

describe("buildAuthorizeUrl", () => {
  it("returns empty when client id missing", () => {
    const r = buildAuthorizeUrl({}, "seed");
    expect(r.url).toBe("");
  });

  it("builds a Google OAuth URL with required params", () => {
    const r = buildAuthorizeUrl(
      {
        GMAIL_OAUTH_CLIENT_ID: "abc.apps.googleusercontent.com",
        GMAIL_OAUTH_REDIRECT_URI: "https://lens/callback",
      },
      "user_123",
    );
    expect(r.url).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    expect(r.url).toContain("client_id=abc.apps.googleusercontent.com");
    expect(r.url).toContain("scope=");
    expect(r.url).toContain("access_type=offline");
    expect(r.url).toContain("prompt=consent");
    expect(r.state.startsWith("user_123.")).toBe(true);
  });

  it("requests gmail.readonly + gmail.send scopes", () => {
    expect(GMAIL_SCOPES).toContain("gmail.readonly");
    expect(GMAIL_SCOPES).toContain("gmail.send");
  });

  it("state seed is unique per call", () => {
    const a = buildAuthorizeUrl({ GMAIL_OAUTH_CLIENT_ID: "x" }, "seed").state;
    const b = buildAuthorizeUrl({ GMAIL_OAUTH_CLIENT_ID: "x" }, "seed").state;
    expect(a).not.toBe(b);
  });
});

describe("exchangeCode", () => {
  const origFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("returns error when unconfigured", async () => {
    const r = await exchangeCode({}, "code_abc");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("oauth_unconfigured");
  });

  it("POSTs to Google token endpoint on happy path", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          access_token: "at_123",
          refresh_token: "rt_456",
          expires_in: 3600,
          scope: "x",
          token_type: "Bearer",
        }),
        { status: 200 },
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const r = await exchangeCode(
      {
        GMAIL_OAUTH_CLIENT_ID: "cid",
        GMAIL_OAUTH_CLIENT_SECRET: "sec",
        GMAIL_OAUTH_REDIRECT_URI: "https://lens/cb",
      },
      "code_abc",
    );
    expect(r.ok).toBe(true);
    expect(r.tokens?.access_token).toBe("at_123");
    expect(fetchMock.mock.calls[0]![0]).toBe("https://oauth2.googleapis.com/token");
  });

  it("handles Google HTTP error", async () => {
    globalThis.fetch = (async () =>
      new Response("bad_code", { status: 400 })) as unknown as typeof fetch;
    const r = await exchangeCode(
      { GMAIL_OAUTH_CLIENT_ID: "cid", GMAIL_OAUTH_CLIENT_SECRET: "sec" },
      "bad",
    );
    expect(r.ok).toBe(false);
    expect(r.error).toContain("google_http_400");
  });
});

describe("refreshAccessToken", () => {
  const origFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("returns new access token on happy path", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ access_token: "new_at", expires_in: 3600 }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const r = await refreshAccessToken(
      { GMAIL_OAUTH_CLIENT_ID: "cid", GMAIL_OAUTH_CLIENT_SECRET: "sec" },
      "rt_456",
    );
    expect(r.ok).toBe(true);
    expect(r.access_token).toBe("new_at");
  });

  it("returns error when unconfigured", async () => {
    const r = await refreshAccessToken({}, "rt");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("oauth_unconfigured");
  });
});
