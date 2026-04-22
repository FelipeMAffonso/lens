import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { handleScan, runForUser } from "./handler.js";
import { createMemoryD1 } from "../db/memory-d1.js";

function buildApp() {
  const app = new Hono<{
    Bindings: { LENS_D1?: unknown; LENS_FIRMWARE_MODE?: string };
    Variables: { userId?: string; anonUserId?: string };
  }>();
  app.use("*", async (c, next) => {
    const uid = c.req.header("x-test-user");
    if (uid) c.set("userId", uid);
    await next();
  });
  app.post("/firmware/scan", (c) => handleScan(c as never));
  return app;
}

function d1() {
  const db = createMemoryD1();
  db._setPrimaryKey("purchases", "id");
  db._setPrimaryKey("interventions", "id");
  return db;
}

async function seedPurchase(
  db: ReturnType<typeof d1>,
  over: Partial<{
    id: string;
    user_id: string;
    product_name: string;
    brand: string;
    category: string;
    purchased_at: string;
  }> = {},
): Promise<string> {
  const row = {
    id: "p-asus",
    user_id: "u1",
    source: "gmail",
    source_ref: "m-1",
    retailer: "Amazon",
    order_id: "A-1",
    product_name: "ASUS RT-AX88U AX6000 Dual-Band Gaming Router",
    brand: "ASUS",
    category: "routers",
    price: 349,
    currency: "USD",
    purchased_at: "2025-02-01T00:00:00.000Z",
    delivered_at: null,
    warranty_until: null,
    raw_payload_json: null,
    created_at: new Date().toISOString(),
    ...over,
  };
  await db
    .prepare(
      `INSERT INTO purchases (
        id, user_id, source, source_ref, retailer, order_id, product_name,
        brand, category, price, currency, purchased_at, delivered_at,
        warranty_until, raw_payload_json, created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      row.id,
      row.user_id,
      row.source,
      row.source_ref,
      row.retailer,
      row.order_id,
      row.product_name,
      row.brand,
      row.category,
      row.price,
      row.currency,
      row.purchased_at,
      row.delivered_at,
      row.warranty_until,
      row.raw_payload_json,
      row.created_at,
    )
    .run();
  return row.id;
}

describe("POST /firmware/scan", () => {
  it("503 when D1 missing", async () => {
    const r = await buildApp().request(
      "/firmware/scan",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: "{}",
      },
      {},
    );
    expect(r.status).toBe(503);
  });

  it("401 when unauth", async () => {
    const r = await buildApp().request(
      "/firmware/scan",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      },
      { LENS_D1: d1() },
    );
    expect(r.status).toBe(401);
  });

  it("400 on invalid body (purchaseIds wrong type)", async () => {
    const r = await buildApp().request(
      "/firmware/scan",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ purchaseIds: "not-an-array" }),
      },
      { LENS_D1: d1() },
    );
    expect(r.status).toBe(400);
  });

  it("returns zero matches for a user with no purchases", async () => {
    const r = await buildApp().request(
      "/firmware/scan",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: "{}",
      },
      { LENS_D1: d1() },
    );
    const body = (await r.json()) as { scanned: number; matched: number; interventions: unknown[] };
    expect(r.status).toBe(200);
    expect(body.scanned).toBe(0);
    expect(body.matched).toBe(0);
    expect(body.interventions).toEqual([]);
  });

  it("matches ASUS RT-AX88U + writes intervention for the critical advisory", async () => {
    const env = { LENS_D1: d1() };
    await seedPurchase(env.LENS_D1 as never);
    const r = await buildApp().request(
      "/firmware/scan",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: "{}",
      },
      env,
    );
    const body = (await r.json()) as {
      scanned: number;
      matched: number;
      critical: number;
      interventions: Array<{
        advisoryId: string;
        severity: string;
        vendor: string;
        purchaseId: string;
      }>;
    };
    expect(r.status).toBe(200);
    expect(body.scanned).toBe(1);
    expect(body.matched).toBeGreaterThanOrEqual(1);
    expect(body.critical).toBeGreaterThanOrEqual(1);
    const asus = body.interventions.find((i) => i.advisoryId === "ASUS-SA-2025-07");
    expect(asus).toBeDefined();
    expect(asus!.vendor).toBe("ASUS");
    expect(asus!.severity).toBe("critical");
    expect(asus!.purchaseId).toBe("p-asus");
  });

  it("persists the intervention row tied to the purchase", async () => {
    const env = { LENS_D1: d1() };
    await seedPurchase(env.LENS_D1 as never);
    await buildApp().request(
      "/firmware/scan",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: "{}",
      },
      env,
    );
    const rows = await (env.LENS_D1 as never as ReturnType<typeof d1>)
      .prepare(`SELECT pack_slug, related_purchase_id, status FROM interventions WHERE user_id = ?`)
      .bind("u1")
      .all<{ pack_slug: string; related_purchase_id: string; status: string }>();
    expect(rows.results!.length).toBeGreaterThanOrEqual(1);
    const row = rows.results![0]!;
    expect(row.pack_slug).toBe("advisory/apply-firmware-update");
    expect(row.related_purchase_id).toBe("p-asus");
    expect(row.status).toBe("drafted");
  });

  it("honors purchaseIds filter", async () => {
    const env = { LENS_D1: d1() };
    await seedPurchase(env.LENS_D1 as never, { id: "p-a" });
    await seedPurchase(env.LENS_D1 as never, { id: "p-b", product_name: "Spoon" });
    const r = await buildApp().request(
      "/firmware/scan",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ purchaseIds: ["p-a"] }),
      },
      env,
    );
    const body = (await r.json()) as { scanned: number };
    expect(body.scanned).toBe(1);
  });

  it("doesn't match a blender purchase (category allowlist)", async () => {
    const env = { LENS_D1: d1() };
    await seedPurchase(env.LENS_D1 as never, {
      id: "p-blender",
      product_name: "Vitamix Pro 750",
      brand: "Vitamix",
      category: "blenders",
    });
    const r = await buildApp().request(
      "/firmware/scan",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: "{}",
      },
      env,
    );
    const body = (await r.json()) as { matched: number; interventions: unknown[] };
    expect(body.matched).toBe(0);
    expect(body.interventions).toHaveLength(0);
  });

  it("scope isolation: user A's purchases never trigger user B's scan", async () => {
    const env = { LENS_D1: d1() };
    await seedPurchase(env.LENS_D1 as never, { user_id: "user-A" });
    const r = await buildApp().request(
      "/firmware/scan",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "user-B" },
        body: "{}",
      },
      env,
    );
    const body = (await r.json()) as { scanned: number };
    expect(body.scanned).toBe(0);
  });
});

describe("runForUser (cron path)", () => {
  it("returns assessed matches + intervention count for a seeded user", async () => {
    const db = d1();
    await seedPurchase(db);
    const result = await runForUser("u1", db, { LENS_FIRMWARE_MODE: "fixture" });
    expect(result.assessed.length).toBeGreaterThanOrEqual(1);
    expect(result.interventionCount).toBeGreaterThanOrEqual(1);
  });

  it("returns zero when user has no purchases", async () => {
    const db = d1();
    const result = await runForUser("nobody", db, {});
    expect(result.assessed).toEqual([]);
    expect(result.interventionCount).toBe(0);
  });
});
