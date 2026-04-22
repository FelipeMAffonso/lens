import { describe, expect, it } from "vitest";
import { createMemoryD1 } from "../db/memory-d1.js";
import { getByPurchase, listByUser, upsertRating } from "./repo.js";

function d1() {
  const db = createMemoryD1();
  db._setPrimaryKey("performance_ratings", "id");
  return db;
}

describe("performance repo", () => {
  it("upserts a fresh rating row and round-trips through getByPurchase", async () => {
    const db = d1();
    const row = await upsertRating(db, {
      userId: "u1",
      purchaseId: "p-1",
      overallRating: 4,
      wouldBuyAgain: true,
      notes: "solid",
      category: "espresso-machines",
    });
    expect(row.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(row.overall_rating).toBe(4);
    expect(row.would_buy_again).toBe(1);
    expect(row.notes).toBe("solid");

    const fetched = await getByPurchase(db, "u1", "p-1");
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(row.id);
  });

  it("UPSERT: second call for same (user, purchase) updates in place", async () => {
    const db = d1();
    const first = await upsertRating(db, {
      userId: "u1",
      purchaseId: "p-1",
      overallRating: 4,
      wouldBuyAgain: true,
    });
    const second = await upsertRating(db, {
      userId: "u1",
      purchaseId: "p-1",
      overallRating: 1,
      wouldBuyAgain: false,
      notes: "returned",
    });
    expect(second.id).toBe(first.id);
    expect(second.overall_rating).toBe(1);
    expect(second.would_buy_again).toBe(0);
    expect(second.notes).toBe("returned");
  });

  it("segregates ratings by user", async () => {
    const db = d1();
    await upsertRating(db, { userId: "u1", purchaseId: "p-1", overallRating: 5, wouldBuyAgain: true });
    await upsertRating(db, { userId: "u2", purchaseId: "p-1", overallRating: 1, wouldBuyAgain: false });
    const u1 = await getByPurchase(db, "u1", "p-1");
    const u2 = await getByPurchase(db, "u2", "p-1");
    expect(u1!.overall_rating).toBe(5);
    expect(u2!.overall_rating).toBe(1);
  });

  it("persists criterion_feedback_json + preference_snapshot_json as JSON strings", async () => {
    const db = d1();
    const row = await upsertRating(db, {
      userId: "u1",
      purchaseId: "p-1",
      overallRating: 4,
      wouldBuyAgain: true,
      criterionFeedback: [{ criterion: "price", signal: "about-right" }],
      preferenceSnapshot: {
        applied: true,
        category: "x",
        before: { a: 0.5, b: 0.5 },
        after: { a: 0.55, b: 0.45 },
        deltas: { a: 0.05, b: -0.05 },
        reason: "reinforce",
      },
    });
    expect(JSON.parse(row.criterion_feedback_json!)).toEqual([
      { criterion: "price", signal: "about-right" },
    ]);
    expect(JSON.parse(row.preference_snapshot_json!).applied).toBe(true);
  });

  it("listByUser returns newest-first and respects limit", async () => {
    const db = d1();
    for (let i = 0; i < 5; i++) {
      await upsertRating(db, {
        userId: "u1",
        purchaseId: `p-${i}`,
        overallRating: i + 1,
        wouldBuyAgain: true,
      });
      await new Promise((r) => setTimeout(r, 2));
    }
    const rows = await listByUser(db, "u1", { limit: 3 });
    expect(rows).toHaveLength(3);
    // Newest first: p-4, p-3, p-2 (last inserted)
    expect(rows.map((r) => r.purchase_id)).toEqual(["p-4", "p-3", "p-2"]);
  });

  it("listByUser returns empty for a user with no ratings", async () => {
    const db = d1();
    const rows = await listByUser(db, "nobody");
    expect(rows).toEqual([]);
  });
});
