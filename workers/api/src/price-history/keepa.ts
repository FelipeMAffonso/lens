// S4-W21 — Keepa API client shim.
//
// Keepa (https://keepa.com/#!api) returns Amazon price history as an array
// of timestamp-price pairs indexed by "csv type". Type 0 is Amazon's own
// price, type 1 is new from 3P sellers, type 3 is used.
//
// For the hackathon we ship the scaffold only — when a real KEEPA_API_KEY
// is set the handler calls into this module. When missing, the handler
// falls back to fixture.ts.

import type { PricePoint } from "./types.js";

export interface KeepaClientOptions {
  apiKey: string;
  domain?: number; // 1 = amazon.com (default), 2 = .co.uk, 3 = .de, ...
  fetch?: typeof fetch;
}

export async function fetchKeepaSeries(
  asin: string,
  opts: KeepaClientOptions,
): Promise<PricePoint[] | null> {
  if (!opts.apiKey || !/^[A-Z0-9]{10}$/i.test(asin)) return null;
  const f = opts.fetch ?? fetch;
  const domain = opts.domain ?? 1;
  // Keepa CSV type 0 = Amazon price, stats=90 days.
  const url = `https://api.keepa.com/product?key=${encodeURIComponent(opts.apiKey)}&domain=${domain}&asin=${encodeURIComponent(asin)}&stats=90&history=1`;
  let res: Response;
  try {
    res = await f(url);
  } catch (err) {
    console.error("[keepa] fetch error:", (err as Error).message);
    return null;
  }
  if (!res.ok) {
    console.error("[keepa] http error:", res.status);
    return null;
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch (err) {
    console.error("[keepa] json parse error:", (err as Error).message);
    return null;
  }
  return normalizeKeepaResponse(body);
}

/**
 * Keepa returns price histories as flat arrays of alternating
 * [minutesSinceEpoch, priceInCents]. Convert to our PricePoint format.
 * Exported for unit testing.
 */
export function normalizeKeepaResponse(body: unknown): PricePoint[] | null {
  if (!body || typeof body !== "object") return null;
  const root = body as { products?: Array<{ csv?: Array<number[] | null> }> };
  const csv0 = root.products?.[0]?.csv?.[0];
  if (!Array.isArray(csv0) || csv0.length < 2) return null;
  const out: PricePoint[] = [];
  // seen (date → last price) so we get daily granularity.
  const byDate = new Map<string, number>();
  for (let i = 0; i + 1 < csv0.length; i += 2) {
    const minutes = csv0[i];
    const centsRaw = csv0[i + 1];
    if (typeof minutes !== "number" || typeof centsRaw !== "number") continue;
    if (centsRaw === -1) continue; // Keepa sentinel for "no data"
    const msSinceEpoch = (minutes + 21564000) * 60_000; // Keepa epoch = 2011-01-01
    const date = new Date(msSinceEpoch).toISOString().slice(0, 10);
    byDate.set(date, Math.round(centsRaw) / 100);
  }
  for (const [date, price] of byDate) {
    out.push({ date, price });
  }
  // Reverse-chronological (newest first).
  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return out.length > 0 ? out : null;
}
