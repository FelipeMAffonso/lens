// Unit tests for the NL preference-adjustment handler.
// Tests the exported pure helpers (parseOpusJson, applyAndRenormalize).

import { describe, it, expect } from "vitest";
import { parseOpusJson, applyAndRenormalize } from "./handler.js";

type Criterion = {
  name: string;
  weight: number;
  direction?: "higher_is_better" | "lower_is_better" | "target" | "binary";
};

describe("rank-adjust: applyAndRenormalize", () => {
  it("leaves unchanged criteria alone when no adjustments apply", () => {
    const criteria: Criterion[] = [
      { name: "price", weight: 0.4 },
      { name: "build_quality", weight: 0.6 },
    ];
    const { updated, changed } = applyAndRenormalize(criteria, [], []);
    expect(updated).toHaveLength(2);
    expect(updated.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1, 3);
    expect(changed).toHaveLength(0);
  });

  it("applies a positive delta and renormalizes sum to 1", () => {
    const criteria: Criterion[] = [
      { name: "noise", weight: 0.2 },
      { name: "pressure", weight: 0.5 },
      { name: "build_quality", weight: 0.3 },
    ];
    const { updated, changed } = applyAndRenormalize(
      criteria,
      [{ name: "noise", delta: 0.3, reason: "user wants quieter" }],
      [],
    );
    expect(updated.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1, 3);
    const noiseNew = updated.find((c) => c.name === "noise")!;
    expect(noiseNew.weight).toBeGreaterThan(0.2);
    expect(changed.some((c) => c.name === "noise")).toBe(true);
  });

  it("adds a new criterion with a sensible weight and renormalizes", () => {
    const criteria: Criterion[] = [
      { name: "price", weight: 0.5 },
      { name: "brand", weight: 0.5 },
    ];
    const { updated } = applyAndRenormalize(
      criteria,
      [],
      [{ name: "durability", weight: 0.2, direction: "higher_is_better", reason: "user added" }],
    );
    expect(updated).toHaveLength(3);
    expect(updated.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1, 3);
    const dur = updated.find((c) => c.name === "durability");
    expect(dur).toBeTruthy();
    expect(dur!.direction).toBe("higher_is_better");
  });

  it("clamps a runaway negative delta so weight stays >= 0.01 pre-normalization", () => {
    const criteria: Criterion[] = [
      { name: "price", weight: 0.2 },
      { name: "quality", weight: 0.8 },
    ];
    const { updated } = applyAndRenormalize(
      criteria,
      [{ name: "price", delta: -0.5, reason: "user dismissed price" }],
      [],
    );
    const price = updated.find((c) => c.name === "price")!;
    expect(price.weight).toBeGreaterThan(0);
    expect(price.weight).toBeLessThan(0.1);
    expect(updated.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1, 3);
  });

  it("ignores adjustments referencing unknown criterion names (no crash)", () => {
    const criteria: Criterion[] = [{ name: "price", weight: 1 }];
    const { updated, changed } = applyAndRenormalize(
      criteria,
      [{ name: "nonexistent", delta: 0.2, reason: "no match" }],
      [],
    );
    expect(updated).toHaveLength(1);
    expect(updated[0]!.weight).toBeCloseTo(1, 3);
    expect(changed).toHaveLength(0);
  });

  it("produces a changed[] log entry for every weight shift larger than rounding", () => {
    const criteria: Criterion[] = [
      { name: "a", weight: 0.5 },
      { name: "b", weight: 0.5 },
    ];
    const { changed } = applyAndRenormalize(
      criteria,
      [{ name: "a", delta: 0.3, reason: "bump a" }],
      [],
    );
    expect(changed.length).toBeGreaterThanOrEqual(1);
    const aEntry = changed.find((c) => c.name === "a");
    expect(aEntry).toBeTruthy();
    expect(aEntry!.after).toBeGreaterThan(aEntry!.before);
  });

  it("output weights sum to exactly 1 after renormalization (drift fix)", () => {
    const criteria: Criterion[] = [
      { name: "a", weight: 0.333 },
      { name: "b", weight: 0.334 },
      { name: "c", weight: 0.333 },
    ];
    const { updated } = applyAndRenormalize(criteria, [], []);
    const sum = updated.reduce((s, c) => s + c.weight, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(0.0001);
  });
});

describe("rank-adjust: parseOpusJson", () => {
  it("extracts JSON from fenced code block", () => {
    const text = "```json\n{\"adjustments\":[{\"name\":\"a\",\"delta\":0.1,\"reason\":\"r\"}]}\n```";
    const out = parseOpusJson(text);
    expect(out).toBeTruthy();
    expect(out!.adjustments).toHaveLength(1);
    expect(out!.adjustments[0]!.name).toBe("a");
    expect(out!.adjustments[0]!.delta).toBe(0.1);
  });

  it("extracts JSON from unfenced response with surrounding prose", () => {
    const text = "Sure — here's the change:\n{\"adjustments\":[],\"summary\":\"no change\"}\nHope that helps.";
    const out = parseOpusJson(text);
    expect(out).toBeTruthy();
    expect(out!.adjustments).toEqual([]);
    expect(out!.summary).toBe("no change");
  });

  it("clamps deltas outside ±0.30 range", () => {
    const text = "{\"adjustments\":[{\"name\":\"x\",\"delta\":0.99,\"reason\":\"huge\"},{\"name\":\"y\",\"delta\":-0.99,\"reason\":\"tiny\"}]}";
    const out = parseOpusJson(text);
    expect(out!.adjustments[0]!.delta).toBe(0.3);
    expect(out!.adjustments[1]!.delta).toBe(-0.3);
  });

  it("normalizes new criterion names to snake_case", () => {
    const text = "{\"adjustments\":[],\"newCriteria\":[{\"name\":\"Battery Life!\",\"weight\":0.2,\"direction\":\"higher_is_better\",\"reason\":\"user asked\"}]}";
    const out = parseOpusJson(text);
    expect(out!.newCriteria).toHaveLength(1);
    expect(out!.newCriteria![0]!.name).toBe("battery_life_");
  });

  it("defaults direction to higher_is_better when missing or invalid", () => {
    const text = "{\"adjustments\":[],\"newCriteria\":[{\"name\":\"x\",\"weight\":0.1,\"direction\":\"bogus\",\"reason\":\"r\"}]}";
    const out = parseOpusJson(text);
    expect(out!.newCriteria![0]!.direction).toBe("higher_is_better");
  });

  it("clamps new criterion weight to [0.03, 0.30]", () => {
    const text = "{\"adjustments\":[],\"newCriteria\":[{\"name\":\"x\",\"weight\":0.9,\"direction\":\"higher_is_better\",\"reason\":\"r\"}]}";
    const out = parseOpusJson(text);
    expect(out!.newCriteria![0]!.weight).toBe(0.3);
  });

  it("returns null on malformed JSON", () => {
    const text = "{this is not json";
    const out = parseOpusJson(text);
    expect(out).toBeNull();
  });

  it("filters out adjustments missing required fields", () => {
    const text = "{\"adjustments\":[{\"name\":\"ok\",\"delta\":0.1,\"reason\":\"r\"},{\"name\":\"bad\"}]}";
    const out = parseOpusJson(text);
    expect(out!.adjustments).toHaveLength(1);
    expect(out!.adjustments[0]!.name).toBe("ok");
  });
});
