// S3-W15 — typed product extraction output.
// Every parser returns a (potentially-partial) ProductParse. The orchestrator
// merges by priority and stamps every field's provenance.

export type ParseSource = "host" | "json-ld" | "microdata" | "opengraph" | "heuristic";

export interface ProductParse {
  name?: string;
  brand?: string;
  price?: number;
  currency?: string;         // "USD", "GBP", ...
  availability?: string;     // free-form: "in stock" | "out of stock" | ...
  sku?: string;              // host-scoped identifier
  mpn?: string;              // manufacturer part number
  productId?: string;        // ASIN / SKU / TCIN / internal id
  images?: string[];         // absolute URLs, order preserved
  description?: string;
  features?: string[];       // bullet list
  rating?: number;           // 0..5
  ratingCount?: number;
  /** per-field source tags, key matches the field name above */
  sources?: Partial<Record<keyof Omit<ProductParse, "sources" | "host" | "url">, ParseSource>>;
  host?: string;
  url?: string;
}

/**
 * Merge A over B (A wins on conflict). Sources map is merged in parallel.
 * Undefined fields in A do not overwrite B.
 */
export function mergeParse(a: ProductParse, b: ProductParse): ProductParse {
  const out: ProductParse = { ...b };
  const scalarKeys = [
    "name",
    "brand",
    "price",
    "currency",
    "availability",
    "sku",
    "mpn",
    "productId",
    "description",
    "rating",
    "ratingCount",
    "host",
    "url",
  ] as const;
  for (const k of scalarKeys) {
    if (a[k] !== undefined) (out as Record<string, unknown>)[k] = a[k];
  }
  if (a.images && a.images.length > 0) out.images = a.images;
  if (a.features && a.features.length > 0) out.features = a.features;
  if (a.sources || b.sources) {
    out.sources = { ...(b.sources ?? {}), ...(a.sources ?? {}) };
  }
  return out;
}

/**
 * Stamp every present scalar field on a parse with the same source. Used by
 * per-host parsers that populate from one strategy.
 */
export function stampSources(p: ProductParse, source: ParseSource): ProductParse {
  const out: ProductParse = { ...p, sources: { ...(p.sources ?? {}) } };
  const keys: Array<keyof ProductParse> = [
    "name",
    "brand",
    "price",
    "currency",
    "availability",
    "sku",
    "mpn",
    "productId",
    "description",
    "rating",
    "ratingCount",
    "images",
    "features",
  ];
  for (const k of keys) {
    if (p[k] !== undefined) {
      (out.sources as Record<string, ParseSource>)[k as string] = source;
    }
  }
  return out;
}
