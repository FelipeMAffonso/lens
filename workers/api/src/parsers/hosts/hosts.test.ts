// S3-W15 — fixture-driven host adapter tests.

import { describe, expect, it } from "vitest";
import { parseAmazon } from "./amazon.js";
import { parseBestBuy } from "./bestbuy.js";
import { parseWalmart } from "./walmart.js";
import { parseTarget } from "./target.js";
import { parseHomeDepot } from "./homedepot.js";
import { parseShopify, isShopify } from "./shopify.js";
import { adapterFor, ALL_HOST_IDS } from "./registry.js";

describe("parseAmazon", () => {
  const html = `
    <html><body>
      <h1 id="productTitle">Breville Bambino Plus Espresso Machine</h1>
      <a id="bylineInfo">Visit the Breville Store</a>
      <div id="feature-bullets"><ul>
        <li><span>15-bar Italian pump</span></li>
        <li><span>Automatic milk frother</span></li>
        <li><span>See more product details</span></li>
      </ul></div>
      <span class="a-price a-text-price"><span class="a-offscreen">$499.99</span></span>
      <div id="availability"><span>In Stock</span></div>
      <img id="landingImage" src="https://images/amazon/bambino.jpg" />
    </body></html>`;
  const url = "https://www.amazon.com/dp/B07DKZ9GHB/ref=sr_1_3";

  it("extracts name, brand, price, availability from #productTitle + byline + a-offscreen", () => {
    const r = parseAmazon(html, url);
    expect(r?.name).toBe("Breville Bambino Plus Espresso Machine");
    expect(r?.brand).toBe("Breville");
    expect(r?.price).toBe(499.99);
    expect(r?.availability).toContain("in stock");
    expect(r?.sources?.name).toBe("host");
  });

  it("extracts ASIN from URL path", () => {
    expect(parseAmazon(html, url)?.productId).toBe("B07DKZ9GHB");
  });

  it("strips non-informative 'See more product details' bullets", () => {
    const r = parseAmazon(html, url);
    expect(r?.features?.some((f) => /see more/i.test(f))).toBe(false);
    expect(r?.features).toContain("15-bar Italian pump");
  });

  it("returns null when no name AND no price in html", () => {
    expect(parseAmazon("<html></html>", url)).toBeNull();
  });

  it("falls back to whole+fraction price pattern", () => {
    const h = `<h1 id="productTitle">X</h1><span class="a-price-whole">123</span><span class="a-price-fraction">45</span>`;
    expect(parseAmazon(h, url)?.price).toBe(123.45);
  });
});

describe("parseBestBuy", () => {
  it("reads heading-5 title + priceView-hero-price + brandName field", () => {
    const html = `
      <h1 class="heading-5 v-fw-regular">MacBook Pro 16&quot;</h1>
      <div class="priceView-hero-price"><span>$2,499.00</span></div>
      <span class="product-data-value v-fw-regular">6534616</span>
      <script>"brandName":"Apple"</script>`;
    const r = parseBestBuy(html, "https://www.bestbuy.com/site/x.p?skuId=6534616");
    expect(r?.name).toBe("MacBook Pro 16\"");
    expect(r?.price).toBe(2499);
    expect(r?.sku).toBe("6534616");
    expect(r?.brand).toBe("Apple");
  });

  it("returns null when neither name nor price present", () => {
    expect(parseBestBuy("<html></html>", "x")).toBeNull();
  });
});

describe("parseWalmart", () => {
  it("reads hero-carousel title + itemprop=price", () => {
    const html = `
      <h1 data-seo-id="hero-carousel-product-title">Vitamix Blender</h1>
      <meta itemprop="price" content="329.99" />
      <script>"brand":"Vitamix"</script>`;
    const r = parseWalmart(html, "https://www.walmart.com/ip/x/123456");
    expect(r?.name).toBe("Vitamix Blender");
    expect(r?.price).toBe(329.99);
    expect(r?.brand).toBe("Vitamix");
  });
});

describe("parseTarget", () => {
  it("reads data-test=product-title + data-test=product-price + TCIN from URL", () => {
    const html = `
      <h1 data-test="product-title">Kitchen Knife Set</h1>
      <div data-test="product-price">$89.99</div>
      <script>"brand":{"name":"Good Kitchen"}</script>`;
    const url = "https://www.target.com/p/knife-set/-/A-12345678";
    const r = parseTarget(html, url);
    expect(r?.name).toBe("Kitchen Knife Set");
    expect(r?.price).toBe(89.99);
    expect(r?.productId).toBe("12345678");
    expect(r?.brand).toBe("Good Kitchen");
  });
});

describe("parseHomeDepot", () => {
  it("reads product-details__title + price-format__large + price-format__small", () => {
    const html = `
      <h1 class="product-details__title">DeWalt 20V Drill</h1>
      <span class="price-format__large">$199</span><span class="price-format__small">.00</span>
      <script>"brand":"DeWalt"</script>`;
    const url = "https://www.homedepot.com/p/drill/309876543";
    const r = parseHomeDepot(html, url);
    expect(r?.name).toBe("DeWalt 20V Drill");
    expect(r?.price).toBe(199);
    expect(r?.productId).toBe("309876543");
  });
});

describe("parseShopify", () => {
  it("detects via generator meta tag", () => {
    const html = `<meta name="generator" content="Shopify" /><h1 class="product-single__title">Handmade Mug</h1><span class="price__regular">$24.00</span>`;
    expect(isShopify(html)).toBe(true);
    const r = parseShopify(html, "https://store.example.com/products/mug");
    expect(r?.name).toBe("Handmade Mug");
    expect(r?.price).toBe(24);
  });

  it("uses ProductJson script when present", () => {
    const payload = JSON.stringify({
      title: "Greek Yogurt Tee",
      vendor: "Tiny Label",
      price: 3400, // cents
      handle: "greek-yogurt-tee",
      images: ["https://img/1.jpg"],
      body_html: "<p>Soft and comfy</p>",
    });
    const html = `<meta name="generator" content="Shopify"><script id="ProductJson-product-template" type="application/json">${payload}</script>`;
    const r = parseShopify(html, "https://shop.example/products/t");
    expect(r?.name).toBe("Greek Yogurt Tee");
    expect(r?.brand).toBe("Tiny Label");
    expect(r?.price).toBe(34); // cents → dollars
    expect(r?.sku).toBe("greek-yogurt-tee");
    expect(r?.images?.[0]).toBe("https://img/1.jpg");
  });

  it("returns null on non-Shopify pages", () => {
    expect(parseShopify("<html></html>", "x")).toBeNull();
  });
});

describe("adapterFor", () => {
  it("routes amazon.com", () => {
    expect(adapterFor("www.amazon.com", "")?.id).toBe("amazon");
  });
  it("routes bestbuy.com", () => {
    expect(adapterFor("www.bestbuy.com", "")?.id).toBe("bestbuy");
  });
  it("routes walmart.com", () => {
    expect(adapterFor("www.walmart.com", "")?.id).toBe("walmart");
  });
  it("routes target.com", () => {
    expect(adapterFor("www.target.com", "")?.id).toBe("target");
  });
  it("routes homedepot.com", () => {
    expect(adapterFor("www.homedepot.com", "")?.id).toBe("homedepot");
  });
  it("routes a Shopify storefront via html signal", () => {
    expect(adapterFor("shop.example.com", `<meta name="generator" content="Shopify">`)?.id).toBe("shopify");
  });
  it("returns null for an unknown host", () => {
    expect(adapterFor("unknown.example", "")).toBeNull();
  });
  it("exports all 6 host ids", () => {
    expect(ALL_HOST_IDS).toEqual(["amazon", "bestbuy", "walmart", "target", "homedepot", "shopify"]);
  });
});
