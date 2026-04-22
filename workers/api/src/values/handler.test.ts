import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { handleGet, handlePut, handleRerank } from "./handler.js";
import { createMemoryD1 } from "../db/memory-d1.js";

function buildApp() {
  const app = new Hono<{
    Bindings: { LENS_D1?: unknown };
    Variables: { userId?: string; anonUserId?: string };
  }>();
  app.post("/values-overlay/rerank", (c) => handleRerank(c as never));
  app.put("/values-overlay", async (c, _next) => {
    // Inject principal for the test without going through the auth middleware.
    const anon = c.req.header("x-test-anon");
    if (anon) c.set("anonUserId", anon);
    return handlePut(c as never);
  });
  app.get("/values-overlay", async (c) => {
    const anon = c.req.header("x-test-anon");
    if (anon) c.set("anonUserId", anon);
    return handleGet(c as never);
  });
  return app;
}

describe("POST /values-overlay/rerank", () => {
  it("rejects invalid body", async () => {
    const r = await buildApp().request(
      "/values-overlay/rerank",
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      {},
    );
    expect(r.status).toBe(400);
  });

  it("reranks candidates by overlay contribution", async () => {
    const body = {
      candidates: [
        { id: "a", name: "Acme", brand: "UnknownCo", baseUtility: 0.7 },
        { id: "b", name: "Patagonia Sleeve", brand: "Patagonia", baseUtility: 0.65 },
      ],
      overlay: [{ key: "b-corp", weight: 0.3 }],
    };
    const r = await buildApp().request(
      "/values-overlay/rerank",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
      {},
    );
    const json = (await r.json()) as { ranked: Array<{ id: string; finalUtility: number }>; overlayActive: boolean };
    expect(r.status).toBe(200);
    expect(json.overlayActive).toBe(true);
    expect(json.ranked[0]!.id).toBe("b"); // +0.3 promotes Patagonia
  });
});

describe("PUT + GET /values-overlay", () => {
  it("401 when no principal", async () => {
    const r = await buildApp().request(
      "/values-overlay",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category: "laptops", overlay: [] }),
      },
      { LENS_D1: createMemoryD1() },
    );
    expect(r.status).toBe(401);
  });

  it("503 when D1 missing", async () => {
    const r = await buildApp().request(
      "/values-overlay",
      {
        method: "PUT",
        headers: { "content-type": "application/json", "x-test-anon": "anon-x" },
        body: JSON.stringify({ category: "laptops", overlay: [] }),
      },
      {},
    );
    expect(r.status).toBe(503);
  });

  it("persists an overlay and reads it back", async () => {
    const app = buildApp();
    const env = { LENS_D1: createMemoryD1() };
    const overlay = [{ key: "b-corp", weight: 0.5 }];
    const putRes = await app.request(
      "/values-overlay",
      {
        method: "PUT",
        headers: { "content-type": "application/json", "x-test-anon": "anon-xyz" },
        body: JSON.stringify({ category: "laptops", overlay }),
      },
      env,
    );
    expect(putRes.status).toBe(200);
    const getRes = await app.request(
      "/values-overlay?category=laptops",
      { headers: { "x-test-anon": "anon-xyz" } },
      env,
    );
    const body = (await getRes.json()) as { overlay: unknown[]; source: string };
    expect(body.source).toBe("stored");
    expect(body.overlay).toEqual(overlay);
  });

  it("GET returns empty overlay when unauthenticated", async () => {
    const r = await buildApp().request(
      "/values-overlay?category=x",
      {},
      { LENS_D1: createMemoryD1() },
    );
    const body = (await r.json()) as { overlay: unknown[]; source: string };
    expect(body.source).toBe("empty");
  });

  it("GET 400 without category query param", async () => {
    const r = await buildApp().request(
      "/values-overlay",
      { headers: { "x-test-anon": "anon-y" } },
      { LENS_D1: createMemoryD1() },
    );
    expect(r.status).toBe(400);
  });

  it("PUT rejects an invalid overlay", async () => {
    const r = await buildApp().request(
      "/values-overlay",
      {
        method: "PUT",
        headers: { "content-type": "application/json", "x-test-anon": "anon-z" },
        body: JSON.stringify({ category: "laptops", overlay: [{ key: "not-a-real-key", weight: 0.5 }] }),
      },
      { LENS_D1: createMemoryD1() },
    );
    expect(r.status).toBe(400);
  });
});
