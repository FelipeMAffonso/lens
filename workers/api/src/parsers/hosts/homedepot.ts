// S3-W15 — Home Depot selector parser.

import { stampSources, type ProductParse } from "../types.js";

export function parseHomeDepot(html: string, url: string): ProductParse | null {
  const out: ProductParse = {};
  const name =
    html.match(/<h1[^>]*class=["'][^"']*product-details__title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1] ??
    html.match(/<h1[^>]*data-testid=["']product-header__title["'][^>]*>([^<]+)</i)?.[1];
  if (name) out.name = collapse(name.replace(/<[^>]+>/g, " "));

  const priceWhole = html.match(/class=["']price-format__large[^"']*["'][^>]*>\s*\$([0-9,]+)/i)?.[1];
  const priceCents = html.match(/class=["']price-format__small[^"']*["'][^>]*>\s*\.(\d{2})/i)?.[1];
  if (priceWhole) {
    const num = Number(`${priceWhole.replace(/,/g, "")}.${priceCents ?? "00"}`);
    if (Number.isFinite(num)) out.price = num;
  } else {
    const flat = html.match(/class=["']price__numbers[^"']*["'][^>]*>\s*\$?([0-9,]+(?:\.\d{2})?)/i)?.[1];
    if (flat) {
      const n = Number(flat.replace(/,/g, ""));
      if (Number.isFinite(n)) out.price = n;
    }
  }

  const model = html.match(/\bModel\s*#\s*[:\s]*\s*<[^>]*>\s*([A-Z0-9-]+)/i)?.[1];
  if (model) out.mpn = model;

  const idFromUrl = url.match(/\/(\d{9,12})\b/)?.[1];
  if (idFromUrl) out.productId = idFromUrl;

  const brand = html.match(/"brand"\s*:\s*"([^"]+)"/)?.[1];
  if (brand) out.brand = collapse(brand);

  if (!out.name && out.price === undefined) return null;
  return stampSources(out, "host");
}

function collapse(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}
