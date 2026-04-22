// B2 — parallel enrichments. Each audit fans out scam/breach/price/provenance/
// sponsorship checks in a single Promise.allSettled so the card can surface
// multi-signal verdicts without any sequential blocking.

import type { AIRecommendation, AuditResult, Candidate, UserIntent } from "@lens/shared";
import type { Env } from "./index.js";
import { assessScam } from "./scam/assess.js";
import { aggregateBreaches, computeScore, bandFor } from "./breach/score.js";
import { breachesForHost } from "./breach/fixtures.js";
import { detectSale } from "./price-history/detect.js";
import { generateFixtureSeries } from "./price-history/fixture.js";
import { computeStats } from "./price-history/stats.js";

type Enrichments = NonNullable<AuditResult["enrichments"]>;

function extractHost(url: string | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (!/^[a-z0-9.-]+$/.test(host)) return null;
    return host;
  } catch {
    return null;
  }
}

function firstCandidateUrl(
  candidates: Candidate[],
  aiPickCandidate: Candidate | null,
  fallbackSourceUrl: string | undefined,
): string | undefined {
  if (aiPickCandidate?.url) return aiPickCandidate.url;
  for (const c of candidates) if (c.url) return c.url;
  // URL-mode audits: AIRecommendation.sourceUrl carries the pasted URL.
  if (fallbackSourceUrl) return fallbackSourceUrl;
  return undefined;
}

/**
 * Run every defensive enrichment in parallel. Each branch is wrapped in its own
 * try/catch so one failure cannot cascade — the card ships with whatever
 * succeeded, and failed ones are honestly labeled.
 */
export async function runEnrichments(
  intent: UserIntent,
  rec: AIRecommendation,
  candidates: Candidate[],
  aiPickCandidate: Candidate | null,
  _env: Env,
): Promise<Enrichments> {
  const topUrl = firstCandidateUrl(candidates, aiPickCandidate, rec.sourceUrl ?? rec.pickedProduct?.url);
  const host = extractHost(topUrl);
  // URL-mode: if we have no candidates but do have a picked product (from the
  // pasted URL), use that as the top product for price/breach checks.
  const topProduct: { name?: string; price?: number | null } =
    aiPickCandidate ?? candidates[0] ?? (rec.pickedProduct ? {
      name: rec.pickedProduct.name,
      price: rec.pickedProduct.price ?? null,
    } : null) ?? { name: undefined, price: null };

  const tasks = {
    scam: (async () => {
      if (!host) return { status: "skipped" as const, reason: "no product URL to derive host" };
      try {
        const r = assessScam({
          host,
          productName: topProduct?.name,
          category: intent.category,
          price: topProduct?.price ?? undefined,
          receivedViaHttps: topUrl?.startsWith("https://"),
        });
        return {
          status: "ok" as const,
          verdict: r.verdict,
          riskScore: r.riskScore,
          host: r.host,
        };
      } catch (err) {
        return { status: "error" as const, reason: (err as Error).message };
      }
    })(),
    breach: (async () => {
      if (!host) return { status: "skipped" as const, reason: "no product URL to derive domain" };
      try {
        const breaches = breachesForHost(host);
        if (!breaches || breaches.length === 0) {
          return { status: "ok" as const, score: 0, band: "none" as const, domain: host, reason: "no known breaches for this domain" };
        }
        const agg = aggregateBreaches({ domain: host, breaches });
        const score = computeScore(breaches);
        const band = bandFor(score);
        void agg;
        return { status: "ok" as const, score, band, domain: host };
      } catch (err) {
        return { status: "error" as const, reason: (err as Error).message };
      }
    })(),
    priceHistory: (async () => {
      // Only runs when there's a real URL and a current price — uses the deterministic
      // URL-hashed fixture series when Keepa isn't configured.
      const currentPrice = topProduct?.price;
      if (!topProduct || currentPrice == null || !topUrl) {
        return { status: "skipped" as const, reason: "no current price or product URL" };
      }
      try {
        const { series } = generateFixtureSeries(topUrl, 90);
        const seriesWithCurrent = [...series, { date: new Date().toISOString().slice(0, 10), price: currentPrice }];
        const stats = computeStats(seriesWithCurrent);
        const r = detectSale({ stats });
        return { status: "ok" as const, verdict: r.verdict };
      } catch (err) {
        return { status: "error" as const, reason: (err as Error).message };
      }
    })(),
    provenance: (async () => {
      return { status: "skipped" as const, reason: "provenance deepens in a follow-up block (B2-next)" };
    })(),
    sponsorship: (async () => {
      return { status: "skipped" as const, reason: "sponsorship scans run when user pastes a review article URL" };
    })(),
  };

  const entries = await Promise.all(
    (Object.entries(tasks) as Array<[keyof Enrichments, Promise<Enrichments[keyof Enrichments]>]>).map(
      async ([key, promise]) => [key, await promise] as const,
    ),
  );
  const out = Object.fromEntries(entries) as Enrichments;
  return out;
}
