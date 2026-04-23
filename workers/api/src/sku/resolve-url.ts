// POST /resolve-url — link recognition.
// Takes any retailer URL, extracts { retailer, id (ASIN/steam/etc.), brand
// hints }, and tries to look it up in the spine. Returns matched sku_catalog
// rows + the parsed structure. Lets the chat + extension short-circuit from
// "user pasted an Amazon URL" to "here's our triangulated data on this SKU".
//
// Body: { url: string }
// Response:
//   { parsed: { retailer, id, brand, model? },
//     candidates: [ { id, name, brand, priceMedianCents, priceSources } ],
//     matched: boolean }

import type { Context } from "hono";

interface Env { LENS_D1?: D1Database }

interface ParsedUrl {
  retailer?: string;
  id?: string;
  brand?: string;
  model?: string;
  urlClean: string;
}

export async function handleResolveUrl(c: Context<{ Bindings: Env }>): Promise<Response> {
  const env = c.env;
  if (!env.LENS_D1) return c.json({ error: "bootstrapping" }, 503);

  let body: { url?: string };
  try { body = (await c.req.json()) as { url?: string }; } catch { return c.json({ error: "invalid_json" }, 400); }
  const raw = (body.url ?? "").trim();
  if (!raw) return c.json({ error: "missing_url" }, 400);

  const parsed = parseRetailerUrl(raw);
  if (!parsed.retailer) {
    return c.json({ parsed, candidates: [], matched: false, note: "unknown_retailer" });
  }

  // 1. Direct id match (e.g. wd:Q123, steam:123, fda510k:K123, visual:<hash>).
  const directId = toSkuId(parsed);
  const candidates: Array<Record<string, unknown>> = [];
  if (directId) {
    const row = await env.LENS_D1.prepare(
      `SELECT sc.id, sc.canonical_name, sc.brand_slug, sc.model_code, sc.image_url,
              tp.median_cents, tp.n_sources
         FROM sku_catalog sc LEFT JOIN triangulated_price tp ON tp.sku_id = sc.id
        WHERE sc.id = ? LIMIT 1`,
    ).bind(directId).first<Record<string, unknown>>();
    if (row) candidates.push(shape(row));
  }

  // 2. Asin secondary lookup.
  if (candidates.length === 0 && parsed.retailer === "amazon" && parsed.id) {
    const row = await env.LENS_D1.prepare(
      `SELECT sc.id, sc.canonical_name, sc.brand_slug, sc.model_code, sc.image_url,
              tp.median_cents, tp.n_sources
         FROM sku_catalog sc LEFT JOIN triangulated_price tp ON tp.sku_id = sc.id
        WHERE sc.asin = ? LIMIT 1`,
    ).bind(parsed.id).first<Record<string, unknown>>();
    if (row) candidates.push(shape(row));
  }

  // 3. Fuzzy by brand+model (FTS5) if we got them.
  if (candidates.length === 0 && (parsed.brand || parsed.model)) {
    const q = [parsed.brand, parsed.model].filter(Boolean).join(" ").trim();
    if (q) {
      try {
        const fts = q.split(/\s+/).map((t) => `"${t.replace(/"/g, '""')}"*`).join(" ");
        const { results } = await env.LENS_D1.prepare(
          `SELECT sc.id, sc.canonical_name, sc.brand_slug, sc.model_code, sc.image_url,
                  tp.median_cents, tp.n_sources
             FROM sku_fts JOIN sku_catalog sc ON sc.id = sku_fts.sku_id
             LEFT JOIN triangulated_price tp ON tp.sku_id = sc.id
            WHERE sku_fts MATCH ? AND sc.status = 'active'
            ORDER BY bm25(sku_fts) LIMIT 5`,
        ).bind(fts).all<Record<string, unknown>>();
        for (const r of results ?? []) candidates.push(shape(r));
      } catch { /* FTS not populated */ }
    }
  }

  return c.json({ parsed, candidates, matched: candidates.length > 0 });
}

function shape(r: Record<string, unknown>): Record<string, unknown> {
  return {
    id: r.id,
    name: r.canonical_name,
    brand: r.brand_slug,
    model: r.model_code,
    imageUrl: r.image_url,
    priceMedianCents: r.median_cents,
    priceSources: r.n_sources,
  };
}

function toSkuId(p: ParsedUrl): string | null {
  if (!p.retailer || !p.id) return null;
  if (p.retailer === "steam") return `steam:${p.id}`;
  if (p.retailer === "amazon") return null; // lookup by asin column
  return null;
}

export function parseRetailerUrl(raw: string): ParsedUrl {
  let url: URL;
  try { url = new URL(raw); } catch { return { urlClean: raw }; }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = url.pathname;
  const out: ParsedUrl = { urlClean: `${url.protocol}//${host}${path}` };

  // Strip known affiliate tags from the cleaned URL.
  url.searchParams.delete("tag");
  url.searchParams.delete("ref");
  for (const k of Array.from(url.searchParams.keys())) {
    if (/^utm_/i.test(k) || /^ref_?/i.test(k) || /^affid$/i.test(k)) url.searchParams.delete(k);
  }
  out.urlClean = url.toString();

  // --- Amazon: ASIN in path /dp/<ASIN>/ or /gp/product/<ASIN>/ ---
  if (/(^|\.)amazon\./.test(host)) {
    out.retailer = "amazon";
    const asin = path.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i)?.[1];
    if (asin) out.id = asin.toUpperCase();
    return out;
  }

  // --- Steam: /app/<appid>/<slug> ---
  if (/^store\.steampowered\.com$/.test(host) || /steamcommunity\.com$/.test(host)) {
    out.retailer = "steam";
    const appId = path.match(/\/app\/(\d+)/)?.[1];
    if (appId) out.id = appId;
    return out;
  }

  // --- Best Buy: /site/...-sku<digits>.p?skuId=<sku> ---
  if (/bestbuy\.com$/.test(host)) {
    out.retailer = "bestbuy";
    const sku = url.searchParams.get("skuId") || path.match(/\b(\d{7,9})\.p\b/)?.[1];
    if (sku) out.id = sku;
    return out;
  }

  // --- Walmart: /ip/<name>/<id> ---
  if (/walmart\.com$/.test(host)) {
    out.retailer = "walmart";
    const id = path.match(/\/ip\/[^/]+\/(\d+)/)?.[1];
    if (id) out.id = id;
    return out;
  }

  // --- Target: /p/<slug>/-/A-<id> ---
  if (/target\.com$/.test(host)) {
    out.retailer = "target";
    const id = path.match(/A-(\d+)/)?.[1];
    if (id) out.id = id;
    return out;
  }

  // --- Newegg: /p/<id> or /p/N82E... ---
  if (/newegg\.com$/.test(host)) {
    out.retailer = "newegg";
    const id = path.match(/\/p\/([A-Z0-9]+)/i)?.[1];
    if (id) out.id = id;
    return out;
  }

  // --- Home Depot, Lowe's, Costco: generic last-segment numeric ---
  if (/homedepot\.com$/.test(host)) out.retailer = "homedepot";
  else if (/lowes\.com$/.test(host)) out.retailer = "lowes";
  else if (/costco\.com$/.test(host)) out.retailer = "costco";
  if (out.retailer && !out.id) {
    const last = path.split("/").filter(Boolean).pop() ?? "";
    const id = last.match(/(\d{6,})/)?.[1];
    if (id) out.id = id;
  }

  // Generic: brand from 2nd-level host token (e.g. apple.com → apple).
  if (!out.retailer) {
    const parts = host.split(".");
    if (parts.length >= 2) out.retailer = parts[parts.length - 2]!;
  }
  return out;
}
