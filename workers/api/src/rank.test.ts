import { describe, expect, it } from "vitest";
import { rankCandidates } from "./rank.js";
import type { Candidate, UserIntent } from "@lens/shared";

function candidate(
  name: string,
  specs: Record<string, string | number | boolean>,
  price = 100,
): Candidate {
  return {
    name,
    brand: "TestCo",
    price,
    currency: "USD",
    specs,
    attributeScores: {},
    utilityScore: 0,
    utilityBreakdown: [],
  };
}

describe("rankCandidates", () => {
  it("orders higher-is-better by the scored criterion", async () => {
    const intent: UserIntent = {
      category: "test",
      criteria: [{ name: "pressure", weight: 1, direction: "higher_is_better" }],
      rawCriteriaText: "pressure matters",
    };
    const ranked = await rankCandidates(intent, [
      candidate("Low", { pressure: 9 }),
      candidate("High", { pressure: 20 }),
      candidate("Mid", { pressure: 15 }),
    ]);
    expect(ranked[0]!.name).toBe("High");
    expect(ranked.at(-1)!.name).toBe("Low");
  });

  it("orders lower-is-better (e.g. price)", async () => {
    const intent: UserIntent = {
      category: "test",
      criteria: [{ name: "price", weight: 1, direction: "lower_is_better" }],
      rawCriteriaText: "",
    };
    const ranked = await rankCandidates(intent, [
      candidate("Expensive", { price: 300 }, 300),
      candidate("Cheap", { price: 100 }, 100),
      candidate("Mid", { price: 200 }, 200),
    ]);
    expect(ranked[0]!.name).toBe("Cheap");
  });

  it("honors target direction", async () => {
    const intent: UserIntent = {
      category: "coffee",
      criteria: [{ name: "brew_temp", weight: 1, direction: "target", target: 200 }],
      rawCriteriaText: "",
    };
    const ranked = await rankCandidates(intent, [
      candidate("Cold", { brew_temp: 180 }),
      candidate("Perfect", { brew_temp: 200 }),
      candidate("Hot", { brew_temp: 220 }),
    ]);
    expect(ranked[0]!.name).toBe("Perfect");
  });

  it("handles binary direction with boolean specs", async () => {
    const intent: UserIntent = {
      category: "headphones",
      criteria: [{ name: "anc", weight: 1, direction: "binary" }],
      rawCriteriaText: "",
    };
    const ranked = await rankCandidates(intent, [
      candidate("NoAnc", { anc: false }),
      candidate("WithAnc", { anc: true }),
    ]);
    expect(ranked[0]!.name).toBe("WithAnc");
    expect(ranked[0]!.attributeScores.anc).toBe(1);
  });

  it("exposes utilityBreakdown with every criterion", async () => {
    const intent: UserIntent = {
      category: "test",
      criteria: [
        { name: "pressure", weight: 0.6, direction: "higher_is_better" },
        { name: "price", weight: 0.4, direction: "lower_is_better" },
      ],
      rawCriteriaText: "",
    };
    const ranked = await rankCandidates(intent, [
      candidate("A", { pressure: 20, price: 100 }, 100),
      candidate("B", { pressure: 10, price: 200 }, 200),
    ]);
    expect(ranked[0]!.utilityBreakdown).toHaveLength(2);
    expect(
      ranked[0]!.utilityBreakdown.map((b) => b.criterion).sort(),
    ).toEqual(["pressure", "price"]);
  });

  it("resolves build_quality → build_score alias", async () => {
    const intent: UserIntent = {
      category: "test",
      criteria: [{ name: "build_quality", weight: 1, direction: "higher_is_better" }],
      rawCriteriaText: "",
    };
    const ranked = await rankCandidates(intent, [
      candidate("Plastic", { build_score: 0.3 }),
      candidate("Steel", { build_score: 0.9 }),
    ]);
    expect(ranked[0]!.name).toBe("Steel");
    expect(ranked[0]!.attributeScores.build_quality).toBeCloseTo(1);
  });

  it("defaults to overall_quality when intent has no criteria", async () => {
    const intent = { category: "test", criteria: [], rawCriteriaText: "" } as unknown as UserIntent;
    const ranked = await rankCandidates(intent, [candidate("X", {}), candidate("Y", {})]);
    expect(ranked).toHaveLength(2);
  });

  it("filters out undefined candidates safely", async () => {
    const intent: UserIntent = {
      category: "test",
      criteria: [{ name: "pressure", weight: 1, direction: "higher_is_better" }],
      rawCriteriaText: "",
    };
    const ranked = await rankCandidates(intent, [
      undefined as unknown as Candidate,
      candidate("Real", { pressure: 9 }),
    ]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.name).toBe("Real");
  });

  it("produces utility scores in [0, 1]", async () => {
    const intent: UserIntent = {
      category: "test",
      criteria: [
        { name: "a", weight: 0.5, direction: "higher_is_better" },
        { name: "b", weight: 0.5, direction: "higher_is_better" },
      ],
      rawCriteriaText: "",
    };
    const ranked = await rankCandidates(intent, [
      candidate("x", { a: 10, b: 5 }),
      candidate("y", { a: 5, b: 10 }),
    ]);
    for (const c of ranked) {
      expect(c.utilityScore).toBeGreaterThanOrEqual(0);
      expect(c.utilityScore).toBeLessThanOrEqual(1);
    }
  });
});
