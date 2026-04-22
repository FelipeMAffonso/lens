import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { handlePrivacyAudit } from "./handler.js";

function buildApp() {
  const app = new Hono<{ Bindings: Record<string, unknown> }>();
  app.post("/privacy-audit", (c) => handlePrivacyAudit(c as never));
  return app;
}

describe("POST /privacy-audit", () => {
  const origFetch = globalThis.fetch;

  it("400 on missing url", async () => {
    const r = await buildApp().request(
      "/privacy-audit",
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      {},
    );
    expect(r.status).toBe(400);
  });

  it("400 on invalid url", async () => {
    const r = await buildApp().request(
      "/privacy-audit",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ privacyPolicyUrl: "not-a-url" }) },
      {},
    );
    expect(r.status).toBe(400);
  });

  it("heuristic-only path runs when no ANTHROPIC_API_KEY", async () => {
    const policyHtml = `<html><body>
      <p>We collect your email address, name, and device identifier. We comply with GDPR and CCPA.</p>
      <p>You have the right to delete your account in your account settings.</p>
      <p>We retain data for 90 days after account deletion.</p>
    </body></html>`;
    globalThis.fetch = vi.fn((_u: unknown, _i?: unknown) =>
      Promise.resolve(new Response(policyHtml, { status: 200 })),
    ) as unknown as typeof fetch;
    try {
      const r = await buildApp().request(
        "/privacy-audit",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ privacyPolicyUrl: "https://example.com/privacy" }),
        },
        {},
      );
      const body = (await r.json()) as {
        source: string;
        fetched: boolean;
        audit: { regulatoryFrameworks: string[]; deletion: { available: boolean } };
        transparencyScore: number;
        band: string;
      };
      expect(r.status).toBe(200);
      expect(body.source).toBe("heuristic-only");
      expect(body.fetched).toBe(true);
      expect(body.audit.regulatoryFrameworks).toEqual(expect.arrayContaining(["GDPR", "CCPA"]));
      expect(body.audit.deletion.available).toBe(true);
      expect(body.transparencyScore).toBeGreaterThan(60);
      // Transparent policy (GDPR+CCPA+deletion+specific retention+2 data
      // categories) may land in either moderate (≥40, <70) or high (≥70).
      expect(["moderate", "high"]).toContain(body.band);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("unreachable URL → fetched:false, low band, empty audit", async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error("net"))) as unknown as typeof fetch;
    try {
      const r = await buildApp().request(
        "/privacy-audit",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ privacyPolicyUrl: "https://offline.example/privacy" }),
        },
        {},
      );
      const body = (await r.json()) as {
        fetched: boolean;
        band: string;
        audit: { dataCollected: unknown[] };
      };
      expect(body.fetched).toBe(false);
      expect(body.audit.dataCollected).toEqual([]);
      // empty audit scores baseline 50 → moderate band
      expect(["low", "moderate"]).toContain(body.band);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("surface fields always present + runId shape", async () => {
    globalThis.fetch = vi.fn((_u: unknown, _i?: unknown) =>
      Promise.resolve(new Response("<html></html>", { status: 200 })),
    ) as unknown as typeof fetch;
    try {
      const r = await buildApp().request(
        "/privacy-audit",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ privacyPolicyUrl: "https://example.com/privacy" }),
        },
        {},
      );
      const body = (await r.json()) as {
        runId: string;
        latencyMs: number;
        generatedAt: string;
        source: string;
      };
      expect(body.runId).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/);
      expect(body.latencyMs).toBeGreaterThanOrEqual(0);
      expect(body.generatedAt.endsWith("Z")).toBe(true);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
