// VISION_COMPLETE §13 #8 enforcement — strip tracking + affiliate params from
// every retailer URL Lens surfaces. No commission, no ad revenue, no partner
// relationship can bias Lens's answer, and no URL Lens returns leaks value to
// any affiliate. If we cannot strip cleanly, we omit the URL rather than ship
// it tagged.
//
// Applied to: every `Candidate.url`, `Candidate.thumbnailUrl` (defensive),
// every product URL in enrichments, every URL in provenance output, every
// URL in cross-model picks, every URL in gift-audit output.
//
// Never applied to: documentation links, regulatory citations, or URLs that
// point to Lens's own domain.

const TRACKING_PARAMS = new Set([
  // Amazon
  "tag", "ref", "ref_", "linkcode", "linkid", "camp", "creative", "creativeasin",
  "ascsubtag", "asc_campaign", "asc_refurl", "asc_source", "pd_rd_i", "pd_rd_r",
  "pd_rd_w", "pd_rd_wg", "pf_rd_i", "pf_rd_m", "pf_rd_p", "pf_rd_r", "pf_rd_s",
  "pf_rd_t", "psc", "th", "smid", "_encoding", "s", "sr", "keywords", "qid",
  "sprefix", "crid", "sxin_0_pb", "content-id",
  // Generic UTM
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "utm_id", "utm_name", "utm_ad", "utm_cid",
  // ShareASale
  "afftrack", "urllink", "merchantid", "sscid", "affid", "sharesid",
  // Impact Radius / Rakuten
  "irclickid", "irgwc", "ranmid", "rancid", "ransiteid", "ranEAID", "ranSiteID",
  "ranLinkID",
  // Google / generic
  "gclid", "gclsrc", "dclid", "gad_source", "gbraid", "wbraid", "_ga",
  "msclkid", "mc_eid", "mc_cid",
  // Facebook
  "fbclid", "fb_source", "fb_ref",
  // Click tracking / misc
  "clickid", "cjevent", "cjdata", "impactid", "partner", "partnerid",
  "affiliate", "affiliateid", "referrer", "referral", "source", "src",
  "cjsku", "aff_sub", "aff_sub2", "aff_sub3", "click_id", "sub_id",
  // Twitter
  "twclid", "tsid",
  // Pinterest
  "epik",
  // Microsoft / Bing ads
  "mkevt", "mkcid", "mkrid",
  // HubSpot
  "_hsenc", "_hsmi",
]);

/**
 * Strip tracking + affiliate params from a URL. Returns the cleaned URL or
 * null if the URL cannot be parsed. Also drops fragments (# anchors) since
 * most affiliate trackers hide there too.
 *
 * Safe to call on null / undefined — returns null.
 */
export function scrubTrackingParams(rawUrl: string | null | undefined): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (trimmed.length === 0) return null;

  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    // Not a parseable URL — omit rather than propagate garbage downstream.
    return null;
  }

  // Only http/https. No mailto, data:, javascript:, etc.
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;

  // Drop every tracking param.
  const keep = new URLSearchParams();
  for (const [k, v] of u.searchParams.entries()) {
    if (!TRACKING_PARAMS.has(k.toLowerCase())) keep.append(k, v);
  }
  u.search = keep.toString();

  // Drop fragment — affiliate systems often hide IDs in #tag= and similar.
  u.hash = "";

  // Normalize trailing slash: don't add or remove, preserve as-is.
  return u.toString();
}

/**
 * Scrub a Candidate's url + thumbnailUrl. Mutates the returned copy only;
 * passes through untouched for other fields.
 */
export function scrubCandidateUrls<T extends object>(c: T): T {
  const out = { ...c } as T & { url?: string | undefined; thumbnailUrl?: string | undefined };
  if (out.url !== undefined) {
    const cleaned = scrubTrackingParams(out.url);
    if (cleaned) out.url = cleaned;
    else delete out.url;
  }
  if (out.thumbnailUrl !== undefined) {
    const cleaned = scrubTrackingParams(out.thumbnailUrl);
    if (cleaned) out.thumbnailUrl = cleaned;
    else delete out.thumbnailUrl;
  }
  return out as T;
}
