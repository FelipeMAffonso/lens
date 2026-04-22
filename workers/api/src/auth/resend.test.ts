import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { sendMagicLink } from "./resend.js";

describe("sendMagicLink", () => {
  const origFetch = globalThis.fetch;
  const origLog = console.log;
  const origErr = console.error;

  beforeEach(() => {
    console.log = vi.fn();
    console.error = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = origFetch;
    console.log = origLog;
    console.error = origErr;
  });

  it("falls back to console when apiKey absent", async () => {
    const r = await sendMagicLink({
      email: "test@example.com",
      magicLinkUrl: "https://lens.example/auth/callback?t=abc",
    });
    expect(r.ok).toBe(true);
    expect(r.via).toBe("console");
    expect(console.log).toHaveBeenCalled();
  });

  it("posts to Resend when apiKey present", async () => {
    const fetchMock = vi.fn((_u: string, _i?: RequestInit) =>
      Promise.resolve(new Response("{\"id\":\"msg_1\"}", { status: 200 })),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const r = await sendMagicLink({
      email: "test@example.com",
      magicLinkUrl: "https://lens.example/auth/callback?t=abc",
      apiKey: "re_fake",
      fromAddress: "Lens <no-reply@example.com>",
    });
    expect(r.ok).toBe(true);
    expect(r.via).toBe("resend");
    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0]!;
    const url = call[0];
    const init = call[1];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer re_fake");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.to).toEqual(["test@example.com"]);
    expect(body.subject).toContain("Sign in");
    expect(body.html).toContain("https://lens.example/auth/callback?t=abc");
  });

  it("returns ok:false on Resend 4xx", async () => {
    globalThis.fetch = (async () =>
      new Response("{\"error\":\"bad\"}", { status: 422 })) as unknown as typeof fetch;
    const r = await sendMagicLink({
      email: "a@b",
      magicLinkUrl: "https://x",
      apiKey: "re_fake",
    });
    expect(r.ok).toBe(false);
    expect(r.via).toBe("resend");
  });

  it("returns ok:false on network throw", async () => {
    globalThis.fetch = (async () => {
      throw new Error("net down");
    }) as unknown as typeof fetch;
    const r = await sendMagicLink({
      email: "a@b",
      magicLinkUrl: "https://x",
      apiKey: "re_fake",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("net down");
  });

  it("escapes HTML in the link to prevent injection", async () => {
    const fetchMock = vi.fn((_u: string, _i?: RequestInit) =>
      Promise.resolve(new Response("{}", { status: 200 })),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await sendMagicLink({
      email: "a@b",
      magicLinkUrl: "https://x?q=<script>alert(1)</script>",
      apiKey: "re_fake",
    });
    const call = fetchMock.mock.calls[0]!;
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body.html).not.toContain("<script>");
    expect(body.html).toContain("&lt;script&gt;");
  });
});
