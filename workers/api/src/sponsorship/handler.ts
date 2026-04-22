// S3-W19 — POST /sponsorship/scan handler.
// Fetch URL → htmlToText → reuse S3-W16 affiliate detection + S3-W19
// disclosure detector → verdict rollup.

import type { Context } from "hono";
import { detectAffiliateFromHtml, detectAffiliateFromUrl, mergeIndicators } from "../provenance/affiliate.js";
import { htmlToText } from "../provenance/claim.js";
import { assessSponsorship } from "./assess.js";
import { detectDisclosures } from "./disclosure.js";
import { SponsorshipRequestSchema, type SponsorshipResponse } from "./types.js";

const MAX_BODY_BYTES = 400_000;

export async function handleSponsorshipScan(
  c: Context<{ Bindings: Record<string, unknown> }>,
): Promise<Response> {
  const body = await c.req.json().catch(() => null);
  const parsed = SponsorshipRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  const { url, articleContext } = parsed.data;

  let canonicalUrl = url;
  let host = "";
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase();
    canonicalUrl = `${u.protocol}//${host}${u.pathname}`;
  } catch {
    // keep defaults
  }

  let fetched = false;
  let http: number | undefined;
  let html = "";
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 Lens/1.0" },
    });
    http = res.status;
    if (res.ok) {
      fetched = true;
      const buf = await res.arrayBuffer();
      const bytes = buf.byteLength > MAX_BODY_BYTES ? buf.slice(0, MAX_BODY_BYTES) : buf;
      html = new TextDecoder("utf-8").decode(bytes);
    }
  } catch (err) {
    console.error("[sponsorship] fetch:", (err as Error).message);
  }

  // Combine caller-supplied articleContext with fetched text for disclosure
  // scanning. When fetch fails but articleContext is supplied, source:"context-only".
  const textForDisclosures = fetched ? htmlToText(html) : articleContext ?? "";

  const urlAffiliate = detectAffiliateFromUrl(url);
  const htmlAffiliate = fetched ? detectAffiliateFromHtml(html) : [];
  const affiliateIndicators = mergeIndicators(urlAffiliate, htmlAffiliate);
  const disclosures = detectDisclosures(textForDisclosures);

  const { verdict, rationale } = assessSponsorship({ affiliateIndicators, disclosures });

  const response: SponsorshipResponse = {
    url,
    canonicalUrl,
    host,
    fetched,
    affiliateIndicators,
    disclosures,
    verdict,
    rationale,
    source: fetched ? "fetched" : "context-only",
    generatedAt: new Date().toISOString(),
  };
  if (http !== undefined) response.http = http;
  return c.json(response);
}
