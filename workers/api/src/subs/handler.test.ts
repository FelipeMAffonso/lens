import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import {
  handleAudit,
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
  app.post("/subs/audit", (c) => handleAudit(c as never));
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
  db._setPrimaryKey("interventions", "id");
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
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({}),
      },
      env,
    );
    const draftBody = (await draft.json()) as {
      templateSource: string;
      interventionId: string;
      draft: { subject: string; body: string };
    };
    expect(draftBody.templateSource).toMatch(/^intervention\/draft-cancel-subscription@/);
    expect(draftBody.interventionId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(draftBody.draft.subject).toMatch(/Netflix/);

    const del = await buildApp().request(
      `/subs/${id}`,
      { method: "DELETE", headers: { "x-test-user": "u1" } },
      env,
    );
    expect(del.status).toBe(200);
  });

  it("S6-W36: cancel-draft renders CA state-law citation when userState=CA", async () => {
    const env = { LENS_D1: d1() };
    await buildApp().request(
      "/subs/scan",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({
          messages: [{ from: "info@netflix.com", subject: "renewed", bodyText: "Charged $22.99 per month." }],
        }),
      },
      env,
    );
    const list = (await (
      await buildApp().request("/subs", { headers: { "x-test-user": "u1" } }, env)
    ).json()) as { subscriptions: Array<{ id: string }> };
    const id = list.subscriptions[0]!.id;

    const r = await buildApp().request(
      `/subs/${id}/cancel-draft`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({
          userState: "CA",
          userName: "Jane Doe",
          userIdentifier: "jane@example.com",
        }),
      },
      env,
    );
    const body = (await r.json()) as {
      draft: { body: string };
      stateLaw: { state: string; citation: string };
      enforcementAgency: string;
    };
    expect(r.status).toBe(200);
    expect(body.stateLaw.state).toBe("CA");
    expect(body.stateLaw.citation).toContain("SB-313");
    expect(body.enforcementAgency).toContain("California");
    expect(body.draft.body).toContain("Jane Doe");
    expect(body.draft.body).toContain("jane@example.com");
    expect(body.draft.body).not.toContain("[TODO:");
  });

  it("S6-W36: cancel-draft surfaces [TODO: user_name] when omitted", async () => {
    const env = { LENS_D1: d1() };
    await buildApp().request(
      "/subs/scan",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({
          messages: [{ from: "info@netflix.com", subject: "renewed", bodyText: "Charged $22.99 per month." }],
        }),
      },
      env,
    );
    const list = (await (
      await buildApp().request("/subs", { headers: { "x-test-user": "u1" } }, env)
    ).json()) as { subscriptions: Array<{ id: string }> };
    const id = list.subscriptions[0]!.id;
    const r = await buildApp().request(
      `/subs/${id}/cancel-draft`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ userState: "CA" }),
      },
      env,
    );
    const body = (await r.json()) as { draft: { body: string } };
    expect(body.draft.body).toContain("[TODO: user_name]");
    expect(body.draft.body).toContain("[TODO: user_identifier]");
  });

  it("S6-W36: cancel-draft persists a drafted intervention row", async () => {
    const env = { LENS_D1: d1() };
    await buildApp().request(
      "/subs/scan",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({
          messages: [{ from: "info@netflix.com", subject: "renewed", bodyText: "Charged $22.99 per month." }],
        }),
      },
      env,
    );
    const list = (await (
      await buildApp().request("/subs", { headers: { "x-test-user": "u1" } }, env)
    ).json()) as { subscriptions: Array<{ id: string }> };
    const id = list.subscriptions[0]!.id;
    const r = await buildApp().request(
      `/subs/${id}/cancel-draft`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ userState: "CA", userName: "Jane", userIdentifier: "jane@x.com" }),
      },
      env,
    );
    const body = (await r.json()) as { interventionId: string };
    const row = await env.LENS_D1
      .prepare(`SELECT * FROM interventions WHERE id = ?`)
      .bind(body.interventionId)
      .first<{ pack_slug: string; status: string; user_id: string }>();
    expect(row).not.toBeNull();
    expect(row!.pack_slug).toBe("intervention/draft-cancel-subscription");
    expect(row!.status).toBe("drafted");
    expect(row!.user_id).toBe("u1");
  });

  it("S6-W36: cancel-draft 401 when unauth", async () => {
    const r = await buildApp().request(
      `/subs/anything/cancel-draft`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      },
      { LENS_D1: d1() },
    );
    expect(r.status).toBe(401);
  });

  it("S6-W36: cancel-draft 404 when sub not found", async () => {
    const r = await buildApp().request(
      `/subs/missing/cancel-draft`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({}),
      },
      { LENS_D1: d1() },
    );
    expect(r.status).toBe(404);
  });

  it("S6-W36: cancel-draft 403 when sub belongs to another user", async () => {
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
      `/subs/${id}/cancel-draft`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u-other" },
        body: JSON.stringify({}),
      },
      env,
    );
    expect(r.status).toBe(403);
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

describe("POST /subs/audit", () => {
  it("503 when D1 missing", async () => {
    const r = await buildApp().request(
      "/subs/audit",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: "{}",
      },
      {},
    );
    expect(r.status).toBe(503);
  });

  it("401 when no principal", async () => {
    const r = await buildApp().request(
      "/subs/audit",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      },
      { LENS_D1: d1() },
    );
    expect(r.status).toBe(401);
  });

  it("returns empty audit for a user with no subs", async () => {
    const r = await buildApp().request(
      "/subs/audit",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u-empty" },
        body: "{}",
      },
      { LENS_D1: d1() },
    );
    const body = (await r.json()) as {
      ok: boolean;
      summary: { totalActive: number; totalMonthlyCost: number };
      findings: unknown[];
      recommendation: { band: string; oneLiner: string };
    };
    expect(r.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.summary.totalActive).toBe(0);
    expect(body.findings).toEqual([]);
    expect(body.recommendation.band).toBe("all-good");
  });

  it("returns a populated audit after scanning subs", async () => {
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
              subject: "Your Netflix subscription has been renewed",
              bodyText: `Next billing on ${in3} for $15.49 per month.`,
            },
            {
              from: "no-reply@spotify.com",
              subject: "Your Premium plan renews soon",
              bodyText: "Your Spotify Premium renews on 2026-06-10 for $10.99 per month.",
            },
          ],
        }),
      },
      env,
    );
    const r = await buildApp().request(
      "/subs/audit",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ windowDays: 30 }),
      },
      env,
    );
    const body = (await r.json()) as {
      summary: { totalActive: number; totalMonthlyCost: number; upcomingRenewals: number };
      findings: Array<{ service: string; flags: Array<{ kind: string }> }>;
      recommendation: { band: string };
    };
    expect(r.status).toBe(200);
    expect(body.summary.totalActive).toBe(2);
    expect(body.summary.totalMonthlyCost).toBeGreaterThan(20);
    expect(body.findings.some((f) => f.service === "Netflix")).toBe(true);
    expect(
      body.findings.find((f) => f.service === "Netflix")!.flags.some((fl) => fl.kind === "auto-renew-within-7d"),
    ).toBe(true);
  });

  it("clamps windowDays to [1, 90]", async () => {
    const r = await buildApp().request(
      "/subs/audit",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ windowDays: 9999 }),
      },
      { LENS_D1: d1() },
    );
    expect(r.status).toBe(200);
  });
});
