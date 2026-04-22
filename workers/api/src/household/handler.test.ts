import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import {
  handleCreate,
  handleDelete,
  handleEffective,
  handleList,
  handlePatch,
} from "./handler.js";
import { createMemoryD1 } from "../db/memory-d1.js";

function buildApp() {
  const app = new Hono<{
    Bindings: { LENS_D1?: unknown };
    Variables: { userId?: string; anonUserId?: string };
  }>();
  app.use("*", async (c, next) => {
    const uid = c.req.header("x-test-user");
    if (uid) c.set("userId", uid);
    const anon = c.req.header("x-test-anon");
    if (anon) c.set("anonUserId", anon);
    await next();
  });
  app.get("/household/members", (c) => handleList(c as never));
  app.post("/household/members", (c) => handleCreate(c as never));
  app.patch("/household/members/:id", (c) => handlePatch(c as never));
  app.delete("/household/members/:id", (c) => handleDelete(c as never));
  app.get("/preferences/effective", (c) => handleEffective(c as never));
  return app;
}

function d1() {
  const db = createMemoryD1();
  db._setPrimaryKey("household_members", "id");
  db._setPrimaryKey("preferences", "id");
  return db;
}

describe("household member CRUD", () => {
  it("503 when D1 missing", async () => {
    const r = await buildApp().request("/household/members", {}, {});
    expect(r.status).toBe(503);
  });

  it("401 when unauth (GET)", async () => {
    const r = await buildApp().request("/household/members", {}, { LENS_D1: d1() });
    expect(r.status).toBe(401);
  });

  it("returns empty list for a brand-new user", async () => {
    const r = await buildApp().request(
      "/household/members",
      { headers: { "x-test-user": "u1" } },
      { LENS_D1: d1() },
    );
    const body = (await r.json()) as { members: unknown[]; count: number };
    expect(body.count).toBe(0);
  });

  it("POST creates a member and returns it with 201", async () => {
    const env = { LENS_D1: d1() };
    const r = await buildApp().request(
      "/household/members",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ name: "Felipe", role: "adult" }),
      },
      env,
    );
    expect(r.status).toBe(201);
    const body = (await r.json()) as { member: { id: string; name: string; role: string } };
    expect(body.member.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(body.member.name).toBe("Felipe");
    expect(body.member.role).toBe("adult");
  });

  it("POST 400 on invalid input (name too short)", async () => {
    const r = await buildApp().request(
      "/household/members",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ name: "" }),
      },
      { LENS_D1: d1() },
    );
    expect(r.status).toBe(400);
  });

  it("POST 401 unauth", async () => {
    const r = await buildApp().request(
      "/household/members",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "X" }),
      },
      { LENS_D1: d1() },
    );
    expect(r.status).toBe(401);
  });

  it("PATCH updates a member", async () => {
    const env = { LENS_D1: d1() };
    const created = await buildApp().request(
      "/household/members",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ name: "Ana", role: "teen" }),
      },
      env,
    );
    const { member } = (await created.json()) as { member: { id: string } };
    const r = await buildApp().request(
      `/household/members/${member.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ name: "Ana Maria", birthYear: 2010 }),
      },
      env,
    );
    const body = (await r.json()) as { member: { name: string; birth_year: number } };
    expect(r.status).toBe(200);
    expect(body.member.name).toBe("Ana Maria");
    expect(body.member.birth_year).toBe(2010);
  });

  it("PATCH 404 when member not found", async () => {
    const r = await buildApp().request(
      "/household/members/missing",
      {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ name: "X" }),
      },
      { LENS_D1: d1() },
    );
    expect(r.status).toBe(404);
  });

  it("PATCH 403 cross-user", async () => {
    const env = { LENS_D1: d1() };
    const created = await buildApp().request(
      "/household/members",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "owner" },
        body: JSON.stringify({ name: "X" }),
      },
      env,
    );
    const { member } = (await created.json()) as { member: { id: string } };
    const r = await buildApp().request(
      `/household/members/${member.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-test-user": "attacker" },
        body: JSON.stringify({ name: "Pwned" }),
      },
      env,
    );
    expect(r.status).toBe(403);
  });

  it("DELETE soft-archives + subsequent list without includeArchived hides it", async () => {
    const env = { LENS_D1: d1() };
    const created = await buildApp().request(
      "/household/members",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ name: "Leaving" }),
      },
      env,
    );
    const { member } = (await created.json()) as { member: { id: string } };
    const del = await buildApp().request(
      `/household/members/${member.id}`,
      { method: "DELETE", headers: { "x-test-user": "u1" } },
      env,
    );
    expect(del.status).toBe(200);
    const listActive = await buildApp().request(
      "/household/members",
      { headers: { "x-test-user": "u1" } },
      env,
    );
    const activeBody = (await listActive.json()) as { count: number };
    expect(activeBody.count).toBe(0);
    const listAll = await buildApp().request(
      "/household/members?includeArchived=1",
      { headers: { "x-test-user": "u1" } },
      env,
    );
    const allBody = (await listAll.json()) as { count: number };
    expect(allBody.count).toBe(1);
  });
});

describe("GET /preferences/effective", () => {
  it("400 when category missing", async () => {
    const r = await buildApp().request(
      "/preferences/effective",
      { headers: { "x-test-user": "u1" } },
      { LENS_D1: d1() },
    );
    expect(r.status).toBe(400);
  });

  it("returns source=none for a user with no stored preference", async () => {
    const r = await buildApp().request(
      "/preferences/effective?category=espresso-machines",
      { headers: { "x-test-user": "u1" } },
      { LENS_D1: d1() },
    );
    const body = (await r.json()) as { source: string; resolved: unknown };
    expect(body.source).toBe("none");
    expect(body.resolved).toBeNull();
  });

  it("returns source=household for the household default", async () => {
    const env = { LENS_D1: d1() };
    // Seed via upsertPreference direct (no route)
    const { upsertPreference } = await import("../db/repos/preferences.js");
    await upsertPreference(env.LENS_D1 as never, {
      userId: "u1",
      anonUserId: null,
      category: "espresso-machines",
      criteria: { pressure: 0.3, price: 0.4 },
    });
    const r = await buildApp().request(
      "/preferences/effective?category=espresso-machines",
      { headers: { "x-test-user": "u1" } },
      env,
    );
    const body = (await r.json()) as { source: string };
    expect(body.source).toBe("household");
  });

  it("returns source=profile when a per-profile override exists", async () => {
    const env = { LENS_D1: d1() };
    const created = await buildApp().request(
      "/household/members",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ name: "Felipe" }),
      },
      env,
    );
    const { member } = (await created.json()) as { member: { id: string } };
    const { upsertPreference } = await import("../db/repos/preferences.js");
    await upsertPreference(env.LENS_D1 as never, {
      userId: "u1",
      anonUserId: null,
      category: "espresso-machines",
      criteria: { pressure: 0.3, price: 0.4 },
    });
    await upsertPreference(env.LENS_D1 as never, {
      userId: "u1",
      anonUserId: null,
      category: "espresso-machines",
      profileId: member.id,
      criteria: { pressure: 0.6, price: 0.2 },
    });
    const r = await buildApp().request(
      `/preferences/effective?category=espresso-machines&profileId=${member.id}`,
      { headers: { "x-test-user": "u1" } },
      env,
    );
    const body = (await r.json()) as { source: string; resolved: { criteria_json: string } };
    expect(body.source).toBe("profile");
    const criteria = JSON.parse(body.resolved.criteria_json) as Record<string, number>;
    expect(criteria["pressure"]).toBe(0.6);
  });
});
