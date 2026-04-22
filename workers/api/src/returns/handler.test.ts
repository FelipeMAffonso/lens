import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { handleReturnDraft } from "./handler.js";
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
  app.post("/returns/draft", (c) => handleReturnDraft(c as never));
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
    order_id: string;
    purchased_at: string;
    raw_payload_json: string | null;
  }> = {},
): Promise<string> {
  const row = {
    id: "p-1",
    user_id: "u1",
    source: "gmail",
    source_ref: "m-1",
    retailer: "Keurig",
    order_id: "KG-555",
    product_name: "Keurig K-Mini Coffee Maker",
    brand: "Keurig",
    category: "coffee-makers",
    price: 89.99,
    currency: "USD",
    purchased_at: "2026-03-15T10:00:00.000Z",
    delivered_at: null,
    warranty_until: null,
    raw_payload_json: null as string | null,
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

describe("POST /returns/draft", () => {
  it("503 when D1 missing", async () => {
    const r = await buildApp().request(
      "/returns/draft",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ purchaseId: "p-1", defectDescription: "broken" }),
      },
      {},
    );
    expect(r.status).toBe(503);
  });

  it("401 when no principal", async () => {
    const r = await buildApp().request(
      "/returns/draft",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ purchaseId: "p-1", defectDescription: "broken" }),
      },
      { LENS_D1: d1() },
    );
    expect(r.status).toBe(401);
  });

  it("400 when input is invalid (missing required fields)", async () => {
    const r = await buildApp().request(
      "/returns/draft",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ purchaseId: "p-1" }),
      },
      { LENS_D1: d1() },
    );
    expect(r.status).toBe(400);
  });

  it("400 when actionType is not one of the enum values", async () => {
    const r = await buildApp().request(
      "/returns/draft",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({
          purchaseId: "p-1",
          defectDescription: "issue",
          actionType: "bogus",
        }),
      },
      { LENS_D1: d1() },
    );
    expect(r.status).toBe(400);
  });

  it("404 when purchase does not exist", async () => {
    const r = await buildApp().request(
      "/returns/draft",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ purchaseId: "missing", defectDescription: "issue" }),
      },
      { LENS_D1: d1() },
    );
    expect(r.status).toBe(404);
  });

  it("403 when purchase belongs to another user", async () => {
    const db = d1();
    await seedPurchase(db, { id: "p-other", user_id: "someone-else" });
    const r = await buildApp().request(
      "/returns/draft",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({ purchaseId: "p-other", defectDescription: "issue" }),
      },
      { LENS_D1: db },
    );
    expect(r.status).toBe(403);
  });

  it("renders a complete draft and writes an intervention row on the happy path", async () => {
    const db = d1();
    await seedPurchase(db, { id: "p-ok" });
    const r = await buildApp().request(
      "/returns/draft",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({
          purchaseId: "p-ok",
          defectDescription: "Does not brew hot water at all",
          actionType: "warranty-service",
          userName: "Jane Doe",
          userContact: "jane@example.com",
        }),
      },
      { LENS_D1: db },
    );
    const body = (await r.json()) as {
      ok: boolean;
      interventionId: string;
      draft: { subject: string; body: string; to: string | null; format: string };
      templateSource: string;
      fallback: string;
      generatedAt: string;
    };
    expect(r.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.interventionId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(body.draft.subject).toBe("Warranty / return claim — Keurig K-Mini Coffee Maker");
    expect(body.draft.body).toContain("Dear Keurig,");
    expect(body.draft.body).toContain("warranty service");
    expect(body.draft.body).toContain("KG-555");
    expect(body.draft.body).toContain("2026-03-15");
    expect(body.draft.body).toContain("Does not brew hot water at all");
    expect(body.draft.body).toContain("repair or replacement under the Limited Warranty");
    expect(body.draft.body).toContain("Jane Doe");
    expect(body.draft.body).toContain("jane@example.com");
    expect(body.draft.body).not.toContain("[TODO:");
    expect(body.draft.to).toBeNull();
    expect(body.draft.format).toBe("email");
    expect(body.templateSource).toMatch(/^intervention\/draft-magnuson-moss-return@/);
    expect(body.fallback).toBe("intervention/file-ftc-complaint");

    const row = await db
      .prepare(`SELECT * FROM interventions WHERE id = ?`)
      .bind(body.interventionId)
      .first<{
        user_id: string;
        pack_slug: string;
        status: string;
        related_purchase_id: string;
        payload_json: string;
      }>();
    expect(row).not.toBeNull();
    expect(row!.user_id).toBe("u1");
    expect(row!.pack_slug).toBe("intervention/draft-magnuson-moss-return");
    expect(row!.status).toBe("drafted");
    expect(row!.related_purchase_id).toBe("p-ok");
    const payload = JSON.parse(row!.payload_json) as { action: string; subject: string };
    expect(payload.action).toBe("warranty-service");
    expect(payload.subject).toBe(body.draft.subject);
  });

  it("surfaces [TODO: user_name] when userName is omitted", async () => {
    const db = d1();
    await seedPurchase(db, { id: "p-nouser" });
    const r = await buildApp().request(
      "/returns/draft",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({
          purchaseId: "p-nouser",
          defectDescription: "Defective",
        }),
      },
      { LENS_D1: db },
    );
    const body = (await r.json()) as { draft: { body: string } };
    expect(r.status).toBe(200);
    expect(body.draft.body).toContain("[TODO: user_name]");
    expect(body.draft.body).toContain("[TODO: user_contact]");
  });

  it("defaults to 'return' action when actionType is omitted", async () => {
    const db = d1();
    await seedPurchase(db, { id: "p-default" });
    const r = await buildApp().request(
      "/returns/draft",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({
          purchaseId: "p-default",
          defectDescription: "Stopped working",
          userName: "A",
          userContact: "a@b.com",
        }),
      },
      { LENS_D1: db },
    );
    const body = (await r.json()) as { draft: { body: string } };
    expect(r.status).toBe(200);
    expect(body.draft.body).toContain("return and refund");
    expect(body.draft.body).toContain("refund of the purchase price");
  });

  it("extracts sellerEmail from raw_payload_json when present", async () => {
    const db = d1();
    await seedPurchase(db, {
      id: "p-email",
      raw_payload_json: JSON.stringify({ sellerEmail: "support@keurig.com" }),
    });
    const r = await buildApp().request(
      "/returns/draft",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({
          purchaseId: "p-email",
          defectDescription: "Broken",
          userName: "A",
          userContact: "a@b.com",
        }),
      },
      { LENS_D1: db },
    );
    const body = (await r.json()) as { draft: { to: string | null } };
    expect(r.status).toBe(200);
    expect(body.draft.to).toBe("support@keurig.com");
  });

  it("honors a caller-supplied specificRight override", async () => {
    const db = d1();
    await seedPurchase(db, { id: "p-override" });
    const r = await buildApp().request(
      "/returns/draft",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-user": "u1" },
        body: JSON.stringify({
          purchaseId: "p-override",
          defectDescription: "Defective",
          specificRight: "a full store credit equal to the purchase price",
          userName: "A",
          userContact: "a@b.com",
        }),
      },
      { LENS_D1: db },
    );
    const body = (await r.json()) as { draft: { body: string } };
    expect(r.status).toBe(200);
    expect(body.draft.body).toContain("a full store credit equal to the purchase price");
  });
});
