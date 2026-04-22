import { describe, expect, it } from "vitest";
import { generateFixtureSeries } from "./fixture.js";

describe("generateFixtureSeries", () => {
  it("returns exactly 90 points by default", () => {
    const { series } = generateFixtureSeries("https://www.amazon.com/dp/B07DKZ9GHB");
    expect(series.length).toBe(90);
  });

  it("is deterministic for the same URL", () => {
    const a = generateFixtureSeries("https://www.amazon.com/dp/B07DKZ9GHB");
    const b = generateFixtureSeries("https://www.amazon.com/dp/B07DKZ9GHB");
    expect(a.series[0]!.price).toBe(b.series[0]!.price);
    expect(a.series[89]!.price).toBe(b.series[89]!.price);
  });

  it("varies across URLs", () => {
    const a = generateFixtureSeries("https://www.amazon.com/dp/AAAAAAAAAA");
    const b = generateFixtureSeries("https://www.amazon.com/dp/ZZZZZZZZZZ");
    expect(a.series[0]!.price).not.toBe(b.series[0]!.price);
  });

  it("prices are > 0", () => {
    const { series } = generateFixtureSeries("https://x/dp/B07DKZ9GHB");
    for (const p of series) expect(p.price).toBeGreaterThan(0);
  });

  it("dates are newest first", () => {
    const { series } = generateFixtureSeries("https://x/dp/B07DKZ9GHB");
    expect(series[0]!.date > series[89]!.date).toBe(true);
  });

  it("emits at least one URL that maps to each bucket across a sample", () => {
    const buckets = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const { bucket } = generateFixtureSeries(`https://amazon.com/dp/AAAA${i.toString().padStart(6, "0")}`);
      buckets.add(Math.floor(bucket / 25)); // 0..3
      if (buckets.size === 4) break;
    }
    expect(buckets.size).toBe(4);
  });
});
