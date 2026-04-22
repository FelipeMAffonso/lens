import { describe, expect, it } from "vitest";
import { createMemoryD1 } from "../memory-d1.js";
import {
  listWelfareDeltas,
  recordWelfareDelta,
  welfareSummary,
} from "./welfare.js";

describe("welfare_deltas repo", () => {
  it("records a delta with both lens + ai picks", async () => {
    const d1 = createMemoryD1();
    const row = await recordWelfareDelta(d1, {
      auditId: "au-1",
      userId: "u",
      anonUserId: null,
      category: "espresso",
      lensPick: { name: "Breville Bambino", brand: "Breville", price: 499, utility: 0.82 },
      aiPick: { name: "De'Longhi", brand: "De'Longhi", price: 699, utility: 0.67 },
    });
    expect(row.utility_delta).toBeCloseTo(0.15);
    expect(row.price_delta).toBe(200); // ai - lens
  });

  it("records a delta when ai pick is absent (Job-1 only)", async () => {
    const d1 = createMemoryD1();
    const row = await recordWelfareDelta(d1, {
      auditId: "au-2",
      userId: "u",
      anonUserId: null,
      category: "laptops",
      lensPick: { name: "MacBook Air", utility: 0.9 },
    });
    expect(row.ai_utility).toBeNull();
    expect(row.utility_delta).toBeNull();
    expect(row.price_delta).toBeNull();
  });

  it("INSERT OR REPLACE so a second record for the same audit overwrites", async () => {
    const d1 = createMemoryD1();
    await recordWelfareDelta(d1, {
      auditId: "au-x",
      userId: "u",
      anonUserId: null,
      category: "c",
      lensPick: { name: "A", utility: 0.5 },
    });
    await recordWelfareDelta(d1, {
      auditId: "au-x",
      userId: "u",
      anonUserId: null,
      category: "c",
      lensPick: { name: "B", utility: 0.8 },
    });
    const all = await listWelfareDeltas(d1, { userId: "u" });
    expect(all).toHaveLength(1);
    expect(all[0]!.lens_pick_name).toBe("B");
  });

  it("welfareSummary aggregates across all rows", async () => {
    const d1 = createMemoryD1();
    await recordWelfareDelta(d1, {
      auditId: "a",
      userId: "u",
      anonUserId: null,
      category: "espresso",
      lensPick: { name: "X", price: 100, utility: 0.8 },
      aiPick: { name: "Y", price: 150, utility: 0.6 },
    });
    await recordWelfareDelta(d1, {
      auditId: "b",
      userId: "u",
      anonUserId: null,
      category: "laptops",
      lensPick: { name: "X", price: 1000, utility: 0.9 },
      aiPick: { name: "Y", price: 1400, utility: 0.7 },
    });
    const s = await welfareSummary(d1, { userId: "u" });
    expect(s.totalAudits).toBe(2);
    expect(s.auditsWithAiComparison).toBe(2);
    // avg utility delta: (0.2 + 0.2) / 2 = 0.2
    expect(s.avgUtilityDelta).toBe(0.2);
    // total price delta: 50 + 400 = 450
    expect(s.totalPriceDelta).toBe(450);
    expect(s.byCategory.espresso?.count).toBe(1);
    expect(s.byCategory.laptops?.totalPriceDelta).toBe(400);
  });

  it("welfareSummary returns zero-shape for empty principal", async () => {
    const d1 = createMemoryD1();
    const s = await welfareSummary(d1, {});
    expect(s.totalAudits).toBe(0);
    expect(s.avgUtilityDelta).toBeNull();
  });

  it("listWelfareDeltas orders DESC by created_at and honors limit", async () => {
    const d1 = createMemoryD1();
    for (let i = 0; i < 4; i++) {
      await recordWelfareDelta(d1, {
        auditId: `a-${i}`,
        userId: "u",
        anonUserId: null,
        category: "c",
        lensPick: { name: "X", utility: 0.5 },
      });
      await new Promise((r) => setTimeout(r, 2));
    }
    const rows = await listWelfareDeltas(d1, { userId: "u", limit: 2 });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.audit_id).toBe("a-3");
  });
});
