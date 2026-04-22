import { describe, expect, it } from "vitest";
import { resolveShipping } from "./shipping.js";

describe("resolveShipping", () => {
  it("amazon → free, host-policy source, Prime note", () => {
    const r = resolveShipping("www.amazon.com", 499);
    expect(r.amount).toBe(0);
    expect(r.source).toBe("host-policy");
    expect(r.reasoning).toContain("Prime");
  });

  it("bestbuy under $35 → flat $5.99", () => {
    const r = resolveShipping("www.bestbuy.com", 10);
    expect(r.amount).toBe(5.99);
  });

  it("bestbuy ≥ $35 → free", () => {
    const r = resolveShipping("www.bestbuy.com", 100);
    expect(r.amount).toBe(0);
  });

  it("walmart ≥ $35 → free", () => {
    expect(resolveShipping("www.walmart.com", 75).amount).toBe(0);
  });

  it("target under $35 → flat $5.99", () => {
    expect(resolveShipping("www.target.com", 30).amount).toBe(5.99);
  });

  it("homedepot < $45 → flat $7.99", () => {
    expect(resolveShipping("www.homedepot.com", 29).amount).toBe(7.99);
  });

  it("costco → free", () => {
    expect(resolveShipping("www.costco.com", 500).amount).toBe(0);
  });

  it("unknown host → estimate capped between $3.99 and $25", () => {
    const low = resolveShipping("shopify.example.com", 10);
    expect(low.amount).toBe(3.99);
    expect(low.source).toBe("estimated");

    const mid = resolveShipping("shopify.example.com", 200);
    expect(mid.amount).toBe(10); // 5% of 200

    const high = resolveShipping("shopify.example.com", 5000);
    expect(high.amount).toBe(25); // capped
  });
});
