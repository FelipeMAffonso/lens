import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { handleDiscover } from "./handler.js";
import { createMemoryD1 } from "../db/memory-d1.js";

function buildApp() {
  const app = new Hono<{
    Bindings: { LENS_D1?: unknown };
    Variables: { userId?: string; anonUserId?: string };
  }>();
  app.use("*", async (c, next) => {
    const uid = c.req.header("x-test-user");
    if (uid) c.set("userId", uid);
    await next();
  });
  app.post("/accessories/discover", (c) => handleDiscover(c as never));
  return app;
}

function d1() {
  const db = createMemoryD1();
  db._setPrimaryKey("purchases", "id");
  return db;
}

async function seedPurchase(
  db: ReturnType<typeof d1>,
  over: Partial<{
    id: string;
    user_id: string;
    product_name: string;
    brand: string;
    category: string | null;
  }> = {},
): Promise<string> {
  const row = {
    id: "p-1",
    user_id: "u1",
    source: "gmail",
    source_ref: "m-1",
    retailer: "Amazon",
    order_id: "A-1",
    product_name: "Breville Bambino Plus",
    brand: "Breville",
    category: "espresso-machines",
    price: 499,
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

describe("POST /accessories/discover", () => {
  it("400 when neither purchaseId nor productContext supplied", async () => {
    const r = await buildApp().request(
      "/accessories/discover",
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      {},
    );
    expect(r.status).toBe(400);
  });

  it("returns candidates for a productContext-only request (no auth needed)", async () => {
    const r = await buildApp().request(
      "/accessories/discover",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productContext: { category: "espresso-machines", brand: "Breville", productName: "Breville Bambino Plus" },
          criteria: { quality: 0.5, price: 0.3, longevity: 0.2 },
        }),
      },
      {},
    );
    const body = (await r.json()) as {
      source: string;
      candidates: Array<{ name: string; compat: { compatible: boolean } }>;
      incompatible: unknown[];
    };
    expect(r.status).toBe(200);
    expect(body.source).toBe("fixture");
    expect(body.candidates.length).toBeGreaterThan(0);
    for (const c of body.candidates) expect(c.compat.compatible).toBe(true);
  });

  it("503 when purchaseId supplied but D1 missing", async () => {
    const r = await buildApp().request(
      "/accessories/discover",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ purchaseId: "p-1" }),
      },
      {},
    );
    expect(r.status).toBe(503);
  });

  it("401 when purchaseId supplied but unauthenticated", async () => {
    const r = await buildApp().request(
      "/accessories/discover",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ purchaseId: "p-1" }),
      },
      { LENS_D1: d1() },
    );
    expect(r.status).toBe(401);
  });

  it("404 when purchase does not exist", async () => {
    const r = await buildApp().request(
      "/accessories/discover",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ purchaseId: "missing" }),
      },
      { LENS_D1: d1() },
    );
    expect(r.status).toBe(404);
  });

  it("403 when purchase belongs to a different user", async () => {
    const db = d1();
    await seedPurchase(db, { user_id: "someone-else" });
    const r = await buildApp().request(
      "/accessories/discover",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ purchaseId: "p-1" }),
      },
      { LENS_D1: db },
    );
    expect(r.status).toBe(403);
  });

  it("422 when the purchase has no category", async () => {
    const db = d1();
    await seedPurchase(db, { category: null });
    const r = await buildApp().request(
      "/accessories/discover",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ purchaseId: "p-1" }),
      },
      { LENS_D1: db },
    );
    expect(r.status).toBe(422);
  });

  it("returns compat-aware candidates for a Breville espresso purchase", async () => {
    const db = d1();
    await seedPurchase(db);
    const r = await buildApp().request(
      "/accessories/discover",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ purchaseId: "p-1", limit: 10 }),
      },
      { LENS_D1: db },
    );
    const body = (await r.json()) as {
      candidates: Array<{ name: string; compat: { rule: string } }>;
      incompatible: Array<{ name: string; compat: { rule: string } }>;
      productContext: { category: string; brand: string };
    };
    expect(r.status).toBe(200);
    expect(body.productContext.category).toBe("espresso-machines");
    expect(body.productContext.brand).toBe("Breville");
    // 54mm tamper should pass for Breville.
    expect(body.candidates.some((c) => c.name === "54mm Calibrated Tamper")).toBe(true);
    // Breville water filter passes.
    expect(body.candidates.some((c) => c.name === "Breville Claro Swiss Water Filter (2-pack)")).toBe(true);
  });

  it("empty category returns reason", async () => {
    const r = await buildApp().request(
      "/accessories/discover",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productContext: { category: "blenders", productName: "Vitamix Pro 750" },
        }),
      },
      {},
    );
    const body = (await r.json()) as { candidates: unknown[]; reason: string };
    expect(body.candidates).toEqual([]);
    expect(body.reason).toContain("no accessory fixtures");
  });

  it("5-owned-product acceptance: each category returns ≥ 1 candidate", async () => {
    const cases = [
      { category: "espresso-machines", brand: "Breville", productName: "Breville Bambino Plus" },
      { category: "laptops", brand: "Apple", productName: "MacBook Air M3" },
      { category: "headphones", brand: "Sony", productName: "Sony WH-1000XM5" },
      { category: "coffee-makers", brand: "Keurig", productName: "Keurig K-Mini" },
    ];
    for (const ctx of cases) {
      const r = await buildApp().request(
        "/accessories/discover",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ productContext: ctx, limit: 10 }),
        },
        {},
      );
      const body = (await r.json()) as { candidates: unknown[] };
      expect(body.candidates.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("limit caps the candidate count", async () => {
    const r = await buildApp().request(
      "/accessories/discover",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productContext: { category: "espresso-machines", brand: "Breville", productName: "Barista Express" },
          limit: 2,
        }),
      },
      {},
    );
    const body = (await r.json()) as { candidates: unknown[] };
    expect(body.candidates.length).toBeLessThanOrEqual(2);
  });

  it("cross-user purchases don't leak accessory data", async () => {
    const db = d1();
    await seedPurchase(db, { id: "p-a", user_id: "user-A", product_name: "Breville XXX" });
    const r = await buildApp().request(
      "/accessories/discover",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "user-B" },
        body: JSON.stringify({ purchaseId: "p-a" }),
      },
      { LENS_D1: db },
    );
    expect(r.status).toBe(403);
  });

  it("no candidate URL carries an affiliate query parameter", async () => {
    const r = await buildApp().request(
      "/accessories/discover",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productContext: { category: "laptops", brand: "Apple", productName: "MacBook Pro" },
          limit: 20,
        }),
      },
      {},
    );
    const body = (await r.json()) as { candidates: Array<{ url: string | null }> };
    for (const c of body.candidates) {
      if (c.url !== null) {
        expect(c.url).not.toMatch(/(ref=|tag=|utm_|shareasale|affiliate)/i);
      }
    }
  });
});
