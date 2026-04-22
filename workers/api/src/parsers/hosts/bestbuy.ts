// S3-W15 — Best Buy selector parser.

import { stampSources, type ProductParse } from "../types.js";

export function parseBestBuy(html: string, _url: string): ProductParse | null {
  const out: ProductParse = {};
  // Title patterns: BBY has used <h1 class="heading-5 v-fw-regular"> and <h1 class="sku-title">.
  const h1 =
    html.match(/<h1[^>]*class=["'][^"']*(?:heading-5|sku-title)[^"']*["'][^>]*>([^<]+)</i)?.[1] ??
    html.match(/<div[^>]*class=["'][^"']*product-title[^"']*["'][^>]*>\s*<h1[^>]*>([^<]+)</i)?.[1];
  if (h1) out.name = collapse(h1);

  const price =
    html.match(/class=["']priceView-hero-price[^"']*["'][^>]*>\s*<span[^>]*>\s*\$?([0-9,]+\.\d{2})/i)?.[1] ??
    html.match(/class=["']priceView-customer-price[^"']*["'][^>]*>\s*<span[^>]*>\s*\$?([0-9,]+\.\d{2})/i)?.[1];
  if (price) {
    const n = Number(price.replace(/,/g, ""));
    if (Number.isFinite(n)) out.price = n;
  }
  const sku =
    html.match(/class=["']product-data-value v-fw-regular["'][^>]*>([^<]+)</i)?.[1] ??
    html.match(/\bSKU:\s*([A-Z0-9]+)/i)?.[1];
  if (sku) out.sku = sku.trim();

  const brand = html.match(/"brandName"\s*:\s*"([^"]+)"/)?.[1];
  if (brand) out.brand = collapse(brand);

  if (!out.name && out.price === undefined) return null;
  return stampSources(out, "host");
}

function collapse(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
