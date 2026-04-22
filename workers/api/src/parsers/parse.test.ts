import { describe, expect, it } from "vitest";
import { isConfident, parseProduct } from "./parse.js";

describe("parseProduct orchestrator", () => {
  const ldOnly = `<script type="application/ld+json">${JSON.stringify({
    "@type": "Product",
    name: "Only LD Product",
    offers: { price: 199.99, priceCurrency: "USD" },
  })}</script>`;

  it("returns host + url even when no signals hit", () => {
    const r = parseProduct("<html></html>", "https://example.com/product");
    expect(r.host).toBe("example.com");
    expect(r.url).toBe("https://example.com/product");
    expect(r.name).toBeUndefined();
  });

  it("picks up a JSON-LD Product when host parser absent", () => {
    const r = parseProduct(ldOnly, "https://unknown.example/dp/123");
    expect(r.name).toBe("Only LD Product");
    expect(r.price).toBe(199.99);
    expect(r.sources?.name).toBe("json-ld");
  });

  it("host adapter wins over JSON-LD on overlapping fields (Amazon fixture)", () => {
    // Amazon host parser finds name from #productTitle, json-ld would give a different one.
    const html = `
      <h1 id="productTitle">Real Amazon Name</h1>
      <span class="a-price a-text-price"><span class="a-offscreen">$499.99</span></span>
      <script type="application/ld+json">${JSON.stringify({
        "@type": "Product",
        name: "JsonLD Name",
        offers: { price: 1234, priceCurrency: "USD" },
      })}</script>`;
    const r = parseProduct(html, "https://www.amazon.com/dp/B07DKZ9GHB");
    expect(r.name).toBe("Real Amazon Name"); // host wins
    expect(r.price).toBe(499.99); // host price wins
    expect(r.sources?.name).toBe("host");
    expect(r.currency).toBe("USD"); // currency came from json-ld
    expect(r.sources?.currency).toBe("json-ld");
  });

  it("falls back to OG tags when neither JSON-LD nor host available", () => {
    const html = `
      <head>
        <meta property="og:title" content="OG Product" />
        <meta property="og:price:amount" content="29" />
        <meta property="og:price:currency" content="USD" />
      </head>`;
    const r = parseProduct(html, "https://no-host.example/x");
    expect(r.name).toBe("OG Product");
    expect(r.price).toBe(29);
    expect(r.sources?.name).toBe("opengraph");
  });

  it("combines microdata for fields JSON-LD lacks", () => {
    const html = `
      <script type="application/ld+json">${JSON.stringify({
        "@type": "Product",
        name: "LD Named",
      })}</script>
      <div itemscope itemtype="https://schema.org/Product">
        <meta itemprop="price" content="12" />
        <meta itemprop="priceCurrency" content="USD" />
      </div>`;
    const r = parseProduct(html, "https://site.example/p");
    expect(r.name).toBe("LD Named");
    expect(r.price).toBe(12);
    expect(r.sources?.name).toBe("json-ld");
    expect(r.sources?.price).toBe("microdata");
  });

  it("isConfident returns true only when name AND price present", () => {
    expect(isConfident({ name: "x" })).toBe(false);
    expect(isConfident({ price: 1 })).toBe(false);
    expect(isConfident({ name: "x", price: 1 })).toBe(true);
  });

  it("handles malformed URL gracefully (host empty)", () => {
    const r = parseProduct("<html></html>", "not a url");
    expect(r.host).toBe("");
    expect(r.url).toBe("not a url");
  });
});
