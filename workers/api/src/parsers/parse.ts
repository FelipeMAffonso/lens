// S3-W15 — product parser orchestrator.
// Merges host-specific, JSON-LD, microdata, and OpenGraph parses with that
// priority (host > jsonld > microdata > opengraph).

import { extractJsonLd } from "./jsonld.js";
import { extractMicrodata } from "./microdata.js";
import { extractOpenGraph } from "./opengraph.js";
import { adapterFor } from "./hosts/registry.js";
import { mergeParse, type ProductParse } from "./types.js";

/**
 * Given the full HTML of a product page + its URL, return a structured parse.
 * Always returns an object; scalar fields may still be undefined when nothing
 * hits. `host` + `url` are always populated. The `sources` map records which
 * strategy contributed each scalar.
 */
export function parseProduct(html: string, url: string): ProductParse {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    // keep host empty
  }

  const jsonLd = extractJsonLd(html);
  const microdata = extractMicrodata(html);
  const opengraph = extractOpenGraph(html);
  const adapter = adapterFor(host, html);
  const hostParse = adapter ? adapter.parse(html, url) : null;

  // Merge order (right-most is LOW priority in mergeParse — A overwrites B):
  // result = host OVER jsonLd OVER microdata OVER opengraph.
  let merged: ProductParse = opengraph ?? {};
  if (microdata) merged = mergeParse(microdata, merged);
  if (jsonLd) merged = mergeParse(jsonLd, merged);
  if (hostParse) merged = mergeParse(hostParse, merged);

  // Always stamp host (even when empty, for malformed URLs) so callers can
  // reliably destructure `.host`.
  merged.host = host;
  merged.url = url;
  return merged;
}

/**
 * A lightweight "did we get anything useful?" predicate. Used by extract.ts
 * to decide whether to skip the Opus round-trip.
 */
export function isConfident(parse: ProductParse): boolean {
  return Boolean(parse.name && parse.price !== undefined);
}
