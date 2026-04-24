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

  it("survives criterion objects missing a name (Opus freelance output)", async () => {
    // Regression: Opus can return a criterion without a name for categories without a pack
    // (e.g. "women's underwear"). Rank must filter those out and fall back to the default
    // rather than crashing on `.replace()` of undefined.
    const intent = {
      category: "womens-underwear",
      criteria: [
        { weight: 0.5, direction: "higher_is_better" } as unknown as { name: string; weight: number; direction: "higher_is_better" },
        { name: "", weight: 0.3, direction: "higher_is_better" as const },
        { name: "comfort", weight: 0.2, direction: "higher_is_better" as const },
      ],
      rawCriteriaText: "",
    } as unknown as UserIntent;
    const ranked = await rankCandidates(intent, [
      candidate("A", { comfort: 5 }),
      candidate("B", { comfort: 9 }),
    ]);
    expect(ranked).toHaveLength(2);
    expect(ranked[0]!.name).toBe("B");
  });

  it("(judge P1 #4) rejects whitespace-only criterion names", async () => {
    const intent = {
      category: "x",
      criteria: [
        { name: "   ", weight: 0.5, direction: "higher_is_better" as const },
        { name: "speed", weight: 0.5, direction: "higher_is_better" as const },
      ],
      rawCriteriaText: "",
    } as unknown as UserIntent;
    const ranked = await rankCandidates(intent, [candidate("A", { speed: 5 }), candidate("B", { speed: 9 })]);
    expect(ranked[0]!.name).toBe("B");
    // Only one breakdown row survives — the whitespace-named one was dropped
    expect(ranked[0]!.utilityBreakdown).toHaveLength(1);
    expect(ranked[0]!.utilityBreakdown[0]!.criterion).toBe("speed");
  });

  it("(judge P1 #5) coerces string weight; drops NaN/negative weights", async () => {
    const intent = {
      category: "x",
      criteria: [
        { name: "a", weight: "0.6" as unknown as number, direction: "higher_is_better" as const },
        { name: "b", weight: -1, direction: "higher_is_better" as const },
        { name: "c", weight: 0.4, direction: "higher_is_better" as const },
      ],
      rawCriteriaText: "",
    } as unknown as UserIntent;
    const ranked = await rankCandidates(intent, [candidate("A", { a: 5, c: 3 }), candidate("B", { a: 9, c: 9 })]);
    expect(ranked[0]!.name).toBe("B");
    expect(Number.isFinite(ranked[0]!.utilityScore)).toBe(true);
    // b (negative weight) was dropped
    expect(ranked[0]!.utilityBreakdown.map((r) => r.criterion)).toEqual(["a", "c"]);
  });

  it("(judge P1 #6) normalizes invalid direction to higher_is_better", async () => {
    const intent = {
      category: "x",
      criteria: [{ name: "speed", weight: 1, direction: "ascending" as unknown as "higher_is_better" }],
      rawCriteriaText: "",
    } as unknown as UserIntent;
    const ranked = await rankCandidates(intent, [candidate("Slow", { speed: 1 }), candidate("Fast", { speed: 9 })]);
    expect(ranked[0]!.name).toBe("Fast");
  });

  it("(judge P1 #7) survives intent === undefined without crashing", async () => {
    const ranked = await rankCandidates(undefined as unknown as UserIntent, [candidate("A", {}), candidate("B", {})]);
    expect(ranked).toHaveLength(2);
  });

  it("(judge P0 #1) filters candidates whose name is empty or whitespace", async () => {
    const intent: UserIntent = {
      category: "x",
      criteria: [{ name: "speed", weight: 1, direction: "higher_is_better" }],
      rawCriteriaText: "",
    };
    const ranked = await rankCandidates(intent, [
      { ...candidate("Real", { speed: 9 }) },
      { ...candidate("", { speed: 9 }) },
      { ...candidate("   ", { speed: 9 }) },
    ]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.name).toBe("Real");
  });

  it("survives intent.criteria being entirely invalid and falls back to default", async () => {
    const intent = {
      category: "x",
      criteria: [{ weight: 1 } as unknown as { name: string; weight: number; direction: "higher_is_better" }],
      rawCriteriaText: "",
    } as unknown as UserIntent;
    const ranked = await rankCandidates(intent, [candidate("A", {}), candidate("B", {})]);
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

  it("(user-reported bug) ranks by top-level price when criterion is 'price'", async () => {
    // User asked for "espresso under $400, price matters a lot".
    // Fixture: Stilosa $119, Bambino $499, Presswell $389.
    // Before the lookupAugmented fix, rank returned $499 Bambino because
    // the fixture didn't have specs.price (price is only on the top-level
    // candidate), so price-contribution was 0 across the board.
    const intent: UserIntent = {
      category: "espresso",
      criteria: [{ name: "price", weight: 1, direction: "lower_is_better" }],
      rawCriteriaText: "price matters a lot",
    };
    const ranked = await rankCandidates(intent, [
      candidate("Bambino", { pressure: 19 }, 499),
      candidate("Stilosa", { pressure: 15 }, 119),
      candidate("Presswell", { pressure: 20 }, 389),
    ]);
    expect(ranked[0]!.name).toBe("Stilosa");
    expect(ranked.at(-1)!.name).toBe("Bambino");
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

  // Polish 2026-04-24: budget.max is a constraint, not just a weight.
  it("filters out candidates above budget.max * 1.10", async () => {
    const intent: UserIntent = {
      category: "espresso",
      criteria: [{ name: "build_quality", weight: 1, direction: "higher_is_better" }],
      budget: { max: 400, currency: "USD" },
      rawCriteriaText: "under $400",
    };
    const ranked = await rankCandidates(intent, [
      candidate("Cheap but mediocre", { build_quality: 3 }, 200),
      candidate("On-budget great build", { build_quality: 9 }, 395),
      candidate("Over-budget perfect", { build_quality: 10 }, 600), // should be dropped
      candidate("Just over grace ceiling", { build_quality: 10 }, 500), // should be dropped (ceiling = 440)
    ]);
    // With budget 400 + 10% grace = 440 ceiling. 500 and 600 dropped.
    expect(ranked).toHaveLength(2);
    expect(ranked.map((c) => c.name)).not.toContain("Over-budget perfect");
    expect(ranked.map((c) => c.name)).not.toContain("Just over grace ceiling");
    // Top pick should be on-budget great build (highest build_quality under $440).
    expect(ranked[0]!.name).toBe("On-budget great build");
  });

  it("falls back to unfiltered candidates if budget filter empties the set", async () => {
    const intent: UserIntent = {
      category: "tv",
      criteria: [{ name: "screen_size", weight: 1, direction: "higher_is_better" }],
      budget: { max: 100, currency: "USD" }, // unrealistic
      rawCriteriaText: "under $100",
    };
    const ranked = await rankCandidates(intent, [
      candidate("Small", { screen_size: 32 }, 300),
      candidate("Mid", { screen_size: 50 }, 600),
      candidate("Big", { screen_size: 75 }, 1200),
    ]);
    // Budget 100 + 10% = 110 ceiling — no candidate qualifies. Fall back to full set.
    expect(ranked).toHaveLength(3);
  });

  it("skips budget filter when budget.max is absent", async () => {
    const intent: UserIntent = {
      category: "test",
      criteria: [{ name: "build_quality", weight: 1, direction: "higher_is_better" }],
      rawCriteriaText: "no budget stated",
    };
    const ranked = await rankCandidates(intent, [
      candidate("A", { build_quality: 5 }, 100),
      candidate("B", { build_quality: 7 }, 500),
      candidate("C", { build_quality: 9 }, 999),
    ]);
    expect(ranked).toHaveLength(3);
    expect(ranked[0]!.name).toBe("C"); // highest build wins with no budget filter
  });

  it("ignores candidates with null price in budget filter (price-not-verified)", async () => {
    const intent: UserIntent = {
      category: "test",
      criteria: [{ name: "build_quality", weight: 1, direction: "higher_is_better" }],
      budget: { max: 400, currency: "USD" },
      rawCriteriaText: "under $400",
    };
    const ranked = await rankCandidates(intent, [
      { ...candidate("Unknown price", { build_quality: 8 }, 100), price: null as unknown as number },
      candidate("Cheap good", { build_quality: 7 }, 300),
      candidate("Over budget", { build_quality: 10 }, 900),
    ]);
    // Null-price candidate must NOT be filtered out (we don't know if it's over budget).
    const names = ranked.map((c) => c.name);
    expect(names).toContain("Unknown price");
    expect(names).not.toContain("Over budget");
  });
});
