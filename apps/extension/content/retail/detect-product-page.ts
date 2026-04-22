// V-EXT-INLINE-g — detect retailer product pages + extract price.

export type RetailHost =
  | "amazon"
  | "bestbuy"
  | "walmart"
  | "target"
  | "homedepot"
  | "costco";

export interface ProductPageMeta {
  host: RetailHost;
  url: string;
  productId: string | null;
  currentPrice: number | null;
  currency: string;
}

export function detectHost(url: URL = new URL(window.location.href)): RetailHost | null {
  const h = url.hostname.toLowerCase();
  if (h.endsWith("amazon.com") || h === "amazon.com") return "amazon";
  if (h.endsWith("bestbuy.com")) return "bestbuy";
  if (h.endsWith("walmart.com")) return "walmart";
  if (h.endsWith("target.com")) return "target";
  if (h.endsWith("homedepot.com")) return "homedepot";
  if (h.endsWith("costco.com")) return "costco";
  return null;
}

/**
 * True when the URL path indicates a product detail page. Each retailer has
 * its own pattern — keep them conservative to avoid running on search results.
 */
export function isProductPage(url: URL = new URL(window.location.href)): boolean {
  const host = detectHost(url);
  if (!host) return false;
  const p = url.pathname;
  switch (host) {
    case "amazon":
      return /\/(dp|gp\/product)\/[A-Z0-9]{10}\b/i.test(p);
    case "bestbuy":
      return /\/site\/.+\.p\?/i.test(p + url.search) || /\/site\/.+\/\d+\.p\b/i.test(p);
    case "walmart":
      return /^\/ip\/.+\/\d+/.test(p);
    case "target":
      return /^\/p\/.+\/A-\d+/.test(p);
    case "homedepot":
      return /\/p\/.+\/\d{9,}/.test(p);
    case "costco":
      return /\/product\..*\.html/i.test(p) || /\.product\..*\.html/i.test(p);
    default:
      return false;
  }
}

export function extractProductId(host: RetailHost, url: URL = new URL(window.location.href)): string | null {
  if (host === "amazon") {
    const m = url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})\b/i);
    return m?.[1]?.toUpperCase() ?? null;
  }
  if (host === "bestbuy") {
    const m = url.pathname.match(/\/(\d{7,})\.p\b/);
    return m?.[1] ?? null;
  }
  if (host === "walmart") {
    const m = url.pathname.match(/\/ip\/[^/]+\/(\d+)\b/);
    return m?.[1] ?? null;
  }
  if (host === "target") {
    const m = url.pathname.match(/\/A-(\d+)\b/);
    return m?.[1] ?? null;
  }
  if (host === "homedepot") {
    const m = url.pathname.match(/\/p\/[^/]+\/(\d{9,})/);
    return m?.[1] ?? null;
  }
  return null;
}

/**
 * Parse a displayed price string into a number. Handles "$1,299.99", "$19.99",
 * "$1,299", and ranges "$19.99 - $29.99" (returns the low end).
 */
export function parsePriceString(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, "").trim();
  const m = cleaned.match(/\$?(\d+(?:\.\d+)?)/);
  if (!m || !m[1]) return null;
  const n = Number.parseFloat(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function extractPrice(host: RetailHost, root: Document | Element = document): number | null {
  const find = (sel: string): HTMLElement | null => root.querySelector<HTMLElement>(sel);
  let raw: string | null = null;
  switch (host) {
    case "amazon": {
      // Modern: <span class="a-price"><span class="a-offscreen">$123.45</span>...</span>
      raw =
        find("#corePriceDisplay_desktop_feature_div .a-offscreen")?.innerText ??
        find("#apex_desktop .a-offscreen")?.innerText ??
        find(".a-price .a-offscreen")?.innerText ??
        find("#priceblock_ourprice")?.innerText ??
        find("#priceblock_saleprice")?.innerText ??
        null;
      if (!raw) {
        const whole = find(".a-price-whole")?.innerText;
        const frac = find(".a-price-fraction")?.innerText;
        if (whole) raw = `$${whole}.${frac ?? "00"}`;
      }
      break;
    }
    case "bestbuy":
      raw =
        find('.priceView-hero-price .priceView-customer-price span[aria-hidden="true"]')?.innerText ??
        find(".priceView-customer-price > span")?.innerText ??
        null;
      break;
    case "walmart":
      raw =
        find('[data-automation-id="product-price"]')?.innerText ??
        find('[itemprop="price"]')?.getAttribute("content") ??
        null;
      break;
    case "target":
      raw =
        find('[data-test="product-price"]')?.innerText ??
        find('[data-test="current-price"]')?.innerText ??
        null;
      break;
    case "homedepot":
      raw =
        find('[data-testid="mainPrice"]')?.innerText ??
        find(".price-format__main-price")?.innerText ??
        null;
      break;
    case "costco":
      raw =
        find('[data-testid="pricing"]')?.innerText ??
        find("#pull-right-price")?.innerText ??
        null;
      break;
  }
  return parsePriceString(raw);
}

export function detectProductPage(): ProductPageMeta | null {
  const url = new URL(window.location.href);
  if (!isProductPage(url)) return null;
  const host = detectHost(url)!;
  const productId = extractProductId(host, url);
  const currentPrice = extractPrice(host, document);
  return {
    host,
    url: url.origin + url.pathname,
    productId,
    currentPrice,
    currency: "USD",
  };
}
