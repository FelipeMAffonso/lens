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

  let body: { url?: string; fetchPage?: boolean; html?: string };
  try { body = (await c.req.json()) as { url?: string; fetchPage?: boolean; html?: string }; } catch { return c.json({ error: "invalid_json" }, 400); }
  const raw = (body.url ?? "").trim();
  if (!raw) return c.json({ error: "missing_url" }, 400);
  const wantFetch = body.fetchPage !== false; // default on

  const parsed = parseRetailerUrl(raw);
  // Unknown-retailer URLs still get the page-fetch pipeline (Jina fallback,
  // extractors). We just can't canonicalise or persist without a retailer id.
  if (!parsed.retailer) {
    const pageOnly = body.html
      ? extractFromHtml(body.html, raw)
      : await fetchAndExtract(raw, parsed).catch(() => null);
    return c.json({
      parsed,
      candidates: [],
      matched: false,
      note: "unknown_retailer",
      page: pageOnly,
    });
  }

  // Page-fetch path:
  // - If `html` was supplied (e.g. Chrome extension posted the DOM it
  //   already has, bypassing IP-based bot-blocks on amazon / walmart
  //   / target), parse it directly — no server fetch.
  // - Otherwise, if fetchPage != false, fetch from the server.
  // - Otherwise, skip.
  // Known-bot-blocker retailers (Amazon, Walmart, Target, Best Buy) are
  // routed straight to Jina — skipping the direct fetch that we know
  // returns a 5KB shell. Saves ~1s and removes ambiguity.
  const isBotBlocker =
    !!parsed.retailer &&
    ["amazon", "walmart", "target", "bestbuy"].includes(parsed.retailer);
  const pageP = body.html
    ? Promise.resolve(extractFromHtml(body.html, raw))
    : wantFetch
      ? (isBotBlocker
          ? fetchViaJina(raw).catch(() => null)
          : fetchAndExtract(raw, parsed).catch(() => null))
      : Promise.resolve(null);

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

  const page = await pageP;
  // If we scraped a page AND the spine didn't already match, persist
  // the live-fetched SKU so the next lookup succeeds instantly.
  if (page && candidates.length === 0 && parsed.retailer && parsed.id) {
    try { await persistLiveFetch(env, parsed, page); } catch { /* best-effort */ }
  }
  return c.json({ parsed, candidates, matched: candidates.length > 0, page });
}

interface PageImage { url: string; alt?: string }
interface PageExtract {
  title?: string;
  priceCents?: number;
  currency?: string;
  imageUrl?: string;        // hero / og:image (best-guess primary)
  images?: PageImage[];     // ALL product-gallery images with alt text
  rating?: number;
  reviewCount?: number;
  bullets?: string[];
  brand?: string;
  availability?: string;
  raw: { http: number; bytes: number; contentType?: string };
}

async function fetchAndExtract(url: string, _parsed: ParsedUrl): Promise<PageExtract | null> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
      },
      redirect: "follow",
    });
  } catch {
    return await fetchViaJina(url).catch(() => null);
  }
  const ct = res.headers.get("content-type") ?? "";
  const html = await res.text();
  // Amazon / Walmart / Target / BestBuy serve a bot-detection shell (small
  // page, no product data) to Cloudflare Worker IPs. Detect + fall through
  // to Jina Reader (https://r.jina.ai/<url>), a free LLM-oriented web-reader
  // service that bypasses IP-based bot blocks and returns clean markdown
  // including review summaries.
  const looksBlocked =
    res.ok && html.length < 8000 &&
    /amazon\.com|walmart\.com|target\.com|bestbuy\.com/i.test(url) &&
    !/productTitle|"@type":\s*"Product"/i.test(html);
  if (looksBlocked) {
    let jinaDebug: string | null = null;
    let viaJina: PageExtract | null = null;
    try {
      viaJina = await fetchViaJina(url);
    } catch (err) {
      jinaDebug = `jina-throw:${(err as Error).message}`;
    }
    if (!viaJina) jinaDebug = jinaDebug ?? "jina-returned-null";
    if (viaJina) return viaJina;
    return {
      raw: { http: res.status, bytes: html.length, contentType: ct, via: "direct-blocked" } as PageExtract["raw"] & { via?: string; jinaDebug?: string; },
      title: `(retailer bot-blocked; ${jinaDebug}; paste DOM as html or install extension)`,
    };
  }
  if (!res.ok || !html) return { raw: { http: res.status, bytes: html.length, contentType: ct } };
  return extractFromHtml(html, url, { http: res.status, contentType: ct });
}

// Free fallback for IP-blocked retailers. Jina Reader returns the page
// rendered as clean markdown with title + content + image links. No key.
async function fetchViaJina(url: string): Promise<PageExtract | null> {
  const jinaUrl = "https://r.jina.ai/" + url;
  const res = await fetch(jinaUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Accept: "text/markdown, text/plain, */*",
    },
  });
  if (!res.ok) throw new Error(`jina-http-${res.status}`);
  const md = await res.text();
  if (!md) throw new Error("jina-empty");

  // Parse the Jina Reader envelope. First few lines look like:
  //   Title: <full page title>
  //   URL Source: <url>
  //   Markdown Content:
  //   <body>
  const title = md.match(/^Title:\s*(.+)$/m)?.[1]?.trim();
  const bodyStart = md.indexOf("Markdown Content:");
  const body = bodyStart >= 0 ? md.slice(bodyStart + "Markdown Content:".length).trim() : md;

  // Images in markdown: ![alt](url)
  const images: PageImage[] = [];
  const seen = new Set<string>();
  const imgRe = /!\[([^\]]*?)\]\((https?:\/\/[^)\s]+)\)/g;
  let im: RegExpExecArray | null;
  while ((im = imgRe.exec(body)) !== null && images.length < 30) {
    const u = im[2]!;
    if (seen.has(u) || /\.(gif|svg)(?:$|[?#])/i.test(u)) continue;
    seen.add(u);
    images.push({ url: u.slice(0, 800), alt: im[1] ? im[1].slice(0, 240) : undefined });
  }

  // Price: prefer labelled lines ("Price: $…", "List: $…", "Now $…"),
  // otherwise pick the LARGEST $-amount over $5 in the first 10KB of the
  // body — skips $0-$5 junk like "save $4" / "$1 shipping" / "under $10".
  let priceCents: number | undefined;
  const labelled = body.match(/(?:price|sale|deal|now|was|list)[:\s]+\$([0-9]{1,4}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/i);
  if (labelled) {
    const n = parseFloat(labelled[1]!.replace(/,/g, ""));
    if (Number.isFinite(n) && n >= 5) priceCents = Math.round(n * 100);
  }
  if (priceCents == null) {
    const head = body.slice(0, 10_000);
    const prices: number[] = [];
    const priceRe = /\$([0-9]{1,4}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/g;
    let pm: RegExpExecArray | null;
    while ((pm = priceRe.exec(head)) !== null) {
      const n = parseFloat(pm[1]!.replace(/,/g, ""));
      if (Number.isFinite(n) && n >= 5 && n < 20000) prices.push(n);
    }
    if (prices.length > 0) {
      // Median of top-3 largest — robust to single "$1299" list-price +
      // "$10 off" coupons sitting above the actual sale price.
      const top = prices.sort((a, b) => b - a).slice(0, 3);
      const mid = top[Math.floor(top.length / 2)]!;
      priceCents = Math.round(mid * 100);
    }
  }

  // Rating: "4.5 out of 5 stars"
  const ratingMatch = body.match(/([0-5](?:\.\d)?)\s+out of 5 stars/i);
  const rating = ratingMatch ? parseFloat(ratingMatch[1]!) : undefined;

  // Review count: "12,345 ratings" or "(1,234)" near a rating
  const reviewMatch = body.match(/([\d,]+)\s+(?:global\s+)?ratings?/i)
    ?? body.match(/\(([\d,]+)\s+customer\s+reviews?\)/i);
  const reviewCount = reviewMatch
    ? parseInt(reviewMatch[1]!.replace(/,/g, ""), 10)
    : undefined;

  // Bullets: heuristically grab the first product bulleted list after title.
  // Limit to 10 items under ~400 chars.
  const bullets: string[] = [];
  const bulletRe = /^[\s]{0,4}[-*•]\s+(.{15,400})$/gm;
  let bm: RegExpExecArray | null;
  while ((bm = bulletRe.exec(body)) !== null && bullets.length < 10) {
    const t = bm[1]!.replace(/\[[^\]]*\]\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
    if (t) bullets.push(t);
  }

  return {
    raw: { http: 200, bytes: md.length, contentType: "text/markdown", via: "jina" } as PageExtract["raw"] & { via?: string },
    title: title ?? body.split(/\n/).map((s) => s.trim()).filter(Boolean)[0],
    priceCents,
    currency: "USD",
    imageUrl: images[0]?.url,
    images: images.length > 0 ? images : undefined,
    rating,
    reviewCount,
    bullets: bullets.length > 0 ? bullets : undefined,
  };
}

function extractFromHtml(html: string, url: string, raw?: { http?: number; contentType?: string }): PageExtract {
  const parsedForBrand = parseRetailerUrl(url);
  return {
    raw: { http: raw?.http ?? 200, bytes: html.length, contentType: raw?.contentType ?? "text/html" },
    title: extractTitle(html),
    brand: extractBrand(html, parsedForBrand),
    priceCents: extractPriceCents(html),
    currency: "USD",
    imageUrl: extractImageUrl(html),
    images: extractImages(html, url),
    rating: extractRating(html),
    reviewCount: extractReviewCount(html),
    bullets: extractBullets(html),
    availability: extractAvailability(html),
  };
}

function extractImages(html: string, baseUrl: string): PageImage[] | undefined {
  const out: PageImage[] = [];
  const seen = new Set<string>();

  const pushOne = (u: string, alt?: string): void => {
    if (!u) return;
    // Skip data:, tracking pixels, tiny sprites.
    if (u.startsWith("data:") || u.length < 12) return;
    if (/\.(?:gif|svg)(?:$|[?#])/i.test(u)) return;
    const abs = toAbsolute(u, baseUrl);
    if (!abs || seen.has(abs)) return;
    seen.add(abs);
    out.push({ url: abs.slice(0, 800), alt: alt ? alt.slice(0, 240) : undefined });
  };

  // JSON-LD product image(s).
  const ld = jsonLdFind(html, ["Product"]);
  if (ld) {
    const img = ld.image;
    if (typeof img === "string") pushOne(img);
    else if (Array.isArray(img)) for (const u of img) if (typeof u === "string") pushOne(u);
  }

  // og:image.
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1];
  if (og) pushOne(og);

  // Amazon / generic <img> with src + alt.
  const imgRe = /<img\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) !== null && out.length < 40) {
    const tag = m[0]!;
    const src = tag.match(/\ssrc=["']([^"']+)["']/i)?.[1]
      ?? tag.match(/\sdata-src=["']([^"']+)["']/i)?.[1]
      ?? tag.match(/\sdata-a-hires=["']([^"']+)["']/i)?.[1];
    const alt = tag.match(/\salt=["']([^"']*)["']/i)?.[1];
    if (src) pushOne(decodeEntities(src), alt ? decodeEntities(alt) : undefined);
  }

  return out.length > 0 ? out.slice(0, 40) : undefined;
}

function toAbsolute(u: string, base: string): string | null {
  try {
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith("//")) return "https:" + u;
    const b = new URL(base);
    if (u.startsWith("/")) return `${b.protocol}//${b.host}${u}`;
    return new URL(u, base).toString();
  } catch { return null; }
}

function extractTitle(html: string): string | undefined {
  // JSON-LD first (most retailers).
  const ld = jsonLdFind(html, ["Product"]);
  if (ld?.name) return String(ld.name).slice(0, 240);
  // Amazon-specific productTitle.
  const am = html.match(/<span[^>]*id=["']productTitle["'][^>]*>([\s\S]*?)<\/span>/i)?.[1];
  if (am) return decodeEntities(stripTags(am)).trim().slice(0, 240);
  // OG title.
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1];
  if (og) return decodeEntities(og).trim().slice(0, 240);
  // <title> fallback.
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return t ? decodeEntities(stripTags(t)).trim().slice(0, 240) : undefined;
}

function extractBrand(html: string, parsed: ParsedUrl): string | undefined {
  const ld = jsonLdFind(html, ["Product"]);
  if (ld?.brand) {
    const b = ld.brand as { name?: string } | string;
    return typeof b === "string" ? b : b?.name;
  }
  const meta = html.match(/<meta[^>]+property=["']og:brand["'][^>]+content=["']([^"']+)["']/i)?.[1];
  if (meta) return decodeEntities(meta).trim();
  // Amazon "Visit the X Store" byline
  const am = html.match(/<a[^>]+id=["']bylineInfo["'][^>]*>([^<]+)<\/a>/i)?.[1];
  if (am) return decodeEntities(am).replace(/Visit the |Brand:\s*|Store$/gi, "").trim();
  return parsed.brand;
}

function extractPriceCents(html: string): number | undefined {
  const ld = jsonLdFind(html, ["Product", "Offer"]);
  const offers = ld?.offers;
  const priceFromOffer = (o: unknown): number | undefined => {
    if (!o || typeof o !== "object") return undefined;
    const p = (o as { price?: string | number }).price;
    if (p == null) return undefined;
    const n = parseFloat(String(p));
    return Number.isFinite(n) ? Math.round(n * 100) : undefined;
  };
  if (Array.isArray(offers)) {
    for (const o of offers) { const cents = priceFromOffer(o); if (cents != null) return cents; }
  } else {
    const cents = priceFromOffer(offers);
    if (cents != null) return cents;
  }
  // Amazon classic: .a-price-whole + .a-price-fraction
  const amWhole = html.match(/<span class="a-price-whole">([0-9,]+)<\/span>\s*<span class="a-price-fraction">(\d{2})</i);
  if (amWhole) {
    const whole = parseInt(amWhole[1]!.replace(/,/g, ""), 10);
    const frac = parseInt(amWhole[2]!, 10);
    if (Number.isFinite(whole)) return whole * 100 + (Number.isFinite(frac) ? frac : 0);
  }
  // Generic $12.34 near the top of the body
  const near = html.match(/\$([0-9]{1,4}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/);
  if (near) {
    const n = parseFloat(near[1]!.replace(/,/g, ""));
    if (Number.isFinite(n)) return Math.round(n * 100);
  }
  return undefined;
}

function extractImageUrl(html: string): string | undefined {
  const ld = jsonLdFind(html, ["Product"]);
  const img = ld?.image;
  if (typeof img === "string") return img;
  if (Array.isArray(img) && typeof img[0] === "string") return img[0];
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1];
  return og || undefined;
}

function extractRating(html: string): number | undefined {
  const ld = jsonLdFind(html, ["Product", "AggregateRating"]);
  const ar = (ld?.aggregateRating as { ratingValue?: string | number }) ?? null;
  if (ar?.ratingValue != null) {
    const n = parseFloat(String(ar.ratingValue));
    if (Number.isFinite(n)) return n;
  }
  // Amazon: "out of 5 stars"
  const am = html.match(/([0-5](?:\.\d)?)\s+out of 5 stars/i)?.[1];
  if (am) {
    const n = parseFloat(am);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function extractReviewCount(html: string): number | undefined {
  const ld = jsonLdFind(html, ["Product", "AggregateRating"]);
  const ar = (ld?.aggregateRating as { reviewCount?: string | number; ratingCount?: string | number }) ?? null;
  const rc = ar?.reviewCount ?? ar?.ratingCount;
  if (rc != null) {
    const n = parseInt(String(rc).replace(/[^0-9]/g, ""), 10);
    if (Number.isFinite(n)) return n;
  }
  const am = html.match(/([\d,]+)\s+(?:global\s+)?ratings?/i)?.[1];
  if (am) {
    const n = parseInt(am.replace(/,/g, ""), 10);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function extractBullets(html: string): string[] | undefined {
  // Amazon feature bullets
  const block = html.match(/<div[^>]*id=["']feature-bullets["'][\s\S]*?<\/div>/i)?.[0];
  if (block) {
    const out: string[] = [];
    const re = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block)) !== null && out.length < 10) {
      const t = decodeEntities(stripTags(m[1]!)).replace(/\s+/g, " ").trim();
      if (t && t.length > 10) out.push(t.slice(0, 400));
    }
    if (out.length > 0) return out;
  }
  return undefined;
}

function extractAvailability(html: string): string | undefined {
  const ld = jsonLdFind(html, ["Product", "Offer"]);
  const offers = ld?.offers;
  const readAvail = (o: unknown): string | undefined => {
    if (!o || typeof o !== "object") return undefined;
    const a = (o as { availability?: string }).availability;
    return a ? String(a).replace("https://schema.org/", "") : undefined;
  };
  if (Array.isArray(offers)) { for (const o of offers) { const a = readAvail(o); if (a) return a; } }
  else { const a = readAvail(offers); if (a) return a; }
  const am = html.match(/<div[^>]*id=["']availability["'][\s\S]*?<span[^>]*>([^<]+)<\/span>/i)?.[1];
  return am ? decodeEntities(am).trim() : undefined;
}

function jsonLdFind(html: string, wanted: string[]): Record<string, unknown> | null {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    let parsed: unknown;
    try { parsed = JSON.parse(m[1]!); } catch { continue; }
    const visit = (x: unknown): Record<string, unknown> | null => {
      if (!x) return null;
      if (Array.isArray(x)) {
        for (const y of x) { const h = visit(y); if (h) return h; }
        return null;
      }
      if (typeof x !== "object") return null;
      const obj = x as Record<string, unknown>;
      const t = obj["@type"];
      if (typeof t === "string" && wanted.includes(t)) return obj;
      if (Array.isArray(t) && t.some((tt: unknown) => wanted.includes(String(tt)))) return obj;
      // Walk @graph
      if (Array.isArray(obj["@graph"])) {
        for (const g of obj["@graph"] as unknown[]) { const h = visit(g); if (h) return h; }
      }
      return null;
    };
    const hit = visit(parsed);
    if (hit) return hit;
  }
  return null;
}

function stripTags(s: string): string { return s.replace(/<[^>]+>/g, ""); }
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

async function persistLiveFetch(env: Env, parsed: ParsedUrl, page: PageExtract): Promise<void> {
  if (!page.title || !parsed.retailer || !parsed.id || !env.LENS_D1) return;
  const skuId = `${parsed.retailer}:${parsed.id}`;
  const brandSlug = (page.brand ?? parsed.brand ?? parsed.retailer).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
  const specs = {
    retailer: parsed.retailer,
    retailerId: parsed.id,
    rating: page.rating,
    reviewCount: page.reviewCount,
    bullets: page.bullets,
    availability: page.availability,
  };
  const observed = new Date().toISOString().slice(0, 19);

  await env.LENS_D1.prepare(
    `INSERT OR IGNORE INTO brand_index (slug, name) VALUES (?, ?)`,
  ).bind(brandSlug, page.brand ?? parsed.retailer).run();

  await env.LENS_D1.prepare(
    `INSERT INTO sku_catalog (id, canonical_name, brand_slug, image_url, specs_json, first_seen_at, last_refreshed_at, asin)
     VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)
     ON CONFLICT(id) DO UPDATE SET
       canonical_name = excluded.canonical_name,
       image_url = COALESCE(excluded.image_url, sku_catalog.image_url),
       specs_json = excluded.specs_json,
       asin = COALESCE(excluded.asin, sku_catalog.asin),
       last_refreshed_at = datetime('now')`,
  ).bind(
    skuId,
    page.title.slice(0, 200),
    brandSlug,
    page.imageUrl ?? null,
    JSON.stringify(specs).slice(0, 8_000),
    parsed.retailer === "amazon" ? parsed.id : null,
  ).run();

  await env.LENS_D1.prepare(
    `INSERT INTO sku_source_link (sku_id, source_id, external_id, external_url, specs_json, price_cents, currency, observed_at, confidence, active)
     VALUES (?, ?, ?, ?, ?, ?, 'USD', ?, 0.9, 1)
     ON CONFLICT(sku_id, source_id, external_id) DO UPDATE SET
       external_url = excluded.external_url,
       price_cents = excluded.price_cents,
       specs_json = excluded.specs_json,
       observed_at = excluded.observed_at,
       active = 1`,
  ).bind(
    skuId, `resolve-url-live:${parsed.retailer}`, parsed.id, parsed.urlClean,
    JSON.stringify(specs).slice(0, 4_000),
    page.priceCents ?? null, observed,
  ).run();

  if (page.priceCents != null) {
    await env.LENS_D1.prepare(
      `INSERT OR IGNORE INTO price_history (sku_id, source_id, observed_at, price_cents, currency, on_sale, sale_pct)
       VALUES (?, ?, ?, ?, 'USD', 0, NULL)`,
    ).bind(skuId, `resolve-url-live:${parsed.retailer}`, observed, page.priceCents).run();
  }
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
