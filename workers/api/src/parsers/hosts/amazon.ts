// S3-W15 — Amazon-specific selector parser.
// Populates fields beyond what JSON-LD provides (Amazon's JSON-LD on product
// pages is often limited to Product + AggregateRating without price).

import { stampSources, type ProductParse } from "../types.js";

export function parseAmazon(html: string, url: string): ProductParse | null {
  const out: ProductParse = {};

  const title = matchTag(html, /id=["']productTitle["'][^>]*>([^<]+)</i);
  if (title) out.name = collapse(title);

  const brand =
    matchTag(html, /id=["']bylineInfo["'][^>]*>([^<]+)</i) ??
    matchTag(html, /\bBrand:<\/span>\s*<span[^>]*>([^<]+)</i);
  if (brand) out.brand = cleanBrand(brand);

  const price = extractAmazonPrice(html);
  if (price !== undefined) out.price = price;

  const availability = matchTag(html, /id=["']availability["'][^>]*>\s*<span[^>]*>([^<]+)</i);
  if (availability) out.availability = collapse(availability).toLowerCase();

  // ASIN — fall back to URL extraction.
  const asinFromUrl = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})\b/i)?.[1];
  const asinFromDom = html.match(/data-asin=["']([A-Z0-9]{10})["']/i)?.[1];
  const asin = (asinFromUrl ?? asinFromDom)?.toUpperCase();
  if (asin) {
    out.productId = asin;
    out.sku = out.sku ?? asin;
  }

  const features = extractAmazonFeatures(html);
  if (features.length > 0) out.features = features;

  const images = extractImages(html);
  if (images.length > 0) out.images = images;

  if (!out.name && out.price === undefined) return null;
  return stampSources(out, "host");
}

function extractAmazonPrice(html: string): number | undefined {
  // Modern Amazon: <span class="a-price"><span class="a-offscreen">$123.45</span>...</span>
  const modern = html.match(
    /<span\s+class=["']a-price\s+a-text-price[^"']*["'][^>]*>\s*<span\s+class=["']a-offscreen["']>\s*([^<]+)\s*<\/span>/i,
  );
  if (modern?.[1]) {
    const n = parsePrice(modern[1]);
    if (n !== undefined) return n;
  }
  const plain = html.match(/<span[^>]*class=["']a-offscreen["'][^>]*>\s*\$([0-9]+(?:\.[0-9]+)?)/);
  if (plain?.[1]) {
    const n = Number(plain[1]);
    if (Number.isFinite(n)) return n;
  }
  const legacy = html.match(
    /id=["'](?:priceblock_ourprice|priceblock_saleprice|priceblock_dealprice)["'][^>]*>\s*\$?([0-9]+(?:\.[0-9]+)?)/i,
  );
  if (legacy?.[1]) {
    const n = Number(legacy[1]);
    if (Number.isFinite(n)) return n;
  }
  // Whole+fraction pattern: <span class="a-price-whole">123</span>.<span class="a-price-fraction">45</span>
  const whole = html.match(/class=["']a-price-whole["'][^>]*>([0-9,]+)</i)?.[1];
  const frac = html.match(/class=["']a-price-fraction["'][^>]*>([0-9]+)</i)?.[1];
  if (whole && frac) {
    const n = Number(`${whole.replace(/,/g, "")}.${frac}`);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function extractAmazonFeatures(html: string): string[] {
  const section = html.match(/id=["']feature-bullets["'][\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/i);
  if (!section?.[1]) return [];
  const bullets: string[] = [];
  for (const m of section[1].matchAll(/<li[^>]*>\s*<span[^>]*>\s*([\s\S]*?)\s*<\/span>\s*<\/li>/gi)) {
    const text = m[1]?.replace(/<[^>]+>/g, "").trim();
    if (text && !/^See more product details$/i.test(text)) bullets.push(collapse(text));
  }
  return bullets.slice(0, 10);
}

function extractImages(html: string): string[] {
  const out: string[] = [];
  const dataHiRes = html.match(/"hiRes"\s*:\s*"([^"]+)"/g);
  if (dataHiRes) {
    for (const m of dataHiRes) {
      const url = m.match(/"hiRes"\s*:\s*"([^"]+)"/)?.[1];
      if (url && /^https?:/.test(url)) out.push(url);
    }
  }
  // Fallback: first <img id="landingImage"> or first <img src="...amazon.com/images/...">
  if (out.length === 0) {
    const land = html.match(/id=["']landingImage["'][^>]*src=["']([^"']+)["']/)?.[1];
    if (land) out.push(land);
  }
  return out;
}

function matchTag(html: string, re: RegExp): string | undefined {
  return html.match(re)?.[1]?.trim();
}

function collapse(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}

function cleanBrand(s: string): string {
  return collapse(s)
    .replace(/^Visit the /i, "")
    .replace(/^Brand:?\s*/i, "")
    .replace(/ Store$/i, "")
    .trim();
}

function parsePrice(v: string): number | undefined {
  const trimmed = v.replace(/[^0-9.,-]/g, "").replace(/,(?=\d{3}(\D|$))/g, "");
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}
