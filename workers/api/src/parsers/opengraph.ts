// S3-W15 — OpenGraph + Facebook product: meta extractor.
// Fallback when JSON-LD absent or partial.

import { stampSources, type ProductParse } from "./types.js";

export function extractOpenGraph(html: string): ProductParse | null {
  const head = html.slice(0, 32_000); // OG tags always in <head>
  const out: ProductParse = {};
  const title = metaContent(head, "og:title") ?? metaContent(head, "twitter:title");
  if (title) out.name = cleanText(title);
  const brand =
    metaContent(head, "og:brand") ??
    metaContent(head, "product:brand") ??
    (metaContent(head, "twitter:label1") === "Brand"
      ? metaContent(head, "twitter:data1")
      : undefined);
  if (brand) out.brand = cleanText(brand);
  const priceStr =
    metaContent(head, "og:price:amount") ??
    metaContent(head, "product:price:amount") ??
    metaContent(head, "twitter:data2");
  if (priceStr) {
    const n = parsePrice(priceStr);
    if (n !== undefined) out.price = n;
  }
  const currency =
    metaContent(head, "og:price:currency") ?? metaContent(head, "product:price:currency");
  if (currency) out.currency = currency.toUpperCase();
  const availability = metaContent(head, "og:availability") ?? metaContent(head, "product:availability");
  if (availability) out.availability = cleanText(availability).toLowerCase();
  const images: string[] = [];
  for (const m of head.matchAll(
    /<meta\s+(?:property|name)=["']og:image(?::secure_url)?["']\s+content=["']([^"']+)["']/gi,
  )) {
    if (m[1] && /^https?:/.test(m[1])) images.push(m[1]);
  }
  if (images.length > 0) out.images = images;
  const description = metaContent(head, "og:description") ?? metaContent(head, "description");
  if (description) out.description = cleanText(description);
  if (!out.name && !out.brand && out.price === undefined) return null;
  return stampSources(out, "opengraph");
}

function metaContent(head: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const byProp = new RegExp(
    `<meta\\s+property=["']${escaped}["']\\s+content=["']([^"']*)["']`,
    "i",
  );
  const byName = new RegExp(
    `<meta\\s+name=["']${escaped}["']\\s+content=["']([^"']*)["']`,
    "i",
  );
  const contentFirst = new RegExp(
    `<meta\\s+content=["']([^"']*)["']\\s+(?:property|name)=["']${escaped}["']`,
    "i",
  );
  return (
    head.match(byProp)?.[1] ??
    head.match(byName)?.[1] ??
    head.match(contentFirst)?.[1]
  );
}

function cleanText(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePrice(v: string): number | undefined {
  const trimmed = v.replace(/[^0-9.,-]/g, "").replace(/,(?=\d{3}(\D|$))/g, "");
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}
