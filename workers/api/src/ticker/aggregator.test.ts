import { describe, expect, it } from "vitest";
import { aggregate, K_ANON_MIN, type AuditRunRow } from "./aggregator.js";

function makeRow(
  anonUserId: string,
  category: string,
  host: string,
  agreement: boolean,
  utilityGap = 0.1,
  priceGap: number | null = 40,
): AuditRunRow {
  const lensName = "Lens Pick";
  const aiName = agreement ? "Lens Pick" : "AI Pick";
  const lensUtility = 0.8;
  const aiUtility = lensUtility - utilityGap;
  const lensPrice = 200;
  const aiPrice = priceGap !== null ? lensPrice + priceGap : null;
  const output = {
    intent: { category },
    aiRecommendation: { host, pickedProduct: { name: aiName, price: aiPrice } },
    specOptimal: { name: lensName, price: lensPrice, utilityScore: lensUtility },
    aiPickCandidate: { utilityScore: aiUtility },
  };
  return {
    id: `run_${Math.random()}`,
    workflow_id: "audit",
    status: "completed",
    anon_user_id: anonUserId,
    user_id: null,
    input_json: "{}",
    output_json: JSON.stringify(output),
    started_at: new Date().toISOString(),
  };
}

describe("aggregate", () => {
  it("suppresses buckets with k < 5 (k-anonymity)", () => {
    const rows: AuditRunRow[] = [
      makeRow("u1", "laptops", "chatgpt", false),
      makeRow("u2", "laptops", "chatgpt", false),
      makeRow("u3", "laptops", "chatgpt", true),
      makeRow("u4", "laptops", "chatgpt", false),
    ];
    const r = aggregate(rows);
    expect(r.published).toHaveLength(0);
    expect(r.suppressed).toBe(1);
  });

  it("publishes buckets with k >= 5", () => {
    const rows: AuditRunRow[] = [
      makeRow("u1", "laptops", "chatgpt", false),
      makeRow("u2", "laptops", "chatgpt", false),
      makeRow("u3", "laptops", "chatgpt", false),
      makeRow("u4", "laptops", "chatgpt", true),
      makeRow("u5", "laptops", "chatgpt", false),
    ];
    const r = aggregate(rows);
    expect(r.published).toHaveLength(1);
    const b = r.published[0]!;
    expect(b.category).toBe("laptops");
    expect(b.host).toBe("chatgpt");
    expect(b.k).toBe(5);
    expect(b.sample_size).toBe(5);
    expect(b.agreement_rate).toBeCloseTo(1 / 5, 4);
  });

  it("deduplicates participants (same anon twice counts once toward k)", () => {
    const rows: AuditRunRow[] = [
      makeRow("u1", "laptops", "chatgpt", false),
      makeRow("u1", "laptops", "chatgpt", false),
      makeRow("u2", "laptops", "chatgpt", false),
      makeRow("u3", "laptops", "chatgpt", false),
      makeRow("u4", "laptops", "chatgpt", false),
    ];
    const r = aggregate(rows);
    // Only 4 unique participants → below k threshold
    expect(r.published).toHaveLength(0);
    expect(r.suppressed).toBe(1);
  });

  it("separates buckets by category", () => {
    const rows: AuditRunRow[] = [
      makeRow("u1", "laptops", "chatgpt", true),
      makeRow("u2", "laptops", "chatgpt", false),
      makeRow("u3", "laptops", "chatgpt", false),
      makeRow("u4", "laptops", "chatgpt", false),
      makeRow("u5", "laptops", "chatgpt", false),
      makeRow("u6", "espresso machines", "chatgpt", false),
      makeRow("u7", "espresso machines", "chatgpt", false),
      makeRow("u8", "espresso machines", "chatgpt", true),
      makeRow("u9", "espresso machines", "chatgpt", false),
      makeRow("u10", "espresso machines", "chatgpt", false),
    ];
    const r = aggregate(rows);
    expect(r.published).toHaveLength(2);
    const cats = r.published.map((b) => b.category).sort();
    expect(cats).toEqual(["espresso machines", "laptops"]);
  });

  it("computes avg_utility_gap correctly", () => {
    const rows: AuditRunRow[] = [
      makeRow("u1", "laptops", "chatgpt", false, 0.1),
      makeRow("u2", "laptops", "chatgpt", false, 0.2),
      makeRow("u3", "laptops", "chatgpt", false, 0.3),
      makeRow("u4", "laptops", "chatgpt", false, 0.4),
      makeRow("u5", "laptops", "chatgpt", false, 0.5),
    ];
    const r = aggregate(rows);
    expect(r.published).toHaveLength(1);
    expect(r.published[0]!.avg_utility_gap).toBeCloseTo(0.3, 4);
  });

  it("null avg_price_gap when no priced pairs", () => {
    const rows: AuditRunRow[] = [
      makeRow("u1", "laptops", "chatgpt", false, 0.1, null),
      makeRow("u2", "laptops", "chatgpt", false, 0.1, null),
      makeRow("u3", "laptops", "chatgpt", false, 0.1, null),
      makeRow("u4", "laptops", "chatgpt", false, 0.1, null),
      makeRow("u5", "laptops", "chatgpt", false, 0.1, null),
    ];
    const r = aggregate(rows);
    expect(r.published).toHaveLength(1);
    expect(r.published[0]!.avg_price_gap).toBeNull();
  });

  it("skips rows that didn't complete", () => {
    const rows: AuditRunRow[] = [
      { ...makeRow("u1", "laptops", "chatgpt", false), status: "failed" },
      makeRow("u2", "laptops", "chatgpt", false),
      makeRow("u3", "laptops", "chatgpt", false),
      makeRow("u4", "laptops", "chatgpt", false),
      makeRow("u5", "laptops", "chatgpt", false),
      makeRow("u6", "laptops", "chatgpt", false),
    ];
    const r = aggregate(rows);
    expect(r.published).toHaveLength(1);
    expect(r.published[0]!.sample_size).toBe(5);
  });

  it("respects custom kMin", () => {
    const rows: AuditRunRow[] = [
      makeRow("u1", "laptops", "chatgpt", false),
      makeRow("u2", "laptops", "chatgpt", false),
      makeRow("u3", "laptops", "chatgpt", true),
    ];
    const r = aggregate(rows, 3);
    expect(r.published).toHaveLength(1);
    expect(r.published[0]!.k).toBe(3);
  });

  it("exports K_ANON_MIN = 5", () => {
    expect(K_ANON_MIN).toBe(5);
  });
});
