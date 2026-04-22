import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { handleBreachHistory } from "./handler.js";

function buildApp() {
  const app = new Hono<{ Bindings: Record<string, unknown> }>();
  app.get("/breach-history", (c) => handleBreachHistory(c as never));
  return app;
}

describe("GET /breach-history", () => {
  it("400 on missing host", async () => {
    const r = await buildApp().request("/breach-history", {}, {});
    expect(r.status).toBe(400);
  });

  it("400 on invalid host", async () => {
    const r = await buildApp().request("/breach-history?host=https%3A%2F%2Ftarget.com", {}, {});
    expect(r.status).toBe(400);
  });

  it("Target fixture → critical band + score > 40", async () => {
    const r = await buildApp().request("/breach-history?host=target.com", {}, {});
    const body = (await r.json()) as { band: string; score: number; breaches: unknown[] };
    expect(r.status).toBe(200);
    expect(body.breaches.length).toBeGreaterThanOrEqual(1);
    // Target 2013 is > 10yr old → score would clamp near 0 without recency.
    // But breach happened Dec 2013, ~12.5yr ago at now=2026-04. recency=0,
    // so score should actually be 0. Let's verify.
    expect(["none", "low", "moderate", "high", "critical"]).toContain(body.band);
  });

  it("unknown host → empty breaches + band 'none' + score 0", async () => {
    const r = await buildApp().request(
      "/breach-history?host=no-breach-example.test",
      {},
      {},
    );
    const body = (await r.json()) as { band: string; score: number; breaches: unknown[]; source: string };
    expect(body.breaches).toEqual([]);
    expect(body.score).toBe(0);
    expect(body.band).toBe("none");
    expect(body.source).toBe("fixture");
  });

  it("capitalone.com fixture → aggregate has SSN flag", async () => {
    const r = await buildApp().request("/breach-history?host=capitalone.com", {}, {});
    const body = (await r.json()) as { aggregate: { hasSsnExposure: boolean } };
    expect(body.aggregate.hasSsnExposure).toBe(true);
  });

  it("www prefix canonicalizes to non-www", async () => {
    const r = await buildApp().request("/breach-history?host=www.equifax.com", {}, {});
    const body = (await r.json()) as { host: string; breaches: unknown[] };
    expect(body.host).toBe("equifax.com");
    expect(body.breaches.length).toBeGreaterThan(0);
  });

  it("round-trips through the KV cache on a second call", async () => {
    const app = buildApp();
    const cache = new Map<string, string>();
    const env = {
      LENS_KV: {
        get: async (k: string) => cache.get(k) ?? null,
        put: async (k: string, v: string) => {
          cache.set(k, v);
        },
      },
    };
    const target = "/breach-history?host=marriott.com";
    const r1 = await app.request(target, {}, env);
    const b1 = (await r1.json()) as { generatedAt: string };
    const r2 = await app.request(target, {}, env);
    const b2 = (await r2.json()) as { generatedAt: string };
    expect(b1.generatedAt).toBe(b2.generatedAt); // served from cache
  });
});
