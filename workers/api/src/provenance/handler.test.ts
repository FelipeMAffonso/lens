import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { handleVerify, verifyOne } from "./handler.js";

function buildApp() {
  const app = new Hono<{ Bindings: Record<string, unknown> }>();
  app.post("/provenance/verify", (c) => handleVerify(c as never));
  return app;
}

describe("POST /provenance/verify", () => {
  const origFetch = globalThis.fetch;

  it("400 on empty body", async () => {
    const r = await buildApp().request(
      "/provenance/verify",
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      {},
    );
    expect(r.status).toBe(400);
  });

  it("200 with per-URL results (fetched happy path)", async () => {
    globalThis.fetch = vi.fn((u: unknown, _i?: unknown) =>
      Promise.resolve(
        new Response(
          `<html><body><p>The Breville Bambino Plus is a 15-bar Italian pump machine with automatic milk frothing.</p></body></html>`,
          { status: 200 },
        ),
      ),
    ) as unknown as typeof fetch;
    try {
      const r = await buildApp().request(
        "/provenance/verify",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            citedUrls: [
              {
                url: "https://wirecutter.com/reviews/best-home-espresso-machine/",
                claim: "15-bar Italian pump machine",
              },
            ],
          }),
        },
        {},
      );
      expect(r.status).toBe(200);
      const body = (await r.json()) as {
        results: Array<{ claimFound: boolean; claimFoundVia: string; provenanceScore: number }>;
        elapsedMs: number;
      };
      expect(body.results[0]!.claimFound).toBe(true);
      expect(body.results[0]!.claimFoundVia).toBe("exact");
      expect(body.results[0]!.provenanceScore).toBeGreaterThanOrEqual(0.4);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("surfaces affiliate indicators from URL + HTML", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          `<html><body><p>Good review.</p><p>As an Amazon Associate, we may earn a commission.</p></body></html>`,
          { status: 200 },
        ),
      ),
    ) as unknown as typeof fetch;
    try {
      const r = await buildApp().request(
        "/provenance/verify",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            citedUrls: [{ url: "https://www.amazon.com/dp/B07?tag=site-20", claim: "no-such-claim" }],
          }),
        },
        {},
      );
      const body = (await r.json()) as {
        results: Array<{ affiliateIndicators: Array<{ kind: string }>; claimFound: boolean }>;
      };
      const kinds = body.results[0]!.affiliateIndicators.map((i) => i.kind).sort();
      expect(kinds).toContain("amazon-tag");
      expect(kinds).toContain("sponsored-disclosure");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("marks unreachable URLs with fetched:false and score penalty", async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error("net"))) as unknown as typeof fetch;
    try {
      const r = await buildApp().request(
        "/provenance/verify",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            citedUrls: [{ url: "https://offline.example/x", claim: "anything" }],
          }),
        },
        {},
      );
      const body = (await r.json()) as {
        results: Array<{ fetched: boolean; provenanceScore: number }>;
      };
      expect(body.results[0]!.fetched).toBe(false);
      expect(body.results[0]!.provenanceScore).toBe(0);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("enforces the 10-URL cap", async () => {
    const urls = Array.from({ length: 11 }, (_, i) => ({
      url: `https://example.com/${i}`,
      claim: "x",
    }));
    const r = await buildApp().request(
      "/provenance/verify",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ citedUrls: urls }),
      },
      {},
    );
    expect(r.status).toBe(400);
  });
});

describe("verifyOne — unit", () => {
  const origFetch = globalThis.fetch;

  it("populates canonicalUrl + host correctly", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response("<html><body>hi</body></html>", { status: 200 })),
    ) as unknown as typeof fetch;
    try {
      const r = await verifyOne("https://WWW.Example.COM/path?utm_source=x", "hi");
      expect(r.host).toBe("www.example.com");
      expect(r.canonicalUrl).toBe("https://www.example.com/path");
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
