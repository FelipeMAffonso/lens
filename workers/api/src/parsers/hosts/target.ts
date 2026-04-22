// S3-W15 — Target selector parser.

import { stampSources, type ProductParse } from "../types.js";

export function parseTarget(html: string, url: string): ProductParse | null {
  const out: ProductParse = {};

  const name =
    html.match(/<h1[^>]*data-test=["']product-title["'][^>]*>([^<]+)</i)?.[1] ??
    html.match(/<h1[^>]*data-testid=["']product-title["'][^>]*>([^<]+)</i)?.[1];
  if (name) out.name = collapse(name);

  const priceText = html.match(/data-test=["']product-price["'][^>]*>\s*\$?([0-9,]+\.\d{2})/i)?.[1];
  if (priceText) {
    const n = Number(priceText.replace(/,/g, ""));
    if (Number.isFinite(n)) out.price = n;
  }

  const tcinFromUrl = url.match(/\/A-(\d+)/)?.[1];
  const tcinFromDom = html.match(/"tcin"\s*:\s*"?(\d+)"?/)?.[1];
  const tcin = tcinFromUrl ?? tcinFromDom;
  if (tcin) {
    out.productId = tcin;
    out.sku = out.sku ?? tcin;
  }

  const brand = html.match(/"brand"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/)?.[1];
  if (brand) out.brand = collapse(brand);

  if (!out.name && out.price === undefined) return null;
  return stampSources(out, "host");
}

function collapse(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}
