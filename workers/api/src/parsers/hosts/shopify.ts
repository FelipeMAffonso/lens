// S3-W15 — Generic Shopify parser.
// Detected via <meta name="generator" content="Shopify"> OR presence of
// `Shopify.theme` in the body. Extraction leans on Shopify's ubiquitous
// `product-single-*` and `product__*` classnames, plus the standard
// `/products/<handle>.js` endpoint shape hinted by the `<script type="application/json"
// id="ProductJson-*">` tag.

import { stampSources, type ProductParse } from "../types.js";

export function isShopify(html: string): boolean {
  if (/<meta\s+name=["']generator["']\s+content=["']Shopify[^"']*["']/i.test(html)) return true;
  if (/window\.Shopify\s*=\s*\{/.test(html)) return true;
  if (/Shopify\.theme\s*=/.test(html)) return true;
  return false;
}

export function parseShopify(html: string, _url: string): ProductParse | null {
  if (!isShopify(html)) return null;
  const out: ProductParse = {};

  // `<script id="ProductJson-...">` is the canonical Shopify product payload.
  const productJsonMatch = html.match(
    /<script[^>]*id=["']ProductJson-[^"']*["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (productJsonMatch?.[1]) {
    try {
      const parsed = JSON.parse(productJsonMatch[1]) as {
        title?: string;
        vendor?: string;
        price?: number;
        price_min?: number;
        images?: string[];
        handle?: string;
        body_html?: string;
      };
      if (parsed.title) out.name = parsed.title;
      if (parsed.vendor) out.brand = parsed.vendor;
      const price = parsed.price ?? parsed.price_min;
      if (price !== undefined) out.price = price / 100;
      if (parsed.images && parsed.images.length > 0) out.images = parsed.images;
      if (parsed.handle) out.sku = parsed.handle;
      if (parsed.body_html) out.description = parsed.body_html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    } catch {
      // fall through to DOM selectors
    }
  }

  if (!out.name) {
    const h1 =
      html.match(/<h1[^>]*class=["'][^"']*product(?:-single)?__title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1] ??
      html.match(/<h1[^>]*itemprop=["']name["'][^>]*>([^<]+)</i)?.[1];
    if (h1) out.name = collapse(h1.replace(/<[^>]+>/g, " "));
  }

  if (out.price === undefined) {
    const price = html.match(/class=["'][^"']*price(?:__regular|__current|__sale)?[^"']*["'][^>]*>[\s\S]*?\$?([0-9,]+\.\d{2})/i)?.[1];
    if (price) {
      const n = Number(price.replace(/,/g, ""));
      if (Number.isFinite(n)) out.price = n;
    }
  }

  // Every Shopify store uses USD by default; per-currency parse via `Shopify.currency`.
  if (!out.currency) {
    const cur = html.match(/"currency"\s*:\s*"([A-Z]{3})"/)?.[1];
    if (cur) out.currency = cur;
  }

  if (!out.name && out.price === undefined) return null;
  return stampSources(out, "host");
}

function collapse(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}
