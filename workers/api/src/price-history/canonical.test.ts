import { describe, expect, it } from "vitest";
import { canonicalize } from "./canonical.js";

describe("canonicalize", () => {
  it("extracts Amazon ASIN from /dp/ path", () => {
    const r = canonicalize(
      "https://www.amazon.com/Breville-BES880BSS-Barista-Espresso-Machine/dp/B07DKZ9GHB/ref=sr_1_3?tag=aff-20",
    );
    expect(r?.host).toBe("www.amazon.com");
    expect(r?.productId).toBe("B07DKZ9GHB");
    // Both path-based /ref=... AND query-based tag= tracking stripped.
    expect(r?.canonicalUrl).not.toContain("ref=");
    expect(r?.canonicalUrl).not.toContain("tag=");
  });

  it("extracts Amazon ASIN from /gp/product/ path", () => {
    const r = canonicalize("https://www.amazon.co.uk/gp/product/B08N5WRWNW/");
    expect(r?.productId).toBe("B08N5WRWNW");
  });

  it("extracts Best Buy sku from p-path", () => {
    const r = canonicalize("https://www.bestbuy.com/site/apple-macbook-pro/6534616.p?skuId=6534616");
    expect(r?.productId).toBe("6534616");
  });

  it("extracts Walmart /ip/ id", () => {
    const r = canonicalize("https://www.walmart.com/ip/Apple-MacBook-Air/123456789?athcpid=x");
    expect(r?.productId).toBe("123456789");
  });

  it("extracts Target /A-<id>", () => {
    const r = canonicalize("https://www.target.com/p/headphones/-/A-87654321");
    expect(r?.productId).toBe("87654321");
  });

  it("strips utm_ params", () => {
    const r = canonicalize(
      "https://www.amazon.com/dp/B07DKZ9GHB/?utm_source=email&utm_campaign=x",
    );
    expect(r?.canonicalUrl).not.toContain("utm_");
  });

  it("strips fbclid, gclid", () => {
    const r = canonicalize("https://www.amazon.com/dp/B07DKZ9GHB/?gclid=abc&fbclid=def");
    expect(r?.canonicalUrl).not.toContain("gclid");
    expect(r?.canonicalUrl).not.toContain("fbclid");
  });

  it("returns null on non-URL", () => {
    expect(canonicalize("not a url")).toBeNull();
  });

  it("returns null on non-http(s)", () => {
    expect(canonicalize("ftp://foo.com/x")).toBeNull();
  });

  it("normalizes host to lowercase", () => {
    const r = canonicalize("https://WWW.AMAZON.COM/dp/B07DKZ9GHB/");
    expect(r?.host).toBe("www.amazon.com");
  });

  it("drops fragment", () => {
    const r = canonicalize("https://www.amazon.com/dp/B07DKZ9GHB#reviews");
    expect(r?.canonicalUrl).not.toContain("#");
  });
});
