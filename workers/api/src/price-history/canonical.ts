// S4-W21 — canonical URL + productId extraction per retailer.

export interface CanonicalIdentity {
  canonicalUrl: string;
  host: string;
  productId?: string;
}

const PATH_EXTRACTORS: Array<{ host: RegExp; extract: (u: URL) => string | undefined }> = [
  {
    host: /(^|\.)amazon\.(com|ca|co\.uk|de|fr|in|com\.mx)$/i,
    extract: (u) => {
      // Amazon ASIN is 10 alphanumeric chars, commonly in /dp/<ASIN> or /gp/product/<ASIN>
      const match = u.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})\b/i);
      return match?.[1]?.toUpperCase();
    },
  },
  {
    host: /(^|\.)bestbuy\.com$/i,
    extract: (u) => {
      const match = u.pathname.match(/\/skuId=(\d+)|\/(\d{6,10})\.p\b/);
      return match?.[1] ?? match?.[2];
    },
  },
  {
    host: /(^|\.)walmart\.com$/i,
    extract: (u) => {
      const match = u.pathname.match(/\/ip\/[^/]+\/(\d+)/);
      return match?.[1];
    },
  },
  {
    host: /(^|\.)target\.com$/i,
    extract: (u) => {
      const match = u.pathname.match(/\/A-(\d+)/);
      return match?.[1];
    },
  },
  {
    host: /(^|\.)homedepot\.com$/i,
    extract: (u) => {
      const match = u.pathname.match(/\/(\d{9})\b/);
      return match?.[1];
    },
  },
];

/**
 * Strip tracking query params + fragments, lowercase host, canonicalize path.
 * Affiliate/tracking params ALWAYS dropped so we never persist them.
 */
const TRACKING_PARAMS = new Set([
  "ref",
  "tag",
  "th",
  "psc",
  "pf_rd_p",
  "pf_rd_r",
  "pd_rd_r",
  "pd_rd_w",
  "pd_rd_wg",
  "pd_rd_i",
  "aaid",
  "cid",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
]);

export function canonicalize(rawUrl: string): CanonicalIdentity | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;

  // Drop tracking params (exact match + utm_* prefix).
  const keptParams: string[] = [];
  for (const [k] of u.searchParams) keptParams.push(k);
  for (const k of keptParams) {
    if (TRACKING_PARAMS.has(k) || k.toLowerCase().startsWith("utm_")) {
      u.searchParams.delete(k);
    }
  }

  // Lowercase host.
  const host = u.hostname.toLowerCase();
  u.hostname = host;
  u.hash = "";

  // Strip Amazon-style /ref=... tracking segments from the path.
  u.pathname = u.pathname
    .replace(/\/ref=[^/]+/gi, "")
    .replace(/\/?\?/, "?")
    .replace(/\/+$/, "") || "/";

  const extractor = PATH_EXTRACTORS.find((e) => e.host.test(host));
  const productId = extractor ? extractor.extract(u) : undefined;

  const identity: CanonicalIdentity = {
    canonicalUrl: u.toString(),
    host,
  };
  if (productId) identity.productId = productId;
  return identity;
}
