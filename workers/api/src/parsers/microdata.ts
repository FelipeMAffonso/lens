// S3-W15 — Schema.org microdata extractor.
// Legacy but widespread (Etsy, some Shopify themes). Scan for a container with
// itemtype containing "Product" then walk itemprop children.

import { stampSources, type ProductParse } from "./types.js";

export function extractMicrodata(html: string): ProductParse | null {
  const containerRe = /<([a-z]+)\b[^>]*itemscope[^>]*itemtype=["']https?:\/\/schema\.org\/Product["'][^>]*>([\s\S]*?)<\/\1>/i;
  const m = html.match(containerRe);
  if (!m) return null;
  const inner = m[2] ?? "";
  const out: ProductParse = {};

  const name = getItemprop(inner, "name");
  if (name) out.name = name;

  const brand = getItemprop(inner, "brand");
  if (brand) out.brand = brand;

  const priceRaw = getItemprop(inner, "price");
  const price = priceRaw ? parsePrice(priceRaw) : undefined;
  if (price !== undefined) out.price = price;

  const currency = getItemprop(inner, "priceCurrency");
  if (currency) out.currency = currency.toUpperCase();

  const description = getItemprop(inner, "description");
  if (description) out.description = description;

  const sku = getItemprop(inner, "sku");
  if (sku) out.sku = sku;

  const availability = getItemprop(inner, "availability");
  if (availability) out.availability = availability.toLowerCase();

  if (!out.name && !out.brand && out.price === undefined) return null;
  return stampSources(out, "microdata");
}

function getItemprop(html: string, prop: string): string | undefined {
  // Preferred order: meta itemprop content → element with itemprop text → attribute.
  const meta = html.match(
    new RegExp(`<meta[^>]*itemprop=["']${escape(prop)}["'][^>]*content=["']([^"']+)["']`, "i"),
  );
  if (meta?.[1]) return decode(meta[1].trim());
  const contentFirst = html.match(
    new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*itemprop=["']${escape(prop)}["']`, "i"),
  );
  if (contentFirst?.[1]) return decode(contentFirst[1].trim());
  const el = html.match(
    new RegExp(
      `<(?:span|div|p|h\\d|a|strong|b)[^>]*itemprop=["']${escape(prop)}["'][^>]*>([\\s\\S]*?)<`,
      "i",
    ),
  );
  if (el?.[1]) {
    const text = el[1].replace(/<[^>]+>/g, "").trim();
    if (text) return decode(text);
  }
  return undefined;
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePrice(v: string): number | undefined {
  const trimmed = v.replace(/[^0-9.,-]/g, "").replace(/,(?=\d{3}(\D|$))/g, "");
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}
