import { describe, expect, it } from "vitest";
import { extractMicrodata } from "./microdata.js";

describe("extractMicrodata", () => {
  it("returns null when no Product microdata", () => {
    expect(extractMicrodata("<html><body>hi</body></html>")).toBeNull();
  });

  it("reads itemprop from an element with text content", () => {
    const html = `
      <div itemscope itemtype="https://schema.org/Product">
        <h1 itemprop="name">Breville Bambino Plus</h1>
        <span itemprop="brand">Breville</span>
        <span itemprop="price">499.99</span>
        <meta itemprop="priceCurrency" content="USD" />
      </div>`;
    const r = extractMicrodata(html);
    expect(r?.name).toBe("Breville Bambino Plus");
    expect(r?.brand).toBe("Breville");
    expect(r?.price).toBe(499.99);
    expect(r?.currency).toBe("USD");
    expect(r?.sources?.name).toBe("microdata");
  });

  it("reads itemprop from meta content tags", () => {
    const html = `
      <section itemscope itemtype="https://schema.org/Product">
        <meta itemprop="name" content="Coffee Grinder" />
        <meta itemprop="price" content="129" />
        <meta itemprop="availability" content="https://schema.org/InStock" />
      </section>`;
    const r = extractMicrodata(html);
    expect(r?.name).toBe("Coffee Grinder");
    expect(r?.price).toBe(129);
    expect(r?.availability).toContain("instock");
  });

  it("returns null when container has no extractable fields", () => {
    const html = `<div itemscope itemtype="https://schema.org/Product"></div>`;
    expect(extractMicrodata(html)).toBeNull();
  });
});
