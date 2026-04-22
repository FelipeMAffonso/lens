import { describe, expect, it } from "vitest";
import { computeStats } from "./stats.js";

describe("computeStats", () => {
  it("returns zeros for an empty series", () => {
    const s = computeStats([]);
    expect(s.count).toBe(0);
    expect(s.median).toBe(0);
    expect(s.stddev).toBe(0);
  });

  it("computes median for odd-length series", () => {
    const s = computeStats([
      { date: "2026-04-21", price: 100 },
      { date: "2026-04-20", price: 80 },
      { date: "2026-04-19", price: 120 },
    ]);
    expect(s.median).toBe(100);
  });

  it("computes median for even-length series", () => {
    const s = computeStats([
      { date: "2026-04-21", price: 100 },
      { date: "2026-04-20", price: 80 },
      { date: "2026-04-19", price: 120 },
      { date: "2026-04-18", price: 160 },
    ]);
    expect(s.median).toBe(110); // (100 + 120) / 2
  });

  it("computes min + max", () => {
    const s = computeStats([
      { date: "2026-04-21", price: 50 },
      { date: "2026-04-20", price: 80 },
      { date: "2026-04-19", price: 150 },
    ]);
    expect(s.min).toBe(50);
    expect(s.max).toBe(150);
  });

  it("computes population stddev", () => {
    const s = computeStats([
      { date: "d1", price: 100 },
      { date: "d2", price: 100 },
      { date: "d3", price: 100 },
    ]);
    expect(s.stddev).toBe(0);
  });

  it("flags current as the first-element price (reverse-chrono)", () => {
    const s = computeStats([
      { date: "2026-04-21", price: 210 }, // newest first
      { date: "2026-04-20", price: 200 },
    ]);
    expect(s.current).toBe(210);
  });

  it("rounds every output to 2 decimals", () => {
    const s = computeStats([
      { date: "d1", price: 10.123456 },
      { date: "d2", price: 20.567891 },
    ]);
    expect(s.median).toBe(15.35);
  });
});
