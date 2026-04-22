import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { handleSponsorshipScan } from "./handler.js";

function buildApp() {
  const app = new Hono<{ Bindings: Record<string, unknown> }>();
  app.post("/sponsorship/scan", (c) => handleSponsorshipScan(c as never));
  return app;
}

describe("POST /sponsorship/scan", () => {
  const origFetch = globalThis.fetch;

  it("400 on invalid body", async () => {
    const r = await buildApp().request(
      "/sponsorship/scan",
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      {},
    );
    expect(r.status).toBe(400);
  });

  it("disclosed-partnership when page has affiliate markers AND disclosure", async () => {
    const html = `<html><body>
      <p>As an Amazon Associate we earn commission from qualifying purchases.</p>
      <a href="https://www.amazon.com/dp/B07DKZ9GHB?tag=wirecutter-20">buy here</a>
    </body></html>`;
    globalThis.fetch = vi.fn((_u: unknown, _i?: unknown) =>
      Promise.resolve(new Response(html, { status: 200 })),
    ) as unknown as typeof fetch;
    try {
      const r = await buildApp().request(
        "/sponsorship/scan",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: "https://wirecutter.com/best-x" }),
        },
        {},
      );
      const body = (await r.json()) as {
        verdict: string;
        affiliateIndicators: unknown[];
        disclosures: unknown[];
      };
      expect(body.verdict).toBe("disclosed-partnership");
      expect(body.affiliateIndicators.length).toBeGreaterThan(0);
      expect(body.disclosures.length).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("undisclosed-partnership when affiliate param in URL + no disclosure on page", async () => {
    globalThis.fetch = vi.fn((_u: unknown, _i?: unknown) =>
      Promise.resolve(new Response("<html><body>Just a review.</body></html>", { status: 200 })),
    ) as unknown as typeof fetch;
    try {
      const r = await buildApp().request(
        "/sponsorship/scan",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          // S3-W16's amazon-tag rule is gated on *.amazon.* hostname.
          body: JSON.stringify({ url: "https://www.amazon.com/dp/B07?tag=site-20" }),
        },
        {},
      );
      const body = (await r.json()) as { verdict: string; rationale: string };
      expect(body.verdict).toBe("undisclosed-partnership");
      expect(body.rationale).toContain("16 CFR");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("clear verdict when page has neither", async () => {
    globalThis.fetch = vi.fn((_u: unknown, _i?: unknown) =>
      Promise.resolve(new Response("<html><body>Independent review with no markers.</body></html>", { status: 200 })),
    ) as unknown as typeof fetch;
    try {
      const r = await buildApp().request(
        "/sponsorship/scan",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: "https://independent-blog.example/review" }),
        },
        {},
      );
      const body = (await r.json()) as { verdict: string };
      expect(body.verdict).toBe("clear");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("context-only mode when fetch fails + articleContext supplied", async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error("net"))) as unknown as typeof fetch;
    try {
      const r = await buildApp().request(
        "/sponsorship/scan",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            url: "https://offline.example/x",
            articleContext: "Check out our sponsored review! #sponsored",
          }),
        },
        {},
      );
      const body = (await r.json()) as { source: string; verdict: string; fetched: boolean };
      expect(body.fetched).toBe(false);
      expect(body.source).toBe("context-only");
      expect(body.verdict).toBe("disclosed-partnership");
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
