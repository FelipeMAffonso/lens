import { describe, expect, it } from "vitest";
import { parseJinaMarkdown, parseRetailerUrl } from "./resolve-url.js";

describe("parseRetailerUrl", () => {
  it("canonicalizes Amazon ASIN URLs and strips affiliate/tracking params", () => {
    const parsed = parseRetailerUrl(
      "https://www.amazon.com/Anker-Charging-Foldable/dp/B0G1MRLXMV/ref=sr_1_3?tag=evil-20&linkCode=ll1&ascsubtag=x&psc=1&utm_source=bad",
    );
    expect(parsed.retailer).toBe("amazon");
    expect(parsed.id).toBe("B0G1MRLXMV");
    expect(parsed.urlClean).toBe("https://amazon.com/dp/B0G1MRLXMV");
    expect(parsed.urlClean).not.toMatch(/tag=|linkCode=|ascsubtag|utm_|psc|ref=/i);
  });

  it("extracts known retailer ids without keeping generic ad params", () => {
    expect(parseRetailerUrl("https://www.bestbuy.com/site/foo.p?skuId=6534616&utm_campaign=x").id).toBe("6534616");
    expect(parseRetailerUrl("https://www.walmart.com/ip/name/123456?affid=x").urlClean).toBe("https://www.walmart.com/ip/name/123456");
    expect(parseRetailerUrl("https://www.target.com/p/foo/-/A-98765432?color=blue&tag=x").urlClean).toBe("https://www.target.com/p/foo/-/A-98765432?color=blue");
  });
});

describe("parseJinaMarkdown", () => {
  it("prefers the current deal price over list/MSRP prices", () => {
    const parsed = parseJinaMarkdown(`
Title: Anker MagGo 3-in-1 Foldable Charging Station - Amazon.com
URL Source: https://www.amazon.com/dp/B0G1MRLXMV
Markdown Content:
# Anker MagGo 3-in-1 Foldable Charging Station

List Price: $109.99
With Deal: $79.99
Shipping: $5.99

4.6 out of 5 stars
12,345 ratings

- Foldable wireless charging station for iPhone, Apple Watch, and AirPods
- Qi2-certified 15W fast wireless charging
`);
    expect(parsed.title).toContain("Anker MagGo");
    expect(parsed.priceCents).toBe(7999);
    expect(parsed.rating).toBe(4.6);
    expect(parsed.reviewCount).toBe(12345);
    expect(parsed.bullets?.[0]).toContain("Foldable wireless charging");
  });
});
