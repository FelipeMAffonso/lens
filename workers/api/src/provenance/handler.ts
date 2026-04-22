// S3-W16 — /provenance/verify handler.
// Fan-out fetch with concurrency cap; per-URL pipeline: affiliate(url) →
// fetch → affiliate(html) → verifyClaim → score.

import type { Context } from "hono";
import { detectAffiliateFromHtml, detectAffiliateFromUrl, mergeIndicators } from "./affiliate.js";
import { verifyClaim } from "./claim.js";
import { computeProvenanceScore } from "./score.js";
import { VerifyRequestSchema, type VerifyResponse, type VerifyResult } from "./types.js";

interface EnvBindings {
  [k: string]: unknown;
}

const FETCH_CONCURRENCY = 5;
const MAX_BODY_BYTES = 400_000;

/**
 * Limit concurrent calls to `worker(item)` to N, preserving input order.
 */
async function parallel<T, R>(
  items: T[],
  n: number,
  worker: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function spawn(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await worker(items[i]!, i);
    }
  }
  const workers: Array<Promise<void>> = [];
  for (let k = 0; k < Math.min(n, items.length); k++) workers.push(spawn());
  await Promise.all(workers);
  return out;
}

export async function handleVerify(c: Context<{ Bindings: EnvBindings }>): Promise<Response> {
  const body = await c.req.json().catch(() => null);
  const parsed = VerifyRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  const start = Date.now();

  const results = await parallel(parsed.data.citedUrls, FETCH_CONCURRENCY, async (entry) => {
    return verifyOne(entry.url, entry.claim);
  });

  const response: VerifyResponse = {
    results,
    elapsedMs: Date.now() - start,
  };
  return c.json(response);
}

export async function verifyOne(url: string, claim: string): Promise<VerifyResult> {
  const urlAffiliate = detectAffiliateFromUrl(url);
  let canonicalUrl = url;
  let host = "";
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase();
    canonicalUrl = `${u.protocol}//${host}${u.pathname}`;
  } catch {
    // keep canonicalUrl = url
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
    console.error("[provenance] fetch:", (err as Error).message);
  }

  const htmlAffiliate = fetched ? detectAffiliateFromHtml(html) : [];
  const affiliateIndicators = mergeIndicators(urlAffiliate, htmlAffiliate);

  const match = fetched ? verifyClaim(html, claim) : { via: "none" as const };
  const claimFound = match.via !== "none";

  const score = computeProvenanceScore({
    fetched,
    claimFoundVia: match.via,
    affiliateIndicators,
  });

  const result: VerifyResult = {
    url,
    canonicalUrl,
    host,
    fetched,
    claim,
    claimFound,
    claimFoundVia: match.via,
    affiliateIndicators,
    provenanceScore: score,
  };
  if (http !== undefined) result.http = http;
  if (match.snippet) result.claimSnippet = match.snippet;
  return result;
}
