import { describe, expect, it } from "vitest";
import { ALL_WINDOW_KEYS, listWindows, normalizeRetailer, windowFor } from "./windows.js";

describe("retailer windows table", () => {
  it("includes ≥ 7 retailers", () => {
    expect(ALL_WINDOW_KEYS.length).toBeGreaterThanOrEqual(7);
  });

  it("Best Buy, Target, Walmart, Home Depot, Lowe's, Costco, Apple are active", () => {
    for (const key of ["bestbuy", "target", "walmart", "homedepot", "lowes", "costco", "apple"]) {
      expect(windowFor(key)?.active, `${key} should be active`).toBe(true);
    }
  });

  it("Amazon is explicitly inactive with a retired-policy note", () => {
    const a = windowFor("Amazon");
    expect(a?.active).toBe(false);
    expect(a?.note).toContain("2018");
  });

  it("normalizeRetailer handles mixed-case + dotted-hostname", () => {
    expect(normalizeRetailer("Best Buy")).toBe("bestbuy");
    expect(normalizeRetailer("www.bestbuy.com")).toBe("bestbuy");
    expect(normalizeRetailer("Walmart.com")).toBe("walmart");
    expect(normalizeRetailer("Home Depot")).toBe("homedepot");
  });

  it("normalizeRetailer returns null for empty / unknown", () => {
    expect(normalizeRetailer(null)).toBeNull();
    expect(normalizeRetailer("")).toBeNull();
    expect(normalizeRetailer("SomeRandomStore")).toBeNull();
  });

  it("listWindows lists every entry with required fields", () => {
    const list = listWindows();
    expect(list.length).toBe(ALL_WINDOW_KEYS.length);
    for (const w of list) {
      expect(typeof w.retailer).toBe("string");
      expect(Number.isFinite(w.days)).toBe(true);
      expect(typeof w.active).toBe("boolean");
    }
  });
});
