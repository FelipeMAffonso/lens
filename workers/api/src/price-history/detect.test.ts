import { describe, expect, it } from "vitest";
import { detectSale } from "./detect.js";
import type { SeriesStats } from "./stats.js";

function stats(over: Partial<SeriesStats>): SeriesStats {
  return {
    count: 30,
    median: 200,
    mean: 200,
    min: 190,
    max: 210,
    stddev: 5,
    current: 200,
    ...over,
  };
}

describe("detectSale", () => {
  it("returns insufficient-data when < 14 points", () => {
    const r = detectSale({ stats: stats({ count: 10 }) });
    expect(r.verdict).toBe("insufficient-data");
  });

  it("returns no-sale when current ≈ median", () => {
    const r = detectSale({ stats: stats({ current: 200 }) });
    expect(r.verdict).toBe("no-sale");
  });

  it("detects fake-sale: loud banner, flat reality", () => {
    // 30% off claimed, but current is only 2% under median.
    const r = detectSale({
      stats: stats({ current: 196 }),
      claimedDiscountPct: 30,
    });
    expect(r.verdict).toBe("fake-sale");
    expect(r.discountClaimed).toBe(30);
    expect(r.discountActual).toBeLessThan(5);
  });

  it("accepts genuine sale: current > 1 stddev below median", () => {
    // median 200, stddev 5 → stddev fraction = 2.5% of median. current 190 = 5% off.
    const r = detectSale({ stats: stats({ current: 190 }) });
    expect(r.verdict).toBe("genuine-sale");
  });

  it("labels modest-dip for 1-5% decrease without banner", () => {
    // Larger stddev (15) means 3% off is not statistically significant → modest.
    const r = detectSale({ stats: stats({ current: 194, stddev: 15 }) }); // 3% off
    expect(r.verdict).toBe("modest-dip");
  });

  it("labels no-sale when current > median (price went up)", () => {
    const r = detectSale({ stats: stats({ current: 210 }) });
    expect(r.verdict).toBe("no-sale");
  });

  it("preserves claimedDiscountPct in output when banner < threshold but present", () => {
    const r = detectSale({
      stats: stats({ current: 198 }),
      claimedDiscountPct: 5,
    });
    // 5% off is below fake-sale threshold (15%), so verdict is modest-dip.
    // But we want the claim preserved for UI attribution.
    expect(r.discountClaimed).toBe(5);
  });

  it("returns insufficient-data when median is 0", () => {
    const r = detectSale({ stats: stats({ median: 0 }) });
    expect(r.verdict).toBe("insufficient-data");
  });
});
