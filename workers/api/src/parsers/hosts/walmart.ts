// S3-W15 — Walmart selector parser.

import { stampSources, type ProductParse } from "../types.js";

export function parseWalmart(html: string, _url: string): ProductParse | null {
  const out: ProductParse = {};

  const h1 = html.match(/<h1[^>]*(?:itemprop=["']name["']|data-seo-id=["']hero-carousel-product-title["'])[^>]*>([^<]+)</i)?.[1];
  if (h1) out.name = collapse(h1);

  const price = html.match(/itemprop=["']price["'][^>]*content=["']([^"']+)/i)?.[1];
  if (price) {
    const n = parsePrice(price);
    if (n !== undefined) out.price = n;
  }
  if (out.price === undefined) {
    const visible = html.match(/<span[^>]*class=["'][^"']*price[^"']*["'][^>]*>\s*\$([0-9,]+\.\d{2})/i)?.[1];
    if (visible) {
      const n = Number(visible.replace(/,/g, ""));
      if (Number.isFinite(n)) out.price = n;
    }
  }

  const brand = html.match(/"brand"\s*:\s*"([^"]+)"/)?.[1];
  if (brand) out.brand = collapse(brand);

  const seller = html.match(/data-seller-id=["']([^"']+)/i)?.[1];
  if (seller) out.sku = seller;

  if (!out.name && out.price === undefined) return null;
  return stampSources(out, "host");
}

function collapse(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function parsePrice(v: string): number | undefined {
  const trimmed = v.replace(/[^0-9.,-]/g, "").replace(/,(?=\d{3}(\D|$))/g, "");
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}
