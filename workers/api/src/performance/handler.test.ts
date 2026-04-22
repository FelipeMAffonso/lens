import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { handleHistory, handleRead, handleRecord } from "./handler.js";
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
  app.post("/purchase/:id/performance", (c) => handleRecord(c as never));
  app.get("/purchase/:id/performance", (c) => handleRead(c as never));
  app.get("/performance/history", (c) => handleHistory(c as never));
  return app;
}

function d1() {
  const db = createMemoryD1();
  db._setPrimaryKey("purchases", "id");
  db._setPrimaryKey("preferences", "id");
  db._setPrimaryKey("performance_ratings", "id");
  return db;
}

async function seedPurchase(
  db: ReturnType<typeof d1>,
  over: Partial<{
    id: string;
    user_id: string;
    category: string | null;
    product_name: string;
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
    purchased_at: "2026-01-01T00:00:00.000Z",
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

async function seedPreference(
  db: ReturnType<typeof d1>,
  category: string,
  weights: Record<string, number>,
  userId = "u1",
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO preferences (
        id, user_id, anon_user_id, category, criteria_json,
        values_overlay_json, source_weighting_json, updated_at, created_at
      ) VALUES (?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      "pref-1",
      userId,
      null,
      category,
      JSON.stringify(weights),
      null,
      null,
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    )
    .run();
}

describe("POST /purchase/:id/performance", () => {
  it("503 when D1 missing", async () => {
    const r = await buildApp().request(
      "/purchase/p-1/performance",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ overallRating: 4, wouldBuyAgain: true }),
      },
      {},
    );
    expect(r.status).toBe(503);
  });

  it("401 when unauth", async () => {
    const r = await buildApp().request(
      "/purchase/p-1/performance",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ overallRating: 4, wouldBuyAgain: true }),
      },
      { LENS_D1: d1() },
    );
    expect(r.status).toBe(401);
  });

  it("400 on invalid body (missing wouldBuyAgain)", async () => {
    const db = d1();
    await seedPurchase(db);
    const r = await buildApp().request(
      "/purchase/p-1/performance",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ overallRating: 4 }),
      },
      { LENS_D1: db },
    );
    expect(r.status).toBe(400);
  });

  it("400 on out-of-range rating (6)", async () => {
    const db = d1();
    await seedPurchase(db);
    const r = await buildApp().request(
      "/purchase/p-1/performance",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ overallRating: 6, wouldBuyAgain: true }),
      },
      { LENS_D1: db },
    );
    expect(r.status).toBe(400);
  });

  it("400 on unknown criterionFeedback signal", async () => {
    const db = d1();
    await seedPurchase(db);
    const r = await buildApp().request(
      "/purchase/p-1/performance",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({
          overallRating: 4,
          wouldBuyAgain: true,
          criterionFeedback: [{ criterion: "price", signal: "very-important" }],
        }),
      },
      { LENS_D1: db },
    );
    expect(r.status).toBe(400);
  });

  it("404 when purchase does not exist", async () => {
    const r = await buildApp().request(
      "/purchase/missing/performance",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ overallRating: 4, wouldBuyAgain: true }),
      },
      { LENS_D1: d1() },
    );
    expect(r.status).toBe(404);
  });

  it("403 when purchase belongs to another user", async () => {
    const db = d1();
    await seedPurchase(db, { user_id: "someone-else" });
    const r = await buildApp().request(
      "/purchase/p-1/performance",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ overallRating: 4, wouldBuyAgain: true }),
      },
      { LENS_D1: db },
    );
    expect(r.status).toBe(403);
  });

  it("applies preference update when a prior preference row exists", async () => {
    const db = d1();
    await seedPurchase(db);
    await seedPreference(db, "espresso-machines", {
      pressure: 0.30, build_quality: 0.25, price: 0.40, warranty: 0.05,
    });
    const r = await buildApp().request(
      "/purchase/p-1/performance",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({
          overallRating: 5,
          wouldBuyAgain: true,
          criterionFeedback: [{ criterion: "build_quality", signal: "more-important" }],
        }),
      },
      { LENS_D1: db },
    );
    const body = (await r.json()) as {
      ok: boolean;
      ratingId: string;
      preferenceUpdate: {
        applied: boolean;
        category: string;
        before: Record<string, number>;
        after: Record<string, number>;
        deltas: Record<string, number>;
      };
    };
    expect(r.status).toBe(200);
    expect(body.preferenceUpdate.applied).toBe(true);
    expect(body.preferenceUpdate.category).toBe("espresso-machines");
    expect(body.preferenceUpdate.after["build_quality"]).toBeGreaterThan(0.25);
    const sum = Object.values(body.preferenceUpdate.after).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 4);
  });

  it("persists the updated weights into the preferences row", async () => {
    const db = d1();
    await seedPurchase(db);
    await seedPreference(db, "espresso-machines", {
      pressure: 0.30, build_quality: 0.25, price: 0.40, warranty: 0.05,
    });
    await buildApp().request(
      "/purchase/p-1/performance",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({
          overallRating: 5,
          wouldBuyAgain: true,
          criterionFeedback: [{ criterion: "build_quality", signal: "more-important" }],
        }),
      },
      { LENS_D1: db },
    );
    const pref = await db
      .prepare(`SELECT criteria_json FROM preferences WHERE user_id = ? AND category = ?`)
      .bind("u1", "espresso-machines")
      .first<{ criteria_json: string }>();
    expect(pref).not.toBeNull();
    const weights = JSON.parse(pref!.criteria_json) as Record<string, number>;
    expect(weights["build_quality"]).toBeGreaterThan(0.25);
  });

  it("returns applied=false with a clear reason when no preference row exists", async () => {
    const db = d1();
    await seedPurchase(db);
    const r = await buildApp().request(
      "/purchase/p-1/performance",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ overallRating: 4, wouldBuyAgain: true }),
      },
      { LENS_D1: db },
    );
    const body = (await r.json()) as {
      preferenceUpdate: { applied: boolean; reason: string };
      ratingId: string;
    };
    expect(r.status).toBe(200);
    expect(body.preferenceUpdate.applied).toBe(false);
    expect(body.preferenceUpdate.reason).toMatch(/no prior preference/i);
    expect(body.ratingId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("returns applied=false when purchase has no category", async () => {
    const db = d1();
    await seedPurchase(db, { category: null });
    const r = await buildApp().request(
      "/purchase/p-1/performance",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ overallRating: 5, wouldBuyAgain: true }),
      },
      { LENS_D1: db },
    );
    const body = (await r.json()) as { preferenceUpdate: { applied: boolean; reason: string } };
    expect(body.preferenceUpdate.applied).toBe(false);
    expect(body.preferenceUpdate.reason).toMatch(/no category/i);
  });

  it("second POST to the same purchase replaces the prior rating (UPSERT)", async () => {
    const db = d1();
    await seedPurchase(db);
    await seedPreference(db, "espresso-machines", { a: 0.5, b: 0.5 });
    const first = await buildApp().request(
      "/purchase/p-1/performance",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ overallRating: 5, wouldBuyAgain: true, notes: "first" }),
      },
      { LENS_D1: db },
    );
    const firstBody = (await first.json()) as { ratingId: string };
    const second = await buildApp().request(
      "/purchase/p-1/performance",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ overallRating: 1, wouldBuyAgain: false, notes: "changed my mind" }),
      },
      { LENS_D1: db },
    );
    const secondBody = (await second.json()) as { ratingId: string };
    expect(firstBody.ratingId).toBe(secondBody.ratingId);

    const row = await db
      .prepare(`SELECT overall_rating, notes FROM performance_ratings WHERE id = ?`)
      .bind(firstBody.ratingId)
      .first<{ overall_rating: number; notes: string }>();
    expect(row!.overall_rating).toBe(1);
    expect(row!.notes).toBe("changed my mind");
  });

  it("persists the preference snapshot on the rating row", async () => {
    const db = d1();
    await seedPurchase(db);
    await seedPreference(db, "espresso-machines", {
      pressure: 0.30, build_quality: 0.25, price: 0.40, warranty: 0.05,
    });
    const r = await buildApp().request(
      "/purchase/p-1/performance",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ overallRating: 4, wouldBuyAgain: true }),
      },
      { LENS_D1: db },
    );
    const body = (await r.json()) as { ratingId: string };
    const row = await db
      .prepare(`SELECT preference_snapshot_json FROM performance_ratings WHERE id = ?`)
      .bind(body.ratingId)
      .first<{ preference_snapshot_json: string }>();
    const snap = JSON.parse(row!.preference_snapshot_json) as {
      applied: boolean; before: Record<string, number>; after: Record<string, number>;
    };
    expect(snap.applied).toBe(true);
    expect(snap.before["price"]).toBe(0.40);
  });
});

describe("GET /purchase/:id/performance", () => {
  it("401 when unauth", async () => {
    const r = await buildApp().request(
      "/purchase/p-1/performance",
      {},
      { LENS_D1: d1() },
    );
    expect(r.status).toBe(401);
  });

  it("returns null when no rating exists", async () => {
    const r = await buildApp().request(
      "/purchase/p-1/performance",
      { headers: { "x-test-user": "u1" } },
      { LENS_D1: d1() },
    );
    const body = (await r.json()) as { rating: null };
    expect(r.status).toBe(200);
    expect(body.rating).toBeNull();
  });

  it("returns the rating row after a POST", async () => {
    const db = d1();
    await seedPurchase(db);
    await buildApp().request(
      "/purchase/p-1/performance",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ overallRating: 4, wouldBuyAgain: true }),
      },
      { LENS_D1: db },
    );
    const r = await buildApp().request(
      "/purchase/p-1/performance",
      { headers: { "x-test-user": "u1" } },
      { LENS_D1: db },
    );
    const body = (await r.json()) as { rating: { overall_rating: number } };
    expect(body.rating.overall_rating).toBe(4);
  });
});

describe("GET /performance/history", () => {
  it("401 when unauth", async () => {
    const r = await buildApp().request("/performance/history", {}, { LENS_D1: d1() });
    expect(r.status).toBe(401);
  });

  it("returns ratings newest-first for the signed-in user", async () => {
    const db = d1();
    await seedPurchase(db, { id: "p-a" });
    await seedPurchase(db, { id: "p-b" });
    await buildApp().request(
      "/purchase/p-a/performance",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ overallRating: 3, wouldBuyAgain: true }),
      },
      { LENS_D1: db },
    );
    await new Promise((r) => setTimeout(r, 5)); // ensure distinct created_at
    await buildApp().request(
      "/purchase/p-b/performance",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ overallRating: 5, wouldBuyAgain: true }),
      },
      { LENS_D1: db },
    );
    const r = await buildApp().request(
      "/performance/history",
      { headers: { "x-test-user": "u1" } },
      { LENS_D1: db },
    );
    const body = (await r.json()) as { ratings: Array<{ purchase_id: string; overall_rating: number }>; count: number };
    expect(body.count).toBe(2);
    expect(body.ratings[0]!.purchase_id).toBe("p-b"); // newest first
  });
});
