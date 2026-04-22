// S3-W15 — JSON-LD Product extractor.
// Schema.org `Product` objects are the most reliable structured-data surface
// on the modern commerce web. Every retailer in scope here emits them.

import { stampSources, type ProductParse } from "./types.js";

/**
 * Extract `<script type="application/ld+json">` blocks. Scan each for any
 * object whose `@type` includes "Product" (or in an `@graph` array), then map
 * fields → ProductParse.
 */
export function extractJsonLd(html: string): ProductParse | null {
  const blocks = scanLdJsonBlocks(html);
  for (const block of blocks) {
    const parsed = tryParse(block);
    if (!parsed) continue;
    const prod = findProduct(parsed);
    if (!prod) continue;
    const mapped = mapProduct(prod);
    if (hasAny(mapped)) return stampSources(mapped, "json-ld");
  }
  return null;
}

function scanLdJsonBlocks(html: string): string[] {
  const out: string[] = [];
  const re = /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const inner = m[1];
    if (inner) out.push(inner.trim());
  }
  return out;
}

function tryParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // Some retailers ship JSON with trailing commas / HTML entities. Try a
    // minimal cleanup (entity decode, strip comments) before bailing.
    try {
      const cleaned = raw
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/,\s*([}\]])/g, "$1");
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
}

type JsonObject = Record<string, unknown>;

function findProduct(root: unknown): JsonObject | null {
  const visit = (node: unknown): JsonObject | null => {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) {
      for (const item of node) {
        const hit = visit(item);
        if (hit) return hit;
      }
      return null;
    }
    const obj = node as JsonObject;
    const type = obj["@type"];
    if (matchesProduct(type)) return obj;
    if (Array.isArray(obj["@graph"])) {
      return visit(obj["@graph"]);
    }
    // Recurse one level for ItemPage / WebPage that nest a Product.
    for (const v of Object.values(obj)) {
      const hit = visit(v);
      if (hit) return hit;
    }
    return null;
  };
  return visit(root);
}

function matchesProduct(type: unknown): boolean {
  if (typeof type === "string") return /product/i.test(type);
  if (Array.isArray(type)) return type.some((t) => typeof t === "string" && /product/i.test(t));
  return false;
}

function mapProduct(p: JsonObject): ProductParse {
  const out: ProductParse = {};
  const name = pickString(p["name"]);
  if (name) out.name = name;
  const brand = extractBrand(p["brand"]);
  if (brand) out.brand = brand;
  const description = pickString(p["description"]);
  if (description) out.description = description;
  const sku = pickString(p["sku"]) ?? pickString(p["gtin13"]) ?? pickString(p["gtin"]);
  if (sku) out.sku = sku;
  const mpn = pickString(p["mpn"]);
  if (mpn) out.mpn = mpn;
  const productId = pickString(p["productID"]);
  if (productId) out.productId = productId;
  const images = extractImages(p["image"]);
  if (images.length > 0) out.images = images;

  const offers = extractOffers(p["offers"]);
  if (offers.price !== undefined) out.price = offers.price;
  if (offers.currency) out.currency = offers.currency;
  if (offers.availability) out.availability = offers.availability;

  const rating = extractRating(p["aggregateRating"]);
  if (rating) {
    if (rating.value !== undefined) out.rating = rating.value;
    if (rating.count !== undefined) out.ratingCount = rating.count;
  }
  return out;
}

function pickString(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return decodeHtmlEntities(v.trim());
  if (Array.isArray(v)) {
    const s = v.find((x) => typeof x === "string" && x.trim());
    return typeof s === "string" ? decodeHtmlEntities(s.trim()) : undefined;
  }
  return undefined;
}

function extractBrand(v: unknown): string | undefined {
  if (!v) return undefined;
  if (typeof v === "string") return decodeHtmlEntities(v.trim()) || undefined;
  if (Array.isArray(v)) {
    for (const item of v) {
      const out = extractBrand(item);
      if (out) return out;
    }
    return undefined;
  }
  if (typeof v === "object") {
    const obj = v as JsonObject;
    const name = pickString(obj["name"]);
    if (name) return name;
  }
  return undefined;
}

function extractImages(v: unknown): string[] {
  const out: string[] = [];
  const push = (s: unknown): void => {
    if (typeof s === "string" && /^https?:/.test(s)) out.push(s);
  };
  if (typeof v === "string") push(v);
  else if (Array.isArray(v)) {
    for (const item of v) {
      if (typeof item === "string") push(item);
      else if (item && typeof item === "object") push((item as JsonObject)["url"]);
    }
  } else if (v && typeof v === "object") {
    push((v as JsonObject)["url"]);
  }
  return out;
}

interface OfferData {
  price?: number;
  currency?: string;
  availability?: string;
}

function extractOffers(v: unknown): OfferData {
  const out: OfferData = {};
  const considerOne = (o: unknown): void => {
    if (!o || typeof o !== "object") return;
    const obj = o as JsonObject;
    const priceRaw = obj["price"] ?? obj["lowPrice"];
    if (priceRaw !== undefined) {
      const parsed = parsePrice(priceRaw);
      if (parsed !== undefined && out.price === undefined) out.price = parsed;
    }
    const cur = pickString(obj["priceCurrency"]);
    if (cur && !out.currency) out.currency = cur.toUpperCase();
    const avail = pickString(obj["availability"]);
    if (avail && !out.availability) {
      // Normalize schema.org URL to short label.
      out.availability = avail.replace(/^https?:\/\/schema\.org\//i, "").toLowerCase();
    }
  };
  if (Array.isArray(v)) {
    for (const item of v) considerOne(item);
  } else {
    considerOne(v);
  }
  return out;
}

function parsePrice(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const trimmed = v.replace(/[^0-9.,-]/g, "").replace(/,(?=\d{3}(\D|$))/g, "");
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function extractRating(v: unknown): { value?: number; count?: number } | null {
  if (!v || typeof v !== "object") return null;
  const obj = v as JsonObject;
  const value = parsePrice(obj["ratingValue"]);
  const count = parsePrice(obj["reviewCount"] ?? obj["ratingCount"]);
  const out: { value?: number; count?: number } = {};
  if (value !== undefined) out.value = value;
  if (count !== undefined) out.count = Math.round(count);
  return out.value !== undefined || out.count !== undefined ? out : null;
}

function hasAny(p: ProductParse): boolean {
  return Boolean(p.name || p.brand || p.price !== undefined);
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)));
}
