// S4-W27 — top-brand allowlist (for typosquat detection) + verified-retailer
// trust-signal list (grants a -15 risk-score bonus). Expand via PR; every
// addition should cite the source (brand's own .com, not a marketing directory).

/**
 * Canonical brand labels used for typosquat distance. Each entry is the
 * apex-domain short label (without TLD). Order doesn't matter; lookup scans
 * all entries.
 */
export const MAJOR_BRANDS: readonly string[] = [
  // General retail
  "amazon",
  "walmart",
  "target",
  "bestbuy",
  "costco",
  "homedepot",
  "lowes",
  "kohls",
  "macys",
  "jcpenney",
  "nordstrom",
  "wayfair",
  "overstock",
  "newegg",
  "microcenter",
  "frys",
  // Marketplaces
  "ebay",
  "etsy",
  "shopify",
  "aliexpress",
  "alibaba",
  "shein",
  "temu",
  // Electronics
  "apple",
  "samsung",
  "microsoft",
  "google",
  // Payment / identity (commonly spoofed)
  "paypal",
  "stripe",
  "venmo",
  "zelle",
  "cashapp",
  // Fashion / lifestyle
  "nike",
  "adidas",
  "underarmour",
  "zappos",
  "gap",
  "oldnavy",
  "bananarepublic",
  "sephora",
  "ulta",
  "rei",
  "patagonia",
  "allbirds",
];

/**
 * Verified-retailer allowlist. A host whose canonical form appears here gets
 * a -15 risk-score bonus. Narrower than MAJOR_BRANDS — these are the domains
 * Lens has reason to believe are the REAL retailer (not a typosquat).
 */
export const VERIFIED_RETAILERS: ReadonlySet<string> = new Set([
  "amazon.com",
  "walmart.com",
  "target.com",
  "bestbuy.com",
  "costco.com",
  "homedepot.com",
  "lowes.com",
  "kohls.com",
  "macys.com",
  "jcpenney.com",
  "nordstrom.com",
  "wayfair.com",
  "ebay.com",
  "etsy.com",
  "shopify.com",
  "aliexpress.com",
  "alibaba.com",
  "shein.com",
  "temu.com",
  "apple.com",
  "samsung.com",
  "microsoft.com",
  "paypal.com",
  "stripe.com",
  "venmo.com",
  "nike.com",
  "adidas.com",
  "underarmour.com",
  "zappos.com",
  "gap.com",
  "oldnavy.com",
  "bananarepublic.com",
  "sephora.com",
  "ulta.com",
  "rei.com",
  "patagonia.com",
  "allbirds.com",
  "newegg.com",
  "microcenter.com",
]);

/** Return the canonical apex domain — strip leading www., lowercase. */
export function canonicalHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

/** Extract the apex label (without TLD), e.g. "target.com" → "target". */
export function apexLabel(host: string): string {
  const canonical = canonicalHost(host);
  const parts = canonical.split(".");
  // For two-part domains we take the first part ("target.com" → "target").
  // For three-part we take the second-to-last ("shop.target.com" → "target").
  if (parts.length <= 2) return parts[0] ?? canonical;
  return parts[parts.length - 2] ?? canonical;
}
