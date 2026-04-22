import { describe, expect, it } from "vitest";
import { createMemoryD1 } from "../memory-d1.js";
import { auditCountByUser, createAudit, deleteAudit, getAudit, listAudits } from "./audits.js";

function seed() {
  return createMemoryD1();
}

describe("audits repo", () => {
  it("creates + gets a row by id", async () => {
    const d1 = seed();
    const row = await createAudit(d1, {
      userId: "u1",
      anonUserId: "a1",
      kind: "query",
      host: null,
      category: "laptops",
      intent: { prompt: "fast laptop under $2000" },
      specOptimal: { name: "MacBook Air M3" },
      elapsedMsTotal: 1250,
    });
    expect(row.id).toBeTruthy();
    const fetched = await getAudit(d1, row.id);
    expect(fetched?.id).toBe(row.id);
    expect(fetched?.kind).toBe("query");
    expect(JSON.parse(fetched!.intent_json)).toEqual({ prompt: "fast laptop under $2000" });
  });

  it("returns null on getAudit for unknown id", async () => {
    const d1 = seed();
    expect(await getAudit(d1, "missing-id")).toBeNull();
  });

  it("serializes optional JSON columns consistently", async () => {
    const d1 = seed();
    const row = await createAudit(d1, {
      userId: null,
      anonUserId: "a1",
      kind: "url",
      host: "amazon",
      category: "espresso",
      intent: { prompt: "x" },
      aiRecommendation: { pick: "De'Longhi" },
      specOptimal: { name: "Breville Bambino" },
      claims: [{ claim: "15-bar", verdict: "true" }],
      elapsedMsTotal: 5000,
      clientOrigin: "extension",
    });
    expect(row.ai_recommendation_json).toContain("De'Longhi");
    expect(row.claims_json).toContain("15-bar");
    expect(row.client_origin).toBe("extension");
    expect(row.candidates_json).toBeNull();
  });

  it("filters list by user_id", async () => {
    const d1 = seed();
    for (const u of ["u1", "u1", "u2"]) {
      await createAudit(d1, {
        userId: u,
        anonUserId: null,
        kind: "query",
        host: null,
        category: "x",
        intent: {},
        specOptimal: {},
        elapsedMsTotal: 0,
      });
    }
    const rows = await listAudits(d1, { userId: "u1" });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.user_id === "u1")).toBe(true);
  });

  it("orders list by created_at DESC", async () => {
    const d1 = seed();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const row = await createAudit(d1, {
        userId: "u",
        anonUserId: null,
        kind: "query",
        host: null,
        category: "c",
        intent: {},
        specOptimal: {},
        elapsedMsTotal: 0,
      });
      ids.push(row.id);
      await new Promise((r) => setTimeout(r, 2));
    }
    const rows = await listAudits(d1, { userId: "u" });
    expect(rows[0]!.id).toBe(ids[2]);
    expect(rows[2]!.id).toBe(ids[0]);
  });

  it("respects the limit", async () => {
    const d1 = seed();
    for (let i = 0; i < 5; i++) {
      await createAudit(d1, {
        userId: "u",
        anonUserId: null,
        kind: "query",
        host: null,
        category: "c",
        intent: {},
        specOptimal: {},
        elapsedMsTotal: 0,
      });
    }
    const rows = await listAudits(d1, { userId: "u", limit: 2 });
    expect(rows).toHaveLength(2);
  });

  it("filters list by category", async () => {
    const d1 = seed();
    await createAudit(d1, {
      userId: "u",
      anonUserId: null,
      kind: "query",
      host: null,
      category: "laptops",
      intent: {},
      specOptimal: {},
      elapsedMsTotal: 0,
    });
    await createAudit(d1, {
      userId: "u",
      anonUserId: null,
      kind: "query",
      host: null,
      category: "espresso",
      intent: {},
      specOptimal: {},
      elapsedMsTotal: 0,
    });
    const rows = await listAudits(d1, { userId: "u", category: "espresso" });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.category).toBe("espresso");
  });

  it("counts audits by user", async () => {
    const d1 = seed();
    for (let i = 0; i < 3; i++) {
      await createAudit(d1, {
        userId: "u",
        anonUserId: null,
        kind: "query",
        host: null,
        category: "c",
        intent: {},
        specOptimal: {},
        elapsedMsTotal: 0,
      });
    }
    const n = await auditCountByUser(d1, { userId: "u" });
    expect(n).toBe(3);
  });

  it("deletes an audit by id", async () => {
    const d1 = seed();
    const row = await createAudit(d1, {
      userId: "u",
      anonUserId: null,
      kind: "query",
      host: null,
      category: "c",
      intent: {},
      specOptimal: {},
      elapsedMsTotal: 0,
    });
    await deleteAudit(d1, row.id);
    expect(await getAudit(d1, row.id)).toBeNull();
  });
});
