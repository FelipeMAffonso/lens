import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import {
  handleCancelDraft,
  handleDelete,
  handleList,
  handlePatch,
  handleScan,
  handleUpcoming,
} from "./handler.js";
import { createMemoryD1 } from "../db/memory-d1.js";

function buildApp() {
  const app = new Hono<{
    Bindings: { LENS_D1?: unknown };
    Variables: { userId?: string; anonUserId?: string };
  }>();
  // Inject principal via test header so we don't need the auth middleware.
  app.use("*", async (c, next) => {
    const uid = c.req.header("x-test-user");
    if (uid) c.set("userId", uid);
    await next();
  });
  app.post("/subs/scan", (c) => handleScan(c as never));
  app.get("/subs", (c) => handleList(c as never));
  app.get("/subs/upcoming", (c) => handleUpcoming(c as never));
  app.patch("/subs/:id", (c) => handlePatch(c as never));
  app.delete("/subs/:id", (c) => handleDelete(c as never));
  app.post("/subs/:id/cancel-draft", (c) => handleCancelDraft(c as never));
  return app;
}

function d1() {
  const db = createMemoryD1();
  db._setPrimaryKey("subscriptions", "id");
  return db;
}

describe("POST /subs/scan", () => {
  it("503 when D1 missing", async () => {
    const r = await buildApp().request(
      "/subs/scan",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ messages: [] }),
      },
      {},
    );
    expect(r.status).toBe(503);
  });

  it("401 unauthenticated", async () => {
    const r = await buildApp().request(
      "/subs/scan",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: [{ from: "a@b.com", subject: "x" }],
        }),
      },
      { LENS_D1: d1() },
    );
    expect(r.status).toBe(401);
  });

  it("400 on invalid body (empty messages array)", async () => {
    const r = await buildApp().request(
      "/subs/scan",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u" },
        body: JSON.stringify({ messages: [] }),
      },
      { LENS_D1: d1() },
    );
    expect(r.status).toBe(400);
  });

  it("classifies 3 mixed messages (2 subs + 1 marketing)", async () => {
    const env = { LENS_D1: d1() };
    const msgs = [
      {
        id: "m1",
        from: "info@netflix.com",
        subject: "Your Netflix subscription has been renewed",
        bodyText: "Your Netflix Premium has been renewed. Charged $22.99. Next billing May 22, 2026.",
      },
      {
        id: "m2",
        from: "no-reply@spotify.com",
        subject: "Your Premium plan renews soon",
        bodyText: "Your Spotify Premium renews on 2026-05-10 for $11.99 per month.",
      },
      {
        id: "m3",
        from: "news@netflix.com",
        subject: "New releases this week on Netflix",
        bodyText: "Top picks for you today.",
      },
    ];
    const r = await buildApp().request(
      "/subs/scan",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ messages: msgs }),
      },
      env,
    );
    const body = (await r.json()) as {
      matchedCount: number;
      unmatchedCount: number;
      matched: Array<{ classified: { service: string } }>;
    };
    expect(r.status).toBe(200);
    expect(body.matchedCount).toBe(2);
    expect(body.unmatchedCount).toBe(1);
    expect(body.matched.map((m) => m.classified.service).sort()).toEqual(
      ["Netflix", "Spotify Premium"],
    );
  });
});

describe("GET /subs", () => {
  it("returns empty when no user", async () => {
    const r = await buildApp().request("/subs", {}, { LENS_D1: d1() });
    const body = (await r.json()) as { count: number };
    expect(body.count).toBe(0);
  });

  it("lists subs written by POST /subs/scan", async () => {
    const env = { LENS_D1: d1() };
    await buildApp().request(
      "/subs/scan",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({
          messages: [
            {
              from: "info@netflix.com",
              subject: "Your subscription has been renewed",
              bodyText: "Charged $22.99 per month.",
            },
          ],
        }),
      },
      env,
    );
    const r = await buildApp().request("/subs", { headers: { "x-test-user": "u1" } }, env);
    const body = (await r.json()) as { subscriptions: Array<{ service: string }> };
    expect(body.subscriptions.length).toBe(1);
    expect(body.subscriptions[0]!.service).toBe("Netflix");
  });
});

describe("GET /subs/upcoming", () => {
  it("returns items within the window", async () => {
    const env = { LENS_D1: d1() };
    const in3 = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    await buildApp().request(
      "/subs/scan",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({
          messages: [
            {
              from: "info@netflix.com",
              subject: "Your subscription has been renewed",
              bodyText: `Next billing on ${in3} for $22.99 per month.`,
            },
          ],
        }),
      },
      env,
    );
    const r = await buildApp().request(
      "/subs/upcoming?days=7",
      { headers: { "x-test-user": "u1" } },
      env,
    );
    const body = (await r.json()) as { count: number };
    expect(body.count).toBe(1);
  });
});

describe("PATCH + DELETE + cancel-draft", () => {
  it("toggles active + deletes + surfaces cancel draft", async () => {
    const env = { LENS_D1: d1() };
    await buildApp().request(
      "/subs/scan",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({
          messages: [
            {
              from: "info@netflix.com",
              subject: "Your subscription has been renewed",
              bodyText: "Charged $22.99 per month.",
            },
          ],
        }),
      },
      env,
    );
    const list = (await (
      await buildApp().request("/subs", { headers: { "x-test-user": "u1" } }, env)
    ).json()) as { subscriptions: Array<{ id: string }> };
    const id = list.subscriptions[0]!.id;

    const patch = await buildApp().request(
      `/subs/${id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ active: false }),
      },
      env,
    );
    expect(patch.status).toBe(200);

    const draft = await buildApp().request(
      `/subs/${id}/cancel-draft`,
      { method: "POST", headers: { "x-test-user": "u1" } },
      env,
    );
    const draftBody = (await draft.json()) as { draft: { interventionSlug: string } };
    expect(draftBody.draft.interventionSlug).toBe("intervention/draft-cancel-subscription");

    const del = await buildApp().request(
      `/subs/${id}`,
      { method: "DELETE", headers: { "x-test-user": "u1" } },
      env,
    );
    expect(del.status).toBe(200);
  });

  it("403 when patching another user's row", async () => {
    const env = { LENS_D1: d1() };
    await buildApp().request(
      "/subs/scan",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u-owner" },
        body: JSON.stringify({
          messages: [{ from: "info@netflix.com", subject: "renewed", bodyText: "Charged $22.99 per month." }],
        }),
      },
      env,
    );
    const list = (await (
      await buildApp().request("/subs", { headers: { "x-test-user": "u-owner" } }, env)
    ).json()) as { subscriptions: Array<{ id: string }> };
    const id = list.subscriptions[0]!.id;
    const r = await buildApp().request(
      `/subs/${id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-test-user": "u-other" },
        body: JSON.stringify({ active: false }),
      },
      env,
    );
    expect(r.status).toBe(403);
  });
});
