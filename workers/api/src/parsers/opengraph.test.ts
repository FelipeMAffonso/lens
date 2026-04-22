import { describe, expect, it } from "vitest";
import { extractOpenGraph } from "./opengraph.js";

describe("extractOpenGraph", () => {
  it("returns null when no og/product meta tags", () => {
    expect(extractOpenGraph("<html><head></head></html>")).toBeNull();
  });

  it("extracts og:title + og:price + og:brand + og:image", () => {
    const html = `<html><head>
      <meta property="og:title" content="Breville Bambino Plus" />
      <meta property="og:brand" content="Breville" />
      <meta property="og:price:amount" content="499.99" />
      <meta property="og:price:currency" content="USD" />
      <meta property="og:image" content="https://cdn/img.jpg" />
      <meta property="og:description" content="15-bar espresso machine" />
    </head></html>`;
    const r = extractOpenGraph(html);
    expect(r?.name).toBe("Breville Bambino Plus");
    expect(r?.brand).toBe("Breville");
    expect(r?.price).toBe(499.99);
    expect(r?.currency).toBe("USD");
    expect(r?.images).toEqual(["https://cdn/img.jpg"]);
    expect(r?.description).toBe("15-bar espresso machine");
    expect(r?.sources?.name).toBe("opengraph");
  });

  it("accepts product:* fallback", () => {
    const html = `<meta property="product:price:amount" content="19.99" /><meta property="product:price:currency" content="USD" /><meta property="og:title" content="x" />`;
    const r = extractOpenGraph(html);
    expect(r?.price).toBe(19.99);
    expect(r?.currency).toBe("USD");
  });

  it("tolerates content-first attribute order", () => {
    const html = `<meta content="42.00" property="og:price:amount" /><meta content="USD" property="og:price:currency" /><meta content="ContentFirst" property="og:title" />`;
    const r = extractOpenGraph(html);
    expect(r?.price).toBe(42);
    expect(r?.name).toBe("ContentFirst");
  });

  it("collects multiple og:image tags", () => {
    const html = `<meta property="og:title" content="x" /><meta property="og:image" content="https://a" /><meta property="og:image:secure_url" content="https://b" />`;
    expect(extractOpenGraph(html)?.images).toEqual(["https://a", "https://b"]);
  });
});
