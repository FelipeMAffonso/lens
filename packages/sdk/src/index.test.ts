// Vitest suite for @lens/sdk. No live network calls — we inject a stub
// fetch so every method is exercised in isolation. This is the full
// public-surface contract: if a method here ever drifts from the real
// API shape, this test catches it.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LensClient, LensError } from "./index.js";

interface FetchCall {
  url: string;
  method: string;
  body: unknown;
  headers: Record<string, string>;
}

function stubFetch(
  response: { status?: number; body?: unknown; text?: string } = {},
): {
  fetcher: typeof fetch;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    calls.push({
      url,
      method: (init?.method ?? "GET").toUpperCase(),
      body: init?.body ? JSON.parse(init.body as string) : null,
      headers: (init?.headers as Record<string, string>) ?? {},
    });
    const status = response.status ?? 200;
    const text = response.text ?? (response.body !== undefined ? JSON.stringify(response.body) : "");
    return new Response(text, {
      status,
      headers: { "content-type": "application/json" },
    });
  };
  return { fetcher, calls };
}

describe("LensClient", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("uses the default base URL when none is provided", async () => {
    const { fetcher, calls } = stubFetch({ body: { ok: true } });
    const client = new LensClient({ fetch: fetcher });
    await client.health();
    expect(calls[0]!.url).toBe("https://lens-api.webmarinelli.workers.dev/health");
  });

  it("trims trailing slashes from baseUrl", async () => {
    const { fetcher, calls } = stubFetch({ body: { ok: true } });
    const client = new LensClient({ baseUrl: "https://example.com//", fetch: fetcher });
    await client.health();
    expect(calls[0]!.url).toBe("https://example.com/health");
  });

  it("posts JSON on audit() with the expected body", async () => {
    const { fetcher, calls } = stubFetch({ body: { verdicts: [] } });
    const client = new LensClient({ fetch: fetcher });
    await client.audit({ kind: "text", source: "chatgpt", raw: "hello" });
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url).toContain("/audit");
    expect(calls[0]!.body).toEqual({ kind: "text", source: "chatgpt", raw: "hello" });
  });

  it("sku.search accepts a bare string shorthand", async () => {
    const { fetcher, calls } = stubFetch({ body: { skus: [], q: "x", count: 0 } });
    const client = new LensClient({ fetch: fetcher });
    await client.sku.search("Breville Bambino");
    const url = calls[0]!.url;
    expect(url).toContain("/sku/search");
    expect(url).toContain("q=Breville+Bambino");
  });

  it("sku.search serialises limit + brand + category", async () => {
    const { fetcher, calls } = stubFetch({ body: { skus: [], q: "x", count: 0 } });
    const client = new LensClient({ fetch: fetcher });
    await client.sku.search({ q: "x", limit: 7, brand: "sony", category: "52" });
    const url = calls[0]!.url;
    expect(url).toContain("limit=7");
    expect(url).toContain("brand=sony");
    expect(url).toContain("category=52");
  });

  it("sku.get encodes the id", async () => {
    const { fetcher, calls } = stubFetch({ body: { sku: {} } });
    const client = new LensClient({ fetch: fetcher });
    await client.sku.get("wd:Q123");
    expect(calls[0]!.url).toContain("/sku/wd%3AQ123");
  });

  it("sku.compare joins ids with a comma", async () => {
    const { fetcher, calls } = stubFetch({ body: { sharedSpecMatrix: [] } });
    const client = new LensClient({ fetch: fetcher });
    await client.sku.compare(["a", "b", "c"]);
    expect(calls[0]!.url).toContain("skus=a%2Cb%2Cc");
  });

  it("architectureJourney() reads the customer journey map endpoint", async () => {
    const { fetcher, calls } = stubFetch({
      body: {
        version: "customer-journey-map-v1",
        generatedAt: "2026-04-25T00:00:00.000Z",
        readiness: { live: 5, partial: 2, planned: 0, total: 7, score: 0.857 },
        guarantees: [],
        privacyControls: [],
        stages: [],
      },
    });
    const client = new LensClient({ fetch: fetcher });
    const map = await client.architectureJourney();
    expect(calls[0]!.url).toContain("/architecture/journey");
    expect(map.version).toBe("customer-journey-map-v1");
  });

  it("namespaces triggers.* to the correct endpoints", async () => {
    const { fetcher, calls } = stubFetch({ body: {} });
    const client = new LensClient({ fetch: fetcher });
    await client.triggers.definitions();
    await client.triggers.report({ definition_id: "d1", hmac: "a".repeat(64) });
    await client.triggers.aggregate();
    expect(calls.map((c) => `${c.method} ${c.url.split("workers.dev")[1]}`)).toEqual([
      "GET /triggers/definitions",
      "POST /triggers/report",
      "GET /triggers/aggregate",
    ]);
  });

  it("shoppingSession.summary encodes the id", async () => {
    const { fetcher, calls } = stubFetch({ body: {} });
    const client = new LensClient({ fetch: fetcher });
    await client.shoppingSession.summary("session/with slash");
    expect(calls[0]!.url).toContain("/shopping-session/session%2Fwith%20slash/summary");
  });

  it("push namespace hits the right endpoints", async () => {
    const { fetcher, calls } = stubFetch({ body: {} });
    const client = new LensClient({ fetch: fetcher });
    await client.push.vapidPublicKey();
    await client.push.subscribe({ endpoint: "https://x", keys: { p256dh: "a", auth: "b" } });
    await client.push.unsubscribe({ endpoint: "https://x" });
    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.url).toContain("/push/vapid-public-key");
    expect(calls[1]!.method).toBe("POST");
    expect(calls[1]!.body).toEqual({ endpoint: "https://x", keys: { p256dh: "a", auth: "b" } });
    expect(calls[2]!.method).toBe("POST");
    expect(calls[2]!.url).toContain("/push/unsubscribe");
  });

  it("digest.getPreferences is GET, setPreferences is PUT with body", async () => {
    const { fetcher, calls } = stubFetch({ body: {} });
    const client = new LensClient({ fetch: fetcher });
    await client.digest.getPreferences();
    await client.digest.setPreferences({ cadence: "weekly" });
    expect(calls[0]!.method).toBe("GET");
    expect(calls[1]!.method).toBe("PUT");
    expect(calls[1]!.body).toEqual({ cadence: "weekly" });
  });

  it("embedScore encodes the URL query param", async () => {
    const { fetcher, calls } = stubFetch({ body: { score: 0.8 } });
    const client = new LensClient({ fetch: fetcher });
    await client.embedScore("https://amazon.com/dp/B000");
    expect(calls[0]!.url).toContain("url=https%3A%2F%2Famazon.com%2Fdp%2FB000");
  });

  it("ticker() returns the k-anonymous shape", async () => {
    const { fetcher } = stubFetch({
      body: { kAnonymityMin: 5, generatedAt: "2026-04-23T00:00:00Z", bucketCount: 0, buckets: [] },
    });
    const client = new LensClient({ fetch: fetcher });
    const t = await client.ticker();
    expect(t.kAnonymityMin).toBe(5);
    expect(t.bucketCount).toBe(0);
    expect(Array.isArray(t.buckets)).toBe(true);
  });

  it("merges sessionCookie into request headers", async () => {
    const { fetcher, calls } = stubFetch({ body: {} });
    const client = new LensClient({ fetch: fetcher, sessionCookie: "lens_session=abc" });
    await client.digest.getPreferences();
    expect(calls[0]!.headers["cookie"]).toBe("lens_session=abc");
  });

  it("merges custom headers into every request", async () => {
    const { fetcher, calls } = stubFetch({ body: {} });
    const client = new LensClient({ fetch: fetcher, headers: { "x-app": "my-app" } });
    await client.health();
    expect(calls[0]!.headers["x-app"]).toBe("my-app");
  });

  it("throws LensError on non-2xx, with status + body", async () => {
    const { fetcher } = stubFetch({ status: 404, body: { error: "not_found" } });
    const client = new LensClient({ fetch: fetcher });
    await expect(client.sku.get("missing")).rejects.toMatchObject({
      name: "LensError",
      status: 404,
    });
  });

  it("LensError exposes the parsed body", async () => {
    const { fetcher } = stubFetch({ status: 500, body: { error: "oops", trace: "x" } });
    const client = new LensClient({ fetch: fetcher });
    try {
      await client.architectureStats();
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(LensError);
      expect((err as LensError).body).toEqual({ error: "oops", trace: "x" });
    }
  });

  it("falls back to plain text when response is not JSON", async () => {
    const { fetcher } = stubFetch({ status: 200, text: "not json" });
    const client = new LensClient({ fetch: fetcher });
    const out = await client.ticker();
    // Non-JSON response is returned as-is (string). SDK intentionally loose here.
    expect(typeof out).toBe("string");
  });
});
