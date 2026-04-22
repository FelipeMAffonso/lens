import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { handleGet, handlePut } from "./handler.js";
import { createMemoryD1 } from "../db/memory-d1.js";

function buildApp() {
  const app = new Hono<{
    Bindings: { LENS_D1?: unknown };
    Variables: { userId?: string; anonUserId?: string };
  }>();
  app.use("*", async (c, next) => {
    const uid = c.req.header("x-test-user");
    const anon = c.req.header("x-test-anon");
    if (uid) c.set("userId", uid);
    if (anon) c.set("anonUserId", anon);
    await next();
  });
  app.get("/source-weighting", (c) => handleGet(c as never));
  app.put("/source-weighting", (c) => handlePut(c as never));
  return app;
}

function d1() {
  const db = createMemoryD1();
  db._setPrimaryKey("preferences", "id");
  return db;
}

describe("GET /source-weighting", () => {
  it("default 50/50 when no principal + no data", async () => {
    const r = await buildApp().request("/source-weighting", {}, { LENS_D1: d1() });
    const body = (await r.json()) as { source: string; weighting: { vendor: number; independent: number } };
    expect(body.source).toBe("default");
    expect(body.weighting).toEqual({ vendor: 0.5, independent: 0.5 });
  });

  it("503 when D1 missing", async () => {
    const r = await buildApp().request("/source-weighting", {}, {});
    expect(r.status).toBe(503);
  });

  it("reads back persisted weighting from _global after PUT", async () => {
    const env = { LENS_D1: d1() };
    await buildApp().request(
      "/source-weighting",
      {
        method: "PUT",
        headers: { "content-type": "application/json", "x-test-anon": "anon-1" },
        body: JSON.stringify({ vendor: 0.7, independent: 0.3 }),
      },
      env,
    );
    const r = await buildApp().request(
      "/source-weighting",
      { headers: { "x-test-anon": "anon-1" } },
      env,
    );
    const body = (await r.json()) as { source: string; weighting: { vendor: number } };
    expect(body.source).toBe("global");
    expect(body.weighting.vendor).toBeCloseTo(0.7);
  });

  it("falls back from category to global when per-category absent", async () => {
    const env = { LENS_D1: d1() };
    await buildApp().request(
      "/source-weighting",
      {
        method: "PUT",
        headers: { "content-type": "application/json", "x-test-anon": "anon-1" },
        body: JSON.stringify({ vendor: 0.8, independent: 0.2 }),
      },
      env,
    );
    const r = await buildApp().request(
      "/source-weighting?category=laptops",
      { headers: { "x-test-anon": "anon-1" } },
      env,
    );
    const body = (await r.json()) as { source: string; weighting: { vendor: number } };
    expect(body.source).toBe("global");
    expect(body.weighting.vendor).toBeCloseTo(0.8);
  });

  it("per-category overrides global", async () => {
    const env = { LENS_D1: d1() };
    const hdr = { "content-type": "application/json", "x-test-anon": "anon-1" };
    // Write global then laptop-specific.
    await buildApp().request(
      "/source-weighting",
      { method: "PUT", headers: hdr, body: JSON.stringify({ vendor: 0.5, independent: 0.5 }) },
      env,
    );
    await buildApp().request(
      "/source-weighting",
      {
        method: "PUT",
        headers: hdr,
        body: JSON.stringify({ category: "laptops", vendor: 0.2, independent: 0.8 }),
      },
      env,
    );
    const r = await buildApp().request(
      "/source-weighting?category=laptops",
      { headers: { "x-test-anon": "anon-1" } },
      env,
    );
    const body = (await r.json()) as { source: string; weighting: { vendor: number } };
    expect(body.source).toBe("category");
    expect(body.weighting.vendor).toBeCloseTo(0.2);
  });
});

describe("PUT /source-weighting", () => {
  it("401 unauthenticated", async () => {
    const r = await buildApp().request(
      "/source-weighting",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vendor: 0.5, independent: 0.5 }),
      },
      { LENS_D1: d1() },
    );
    expect(r.status).toBe(401);
  });

  it("400 on invalid body", async () => {
    const r = await buildApp().request(
      "/source-weighting",
      {
        method: "PUT",
        headers: { "content-type": "application/json", "x-test-anon": "anon-1" },
        body: JSON.stringify({ vendor: "x" }),
      },
      { LENS_D1: d1() },
    );
    expect(r.status).toBe(400);
  });

  it("normalizes input + reports normalized:true", async () => {
    const r = await buildApp().request(
      "/source-weighting",
      {
        method: "PUT",
        headers: { "content-type": "application/json", "x-test-anon": "anon-1" },
        body: JSON.stringify({ vendor: 2, independent: 0 }),
      },
      { LENS_D1: d1() },
    );
    const body = (await r.json()) as {
      weighting: { vendor: number; independent: number };
      normalized: boolean;
    };
    expect(body.weighting.vendor).toBeCloseTo(1);
    expect(body.weighting.independent).toBeCloseTo(0);
    expect(body.normalized).toBe(true);
  });

  it("already-normalized input reports normalized:false", async () => {
    const r = await buildApp().request(
      "/source-weighting",
      {
        method: "PUT",
        headers: { "content-type": "application/json", "x-test-anon": "anon-1" },
        body: JSON.stringify({ vendor: 0.7, independent: 0.3 }),
      },
      { LENS_D1: d1() },
    );
    const body = (await r.json()) as { normalized: boolean };
    expect(body.normalized).toBe(false);
  });
});
