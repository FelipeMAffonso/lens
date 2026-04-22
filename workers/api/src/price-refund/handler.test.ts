import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { handleFile, handleScan, handleWindows } from "./handler.js";
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
  app.get("/price-refund/windows", (c) => handleWindows(c as never));
  app.post("/price-refund/scan", (c) => handleScan(c as never));
  app.post("/price-refund/:purchaseId/file", (c) => handleFile(c as never));
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
    retailer: string;
    product_name: string;
    price: number;
    purchased_at: string;
    order_id: string;
  }> = {},
): Promise<string> {
  const row = {
    id: "p-1",
    user_id: "u1",
    source: "gmail",
    source_ref: "m-1",
    retailer: "Best Buy",
    order_id: "BBY-111",
    product_name: "MacBook Air M3",
    brand: "Apple",
    category: "laptops",
    price: 1499,
    currency: "USD",
    purchased_at: new Date().toISOString().slice(0, 10),
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

describe("GET /price-refund/windows", () => {
  it("returns the table publicly", async () => {
    const r = await buildApp().request("/price-refund/windows", {}, {});
    const body = (await r.json()) as { windows: Array<{ retailer: string }> };
    expect(r.status).toBe(200);
    expect(body.windows.length).toBeGreaterThan(5);
    expect(body.windows.some((w) => w.retailer === "Best Buy")).toBe(true);
  });
});

describe("POST /price-refund/scan", () => {
  it("503 when D1 missing", async () => {
    const r = await buildApp().request(
      "/price-refund/scan",
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      {},
    );
    expect(r.status).toBe(503);
  });

  it("401 when no principal", async () => {
    const r = await buildApp().request(
      "/price-refund/scan",
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      { LENS_D1: d1() },
    );
    expect(r.status).toBe(401);
  });

  it("surfaces an eligible claim when overrides provide current price", async () => {
    const db = d1();
    const id = await seedPurchase(db, { id: "p-a", purchased_at: new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10) });
    const r = await buildApp().request(
      "/price-refund/scan",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ overrides: [{ purchaseId: id, currentPrice: 1399 }] }),
      },
      { LENS_D1: db },
    );
    const body = (await r.json()) as {
      eligible: number;
      ineligible: number;
      candidates: Array<{ decision: { claim: boolean } }>;
    };
    expect(r.status).toBe(200);
    expect(body.eligible).toBe(1);
    expect(body.candidates[0]!.decision.claim).toBe(true);
  });

  it("returns ineligible for unsupported retailers", async () => {
    const db = d1();
    const id = await seedPurchase(db, {
      id: "p-b",
      retailer: "Amazon",
      purchased_at: new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10),
    });
    const r = await buildApp().request(
      "/price-refund/scan",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ overrides: [{ purchaseId: id, currentPrice: 500 }] }),
      },
      { LENS_D1: db },
    );
    const body = (await r.json()) as { eligible: number; ineligible: number };
    expect(body.eligible).toBe(0);
    expect(body.ineligible).toBe(1);
  });
});

describe("POST /price-refund/:purchaseId/file", () => {
  it("writes an intervention row on eligible claim", async () => {
    const db = d1();
    const id = await seedPurchase(db, {
      id: "p-c",
      purchased_at: new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10),
    });
    const r = await buildApp().request(
      `/price-refund/${id}/file`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ currentPrice: 1350 }),
      },
      { LENS_D1: db },
    );
    const body = (await r.json()) as {
      ok: boolean;
      intervention: { pack_slug: string; related_purchase_id: string };
      draft: { businessName: string; priceDelta: number };
    };
    expect(r.status).toBe(200);
    expect(body.intervention.pack_slug).toBe("intervention/file-price-match-claim");
    expect(body.intervention.related_purchase_id).toBe(id);
    expect(body.draft.businessName).toBe("Best Buy");
    expect(body.draft.priceDelta).toBe(149);
  });

  it("422 when not eligible", async () => {
    const db = d1();
    const id = await seedPurchase(db, {
      id: "p-d",
      purchased_at: new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10),
    });
    const r = await buildApp().request(
      `/price-refund/${id}/file`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ currentPrice: 1499 }), // no drop
      },
      { LENS_D1: db },
    );
    expect(r.status).toBe(422);
  });

  it("404 when purchase not owned by user", async () => {
    const db = d1();
    const id = await seedPurchase(db, { id: "p-e", user_id: "someone-else" });
    const r = await buildApp().request(
      `/price-refund/${id}/file`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ currentPrice: 1200 }),
      },
      { LENS_D1: db },
    );
    expect(r.status).toBe(404);
  });

  it("400 on missing currentPrice", async () => {
    const db = d1();
    const id = await seedPurchase(db, { id: "p-f" });
    const r = await buildApp().request(
      `/price-refund/${id}/file`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: "{}",
      },
      { LENS_D1: db },
    );
    expect(r.status).toBe(400);
  });
});
