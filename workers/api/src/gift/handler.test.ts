import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import {
  handleAudit,
  handleCreate,
  handleList,
  handleRecipientGet,
  handleRecipientPost,
  handleRevoke,
} from "./handler.js";
import { createMemoryD1 } from "../db/memory-d1.js";

function buildApp() {
  const app = new Hono<{
    Bindings: { LENS_D1?: unknown; JWT_SECRET?: string; MAGIC_LINK_BASE_URL?: string };
    Variables: { userId?: string };
  }>();
  app.use("*", async (c, next) => {
    const uid = c.req.header("x-test-user");
    if (uid) c.set("userId", uid);
    await next();
  });
  app.post("/gift/requests", (c) => handleCreate(c as never));
  app.get("/gift/requests", (c) => handleList(c as never));
  app.get("/gift/requests/:id/audit", (c) => handleAudit(c as never));
  app.delete("/gift/requests/:id", (c) => handleRevoke(c as never));
  app.get("/gift/recipient", (c) => handleRecipientGet(c as never));
  app.post("/gift/recipient", (c) => handleRecipientPost(c as never));
  return app;
}

function d1() {
  const db = createMemoryD1();
  db._setPrimaryKey("gift_requests", "id");
  db._setPrimaryKey("gift_responses", "gift_id");
  return db;
}

const SECRET = "test-secret-uvwxyz-123456";

async function createGiftAndGetToken(
  env: { LENS_D1: unknown; JWT_SECRET: string },
  overrides: Record<string, unknown> = {},
): Promise<{ giftId: string; shareUrl: string; token: string }> {
  const r = await buildApp().request(
    "/gift/requests",
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-user": "u1" },
      body: JSON.stringify({
        recipientLabel: "Dad",
        occasion: "birthday",
        category: "espresso-machines",
        budgetMaxUsd: 350,
        ...overrides,
      }),
    },
    env,
  );
  const body = (await r.json()) as { gift: { id: string }; shareUrl: string };
  const url = new URL(body.shareUrl);
  const token = url.searchParams.get("token")!;
  return { giftId: body.gift.id, shareUrl: body.shareUrl, token };
}

describe("POST /gift/requests — create", () => {
  it("503 no D1", async () => {
    const r = await buildApp().request(
      "/gift/requests",
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      {},
    );
    expect(r.status).toBe(503);
  });

  it("401 unauth", async () => {
    const r = await buildApp().request(
      "/gift/requests",
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      { LENS_D1: d1(), JWT_SECRET: SECRET },
    );
    expect(r.status).toBe(401);
  });

  it("503 when JWT_SECRET is not configured", async () => {
    const r = await buildApp().request(
      "/gift/requests",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ budgetMaxUsd: 100 }),
      },
      { LENS_D1: d1() },
    );
    expect(r.status).toBe(503);
  });

  it("400 on invalid body (missing budgetMaxUsd)", async () => {
    const r = await buildApp().request(
      "/gift/requests",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: "{}",
      },
      { LENS_D1: d1(), JWT_SECRET: SECRET },
    );
    expect(r.status).toBe(400);
  });

  it("400 when budgetMin > budgetMax", async () => {
    const r = await buildApp().request(
      "/gift/requests",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ budgetMinUsd: 400, budgetMaxUsd: 100 }),
      },
      { LENS_D1: d1(), JWT_SECRET: SECRET },
    );
    expect(r.status).toBe(400);
  });

  it("returns 201 + shareUrl + opaque token on success", async () => {
    const env = { LENS_D1: d1(), JWT_SECRET: SECRET };
    const { giftId, token, shareUrl } = await createGiftAndGetToken(env);
    expect(giftId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(shareUrl).toContain("/gift/respond");
    expect(token.split(".").length).toBe(3);
  });
});

describe("GET /gift/requests — list", () => {
  it("401 unauth", async () => {
    const r = await buildApp().request("/gift/requests", {}, { LENS_D1: d1(), JWT_SECRET: SECRET });
    expect(r.status).toBe(401);
  });

  it("lists the signed-in user's gifts with hasResponse flag", async () => {
    const env = { LENS_D1: d1(), JWT_SECRET: SECRET };
    await createGiftAndGetToken(env);
    const r = await buildApp().request(
      "/gift/requests",
      { headers: { "x-test-user": "u1" } },
      env,
    );
    const body = (await r.json()) as { gifts: Array<{ hasResponse: boolean }>; count: number };
    expect(body.count).toBe(1);
    expect(body.gifts[0]!.hasResponse).toBe(false);
  });

  it("other users don't see each other's gifts", async () => {
    const env = { LENS_D1: d1(), JWT_SECRET: SECRET };
    await createGiftAndGetToken(env);
    const r = await buildApp().request(
      "/gift/requests",
      { headers: { "x-test-user": "u-other" } },
      env,
    );
    const body = (await r.json()) as { count: number };
    expect(body.count).toBe(0);
  });
});

describe("GET /gift/recipient — public question endpoint", () => {
  it("400 missing token", async () => {
    const r = await buildApp().request("/gift/recipient", {}, { LENS_D1: d1(), JWT_SECRET: SECRET });
    expect(r.status).toBe(400);
  });

  it("401 malformed token", async () => {
    const r = await buildApp().request(
      "/gift/recipient?token=not-a-real-token",
      {},
      { LENS_D1: d1(), JWT_SECRET: SECRET },
    );
    expect([401, 404]).toContain(r.status);
  });

  it("returns the question shape with a coarse band (never the raw budget)", async () => {
    const env = { LENS_D1: d1(), JWT_SECRET: SECRET };
    const { token } = await createGiftAndGetToken(env, { budgetMaxUsd: 350 });
    const r = await buildApp().request(
      `/gift/recipient?token=${encodeURIComponent(token)}`,
      {},
      env,
    );
    const body = (await r.json()) as {
      gift: { budgetBand: string; budgetBandHint: string };
      questionTemplate: { criteria: unknown[] };
    };
    expect(r.status).toBe(200);
    expect(body.gift.budgetBand).toBe("premium");
    expect(body.questionTemplate.criteria.length).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toContain("350");
  });
});

describe("POST /gift/recipient — submit", () => {
  it("submits criteria + flips status to completed", async () => {
    const env = { LENS_D1: d1(), JWT_SECRET: SECRET };
    const { giftId, token } = await createGiftAndGetToken(env);
    const r = await buildApp().request(
      `/gift/recipient?token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          criteria: { pressure: 0.4, build_quality: 0.3, ease_of_use: 0.3 },
          notes: "He drinks it black",
        }),
      },
      env,
    );
    const body = (await r.json()) as { ok: boolean; acknowledged: boolean };
    expect(r.status).toBe(200);
    expect(body.acknowledged).toBe(true);

    const list = (await (
      await buildApp().request("/gift/requests", { headers: { "x-test-user": "u1" } }, env)
    ).json()) as { gifts: Array<{ id: string; status: string; hasResponse: boolean }> };
    const gift = list.gifts.find((g) => g.id === giftId);
    expect(gift!.status).toBe("completed");
    expect(gift!.hasResponse).toBe(true);
  });

  it("400 on invalid body", async () => {
    const env = { LENS_D1: d1(), JWT_SECRET: SECRET };
    const { token } = await createGiftAndGetToken(env);
    const r = await buildApp().request(
      `/gift/recipient?token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notes: "just notes" }),
      },
      env,
    );
    expect(r.status).toBe(400);
  });
});

describe("GET /gift/requests/:id/audit — giver view", () => {
  it("401 unauth", async () => {
    const r = await buildApp().request(
      "/gift/requests/anything/audit",
      {},
      { LENS_D1: d1(), JWT_SECRET: SECRET },
    );
    expect(r.status).toBe(401);
  });

  it("404 when not found", async () => {
    const r = await buildApp().request(
      "/gift/requests/missing/audit",
      { headers: { "x-test-user": "u1" } },
      { LENS_D1: d1(), JWT_SECRET: SECRET },
    );
    expect(r.status).toBe(404);
  });

  it("403 cross-user", async () => {
    const env = { LENS_D1: d1(), JWT_SECRET: SECRET };
    const { giftId } = await createGiftAndGetToken(env);
    const r = await buildApp().request(
      `/gift/requests/${giftId}/audit`,
      { headers: { "x-test-user": "u-attacker" } },
      env,
    );
    expect(r.status).toBe(403);
  });

  it("null audit + response=null when recipient hasn't responded", async () => {
    const env = { LENS_D1: d1(), JWT_SECRET: SECRET };
    const { giftId } = await createGiftAndGetToken(env);
    const r = await buildApp().request(
      `/gift/requests/${giftId}/audit`,
      { headers: { "x-test-user": "u1" } },
      env,
    );
    const body = (await r.json()) as { response: unknown; audit: unknown };
    expect(r.status).toBe(200);
    expect(body.response).toBeNull();
    expect(body.audit).toBeNull();
  });

  it("returns ranked candidates after recipient submits", async () => {
    const env = { LENS_D1: d1(), JWT_SECRET: SECRET };
    const { giftId, token } = await createGiftAndGetToken(env, { budgetMaxUsd: 500 });
    await buildApp().request(
      `/gift/recipient?token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          criteria: { pressure: 0.5, build_score: 0.5 },
        }),
      },
      env,
    );
    const r = await buildApp().request(
      `/gift/requests/${giftId}/audit`,
      { headers: { "x-test-user": "u1" } },
      env,
    );
    const body = (await r.json()) as {
      response: unknown;
      audit: { catalog: string; candidates: Array<{ name: string }> };
    };
    expect(r.status).toBe(200);
    expect(body.response).not.toBeNull();
    expect(body.audit.catalog).toBe("fixture");
    expect(body.audit.candidates.length).toBeGreaterThan(0);
  });
});

describe("DELETE /gift/requests/:id — revoke", () => {
  it("revokes + subsequent recipient access returns 410", async () => {
    const env = { LENS_D1: d1(), JWT_SECRET: SECRET };
    const { giftId, token } = await createGiftAndGetToken(env);
    const r = await buildApp().request(
      `/gift/requests/${giftId}`,
      { method: "DELETE", headers: { "x-test-user": "u1" } },
      env,
    );
    expect(r.status).toBe(200);
    const recipient = await buildApp().request(
      `/gift/recipient?token=${encodeURIComponent(token)}`,
      {},
      env,
    );
    expect(recipient.status).toBe(410);
  });

  it("403 when someone else tries to revoke", async () => {
    const env = { LENS_D1: d1(), JWT_SECRET: SECRET };
    const { giftId } = await createGiftAndGetToken(env);
    const r = await buildApp().request(
      `/gift/requests/${giftId}`,
      { method: "DELETE", headers: { "x-test-user": "u-attacker" } },
      env,
    );
    expect(r.status).toBe(403);
  });
});
