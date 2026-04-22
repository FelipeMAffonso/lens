// S3-W16 — affiliate-link + sponsored-content indicator detector.
// Two layers: URL-based (query params + path patterns) + HTML-based (rel,
// meta, FTC-disclosure phrasing).

import type { AffiliateIndicator, AffiliateKind } from "./types.js";

interface UrlRule {
  kind: AffiliateKind;
  test: (url: URL) => string | null;
}

const URL_RULES: UrlRule[] = [
  {
    kind: "amazon-tag",
    test: (u) => {
      if (!/(^|\.)amazon\./i.test(u.hostname)) return null;
      const tag = u.searchParams.get("tag");
      if (tag && /-20$/.test(tag)) return `Amazon Associates tag=${tag}`;
      if (tag) return `Amazon tag=${tag}`;
      const linkId = u.searchParams.get("linkId");
      if (linkId) return `Amazon linkId=${linkId}`;
      const ref = u.searchParams.get("ref_");
      if (ref) return `Amazon ref_=${ref}`;
      return null;
    },
  },
  {
    kind: "share-a-sale",
    test: (u) => {
      const s = u.href.toLowerCase();
      if (/shareasale\.com/.test(s)) return "shareasale.com link";
      if (s.includes("sscid=")) return "ShareASale sscid param";
      return null;
    },
  },
  {
    kind: "awin",
    test: (u) => {
      const s = u.href.toLowerCase();
      if (/awin1\.com\/cread\.php/.test(s)) return "awin1.com redirect";
      if (s.includes("awc=")) return "Awin awc param";
      return null;
    },
  },
  {
    kind: "rakuten",
    test: (u) => {
      const s = u.href.toLowerCase();
      if (/click\.linksynergy\.com/.test(s)) return "Rakuten Linksynergy";
      if (/rakuten\.com/.test(s) && s.includes("coupons")) return "rakuten.com coupons";
      return null;
    },
  },
  {
    kind: "skimlinks",
    test: (u) => {
      const s = u.href.toLowerCase();
      if (/go\.skimresources\.com/.test(s)) return "skimresources redirect";
      if (/skimlinks\.com/.test(s)) return "skimlinks.com link";
      return null;
    },
  },
  {
    kind: "impact-radius",
    test: (u) => {
      const s = u.href.toLowerCase();
      if (/impact\.com\/campaign-promo/.test(s)) return "impact.com campaign";
      if (/impact-affiliate/.test(s)) return "impact-affiliate path";
      return null;
    },
  },
  {
    kind: "utm-tracking",
    test: (u) => {
      const src = u.searchParams.get("utm_source");
      const med = u.searchParams.get("utm_medium");
      if (src && /(affiliate|partner)/i.test(src)) return `utm_source=${src}`;
      if (med && /(affiliate|partner|cps)/i.test(med)) return `utm_medium=${med}`;
      return null;
    },
  },
];

export function detectAffiliateFromUrl(rawUrl: string): AffiliateIndicator[] {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return [];
  }
  const out: AffiliateIndicator[] = [];
  for (const rule of URL_RULES) {
    const detail = rule.test(u);
    if (detail) out.push({ kind: rule.kind, detail });
  }
  return out;
}

const FTC_DISCLOSURE_PHRASES = [
  /we may earn (?:a )?commission/i,
  /as an Amazon Associate/i,
  /affiliate links? may appear/i,
  /this (?:post|page) contains affiliate links/i,
  /in partnership with/i,
];

export function detectAffiliateFromHtml(html: string): AffiliateIndicator[] {
  const out: AffiliateIndicator[] = [];
  if (!html) return out;

  // 1. rel="sponsored" anchors
  const sponsored = html.match(/<a\b[^>]*\brel=["'][^"']*sponsored[^"']*["'][^>]*>/gi);
  if (sponsored && sponsored.length > 0) {
    out.push({
      kind: "rel-sponsored",
      detail: `${sponsored.length} rel=sponsored anchor${sponsored.length === 1 ? "" : "s"}`,
    });
  }

  // 2. FTC disclosure phrases
  for (const re of FTC_DISCLOSURE_PHRASES) {
    const m = html.match(re);
    if (m) {
      out.push({ kind: "sponsored-disclosure", detail: m[0] });
      break; // one is enough
    }
  }

  // 3. Inline Amazon-tag links inside the HTML body, even when the outer URL
  // is clean (common pattern: Wirecutter's "Read more" links use tag=xx-20).
  const amazonTagInBody = html.match(/href=["']https?:\/\/(?:www\.)?amazon\.[a-z.]+\/[^"']*[?&]tag=([^&"'#]+)/i);
  if (amazonTagInBody?.[1]) {
    out.push({ kind: "amazon-tag", detail: `body-embedded Amazon tag=${amazonTagInBody[1]}` });
  }

  // 4. ShareASale / Awin / Skimlinks inside body
  if (/shareasale\.com\/r\.cfm/i.test(html)) {
    out.push({ kind: "share-a-sale", detail: "body-embedded shareasale.com redirect" });
  }
  if (/awin1\.com\/cread\.php/i.test(html)) {
    out.push({ kind: "awin", detail: "body-embedded awin1.com redirect" });
  }
  if (/go\.skimresources\.com/i.test(html)) {
    out.push({ kind: "skimlinks", detail: "body-embedded skimresources redirect" });
  }

  return out;
}

export function mergeIndicators(
  a: AffiliateIndicator[],
  b: AffiliateIndicator[],
): AffiliateIndicator[] {
  const seen = new Set<string>();
  const out: AffiliateIndicator[] = [];
  for (const i of [...a, ...b]) {
    const key = `${i.kind}::${i.detail.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(i);
  }
  return out;
}
