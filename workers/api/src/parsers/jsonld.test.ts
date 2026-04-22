import { describe, expect, it } from "vitest";
import { extractJsonLd } from "./jsonld.js";

describe("extractJsonLd", () => {
  it("returns null when no ld+json block present", () => {
    expect(extractJsonLd("<html><body>hi</body></html>")).toBeNull();
  });

  it("extracts a canonical Product block", () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Breville Bambino Plus",
      brand: { "@type": "Brand", name: "Breville" },
      image: "https://img/1.jpg",
      sku: "BES500BSS",
      offers: {
        "@type": "Offer",
        price: "499.99",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
      },
      aggregateRating: { ratingValue: 4.6, reviewCount: 1420 },
    })}</script></head></html>`;
    const r = extractJsonLd(html);
    expect(r?.name).toBe("Breville Bambino Plus");
    expect(r?.brand).toBe("Breville");
    expect(r?.price).toBe(499.99);
    expect(r?.currency).toBe("USD");
    expect(r?.sku).toBe("BES500BSS");
    expect(r?.availability).toBe("instock");
    expect(r?.rating).toBe(4.6);
    expect(r?.ratingCount).toBe(1420);
    expect(r?.sources?.name).toBe("json-ld");
  });

  it("walks @graph arrays", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@graph": [
        { "@type": "BreadcrumbList" },
        { "@type": "Product", name: "Test", offers: { price: 42, priceCurrency: "USD" } },
      ],
    })}</script>`;
    const r = extractJsonLd(html);
    expect(r?.name).toBe("Test");
    expect(r?.price).toBe(42);
  });

  it("handles brand as a plain string", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "Product",
      name: "x",
      brand: "Acme",
    })}</script>`;
    expect(extractJsonLd(html)?.brand).toBe("Acme");
  });

  it("strips schema.org prefix from availability URL", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "Product",
      name: "x",
      offers: { price: 10, priceCurrency: "USD", availability: "http://schema.org/OutOfStock" },
    })}</script>`;
    expect(extractJsonLd(html)?.availability).toBe("outofstock");
  });

  it("accepts arrays of offers — takes the first priced offer", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "Product",
      name: "x",
      offers: [
        { "@type": "Offer", price: 99, priceCurrency: "USD" },
        { "@type": "Offer", price: 120, priceCurrency: "USD" },
      ],
    })}</script>`;
    expect(extractJsonLd(html)?.price).toBe(99);
  });

  it("tolerates malformed JSON with trailing commas", () => {
    const html = `<script type="application/ld+json">
      {"@type":"Product","name":"Garbled","offers":{"price":"50","priceCurrency":"USD",},}
    </script>`;
    const r = extractJsonLd(html);
    expect(r?.name).toBe("Garbled");
    expect(r?.price).toBe(50);
  });

  it("returns null for ld+json without a Product", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "BreadcrumbList",
      itemListElement: [],
    })}</script>`;
    expect(extractJsonLd(html)).toBeNull();
  });
});
