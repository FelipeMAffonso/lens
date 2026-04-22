import { describe, expect, it } from "vitest";
import { detectHost, extractProductId, isProductPage, parsePriceString } from "./detect-product-page.js";

describe("detectHost", () => {
  it("identifies the six supported retailers", () => {
    expect(detectHost(new URL("https://www.amazon.com/dp/B01"))).toBe("amazon");
    expect(detectHost(new URL("https://amazon.com/dp/B01"))).toBe("amazon");
    expect(detectHost(new URL("https://www.bestbuy.com/site/foo/123.p"))).toBe("bestbuy");
    expect(detectHost(new URL("https://www.walmart.com/ip/x/123"))).toBe("walmart");
    expect(detectHost(new URL("https://www.target.com/p/foo/A-123"))).toBe("target");
    expect(detectHost(new URL("https://www.homedepot.com/p/foo/123456789"))).toBe("homedepot");
    expect(detectHost(new URL("https://www.costco.com/product.1234.html"))).toBe("costco");
  });

  it("returns null for non-retailer hosts", () => {
    expect(detectHost(new URL("https://lens-b1h.pages.dev/"))).toBeNull();
    expect(detectHost(new URL("https://chatgpt.com/"))).toBeNull();
  });
});

describe("isProductPage", () => {
  it("detects Amazon product pages by ASIN in path", () => {
    expect(isProductPage(new URL("https://www.amazon.com/dp/B0G1MRLXMV"))).toBe(true);
    expect(isProductPage(new URL("https://www.amazon.com/gp/product/B0G1MRLXMV"))).toBe(true);
    expect(isProductPage(new URL("https://www.amazon.com/s?k=laptop"))).toBe(false);
  });

  it("detects Walmart product pages", () => {
    expect(isProductPage(new URL("https://www.walmart.com/ip/OXO-Coffee-Maker/123456789"))).toBe(true);
    expect(isProductPage(new URL("https://www.walmart.com/cp/home/123"))).toBe(false);
  });

  it("detects Target product pages", () => {
    expect(isProductPage(new URL("https://www.target.com/p/foo-product/A-12345678"))).toBe(true);
    expect(isProductPage(new URL("https://www.target.com/c/kitchen"))).toBe(false);
  });

  it("detects Home Depot product pages", () => {
    expect(isProductPage(new URL("https://www.homedepot.com/p/some-drill/123456789"))).toBe(true);
    expect(isProductPage(new URL("https://www.homedepot.com/b/Tools"))).toBe(false);
  });
});

describe("extractProductId", () => {
  it("pulls Amazon ASIN", () => {
    expect(extractProductId("amazon", new URL("https://www.amazon.com/dp/B0G1MRLXMV"))).toBe("B0G1MRLXMV");
    expect(extractProductId("amazon", new URL("https://www.amazon.com/gp/product/B08N5WRWNW/"))).toBe("B08N5WRWNW");
  });

  it("pulls Walmart + Target numeric ID", () => {
    expect(extractProductId("walmart", new URL("https://www.walmart.com/ip/foo/987654321"))).toBe("987654321");
    expect(extractProductId("target", new URL("https://www.target.com/p/foo/A-12345678"))).toBe("12345678");
  });

  it("returns null when the pattern is absent", () => {
    expect(extractProductId("amazon", new URL("https://www.amazon.com/s?k=laptop"))).toBeNull();
    expect(extractProductId("walmart", new URL("https://www.walmart.com/cp/home"))).toBeNull();
  });
});

describe("parsePriceString", () => {
  it("parses standard dollar strings", () => {
    expect(parsePriceString("$1,299.99")).toBe(1299.99);
    expect(parsePriceString("$49.99")).toBe(49.99);
    expect(parsePriceString("1299")).toBe(1299);
  });

  it("handles ranges by taking the low end", () => {
    expect(parsePriceString("$19.99 - $29.99")).toBe(19.99);
  });

  it("returns null on non-price strings", () => {
    expect(parsePriceString("")).toBeNull();
    expect(parsePriceString(null)).toBeNull();
    expect(parsePriceString(undefined)).toBeNull();
    expect(parsePriceString("Out of stock")).toBeNull();
  });

  it("extracts first currency number from messy strings", () => {
    expect(parsePriceString("Starting at $49.99 + tax")).toBe(49.99);
  });
});
