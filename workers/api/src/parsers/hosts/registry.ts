// S3-W15 — host-to-parser registry.

import type { ProductParse } from "../types.js";
import { parseAmazon } from "./amazon.js";
import { parseBestBuy } from "./bestbuy.js";
import { parseWalmart } from "./walmart.js";
import { parseTarget } from "./target.js";
import { parseHomeDepot } from "./homedepot.js";
import { parseShopify, isShopify } from "./shopify.js";

export type HostId = "amazon" | "bestbuy" | "walmart" | "target" | "homedepot" | "shopify";

interface HostAdapter {
  id: HostId;
  match: (host: string, html: string) => boolean;
  parse: (html: string, url: string) => ProductParse | null;
}

const ADAPTERS: HostAdapter[] = [
  { id: "amazon", match: (h) => /(^|\.)amazon\.(com|ca|co\.uk|de|fr|in|com\.mx)$/i.test(h), parse: parseAmazon },
  { id: "bestbuy", match: (h) => /(^|\.)bestbuy\.(com|ca)$/i.test(h), parse: parseBestBuy },
  { id: "walmart", match: (h) => /(^|\.)walmart\.(com|ca)$/i.test(h), parse: parseWalmart },
  { id: "target", match: (h) => /(^|\.)target\.com$/i.test(h), parse: parseTarget },
  { id: "homedepot", match: (h) => /(^|\.)homedepot\.com$/i.test(h), parse: parseHomeDepot },
  {
    id: "shopify",
    match: (_h, html) => isShopify(html),
    parse: parseShopify,
  },
];

export function adapterFor(host: string, html: string): HostAdapter | null {
  return ADAPTERS.find((a) => a.match(host, html)) ?? null;
}

export const ALL_HOST_IDS: HostId[] = ADAPTERS.map((a) => a.id);
