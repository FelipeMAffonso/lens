// F16 — ticker aggregator. Reads completed audit runs from workflow_runs,
// groups by (category, host, geo), enforces k-anonymity (k ≥ 5 unique
// anonUserIds), produces ticker_events rows.

import { logger } from "../obs/log.js";
import { ulid } from "../workflow/ulid.js";

export interface AuditRunRow {
  id: string;
  workflow_id: string;
  status: string;
  anon_user_id: string | null;
  user_id: string | null;
  input_json: string;
  output_json: string | null;
  started_at: string;
}

export interface TickerBucket {
  id: string;
  bucket_key: string;
  category: string;
  host: string;
  geo: string;
  k: number;                  // unique (user or anon) participants
  sample_size: number;
  agreement_rate: number;
  avg_utility_gap: number;
  avg_price_gap: number | null;
  computed_at: string;
}

export interface AggregateSummary {
  published: TickerBucket[];
  suppressed: number; // count of buckets that didn't meet k ≥ kMin
  kMin: number;
}

export const K_ANON_MIN = 5;

interface BucketAcc {
  category: string;
  host: string;
  geo: string;
  participants: Set<string>;
  samples: number;
  agreements: number;
  utilityGaps: number[];
  priceGaps: number[];
}

function bucketKeyOf(category: string, host: string, geo: string): string {
  return `category:${category}|host:${host}|geo:${geo}`;
}

function classifyGeo(row: AuditRunRow): string {
  // Placeholder — we don't yet log geo on audit rows. Default to "unknown" until
  // F2 persistence layer adds geo via CF-IPCountry.
  return "unknown";
}

interface ParsedRun {
  category: string;
  host: string;
  geo: string;
  participant: string;
  agreement: boolean;      // lens top pick matches AI pick
  utilityGap: number;      // lens.utilityScore - ai.utilityScore
  priceGap: number | null; // ai.price - lens.price (positive → AI pricier)
}

function parseRun(row: AuditRunRow): ParsedRun | null {
  if (row.status !== "completed" || !row.output_json) return null;
  try {
    const out = JSON.parse(row.output_json) as {
      intent?: { category?: string };
      aiRecommendation?: { host?: string; pickedProduct?: { name?: string; price?: number | null } };
      specOptimal?: { name?: string; price?: number | null; utilityScore?: number };
      aiPickCandidate?: { utilityScore?: number } | null;
    };
    const category = (out.intent?.category ?? "unknown").toLowerCase();
    const host = (out.aiRecommendation?.host ?? "unknown").toLowerCase();
    if (host === "unknown" && !out.aiRecommendation?.pickedProduct?.name) return null;
    const lensName = out.specOptimal?.name?.toLowerCase() ?? "";
    const aiName = out.aiRecommendation?.pickedProduct?.name?.toLowerCase() ?? "";
    if (!lensName || !aiName || aiName.includes("(no ai")) return null;
    const agreement =
      lensName.includes(aiName) || aiName.includes(lensName) || lensName === aiName;
    const lensU = out.specOptimal?.utilityScore ?? 0;
    const aiU = out.aiPickCandidate?.utilityScore ?? 0;
    const utilityGap = lensU - aiU;
    const lensP = out.specOptimal?.price ?? null;
    const aiP = out.aiRecommendation?.pickedProduct?.price ?? null;
    const priceGap = lensP !== null && aiP !== null ? aiP - lensP : null;
    const participant = row.user_id ?? row.anon_user_id ?? row.id;
    return { category, host, geo: classifyGeo(row), participant, agreement, utilityGap, priceGap };
  } catch {
    return null;
  }
}

export function aggregate(rows: AuditRunRow[], kMin = K_ANON_MIN): AggregateSummary {
  const buckets = new Map<string, BucketAcc>();
  const now = new Date().toISOString();
  for (const row of rows) {
    const parsed = parseRun(row);
    if (!parsed) continue;
    const key = bucketKeyOf(parsed.category, parsed.host, parsed.geo);
    let b = buckets.get(key);
    if (!b) {
      b = {
        category: parsed.category,
        host: parsed.host,
        geo: parsed.geo,
        participants: new Set(),
        samples: 0,
        agreements: 0,
        utilityGaps: [],
        priceGaps: [],
      };
      buckets.set(key, b);
    }
    b.participants.add(parsed.participant);
    b.samples += 1;
    if (parsed.agreement) b.agreements += 1;
    b.utilityGaps.push(parsed.utilityGap);
    if (parsed.priceGap !== null) b.priceGaps.push(parsed.priceGap);
  }

  const published: TickerBucket[] = [];
  let suppressed = 0;
  for (const [key, b] of buckets) {
    const k = b.participants.size;
    if (k < kMin) {
      suppressed += 1;
      continue;
    }
    published.push({
      id: ulid(),
      bucket_key: key,
      category: b.category,
      host: b.host,
      geo: b.geo,
      k,
      sample_size: b.samples,
      agreement_rate: b.samples > 0 ? b.agreements / b.samples : 0,
      avg_utility_gap: mean(b.utilityGaps),
      avg_price_gap: b.priceGaps.length > 0 ? mean(b.priceGaps) : null,
      computed_at: now,
    });
  }
  logger.info("ticker.aggregate", {
    bucketCount: buckets.size,
    publishedCount: published.length,
    suppressedCount: suppressed,
    kMin,
  });
  return { published, suppressed, kMin };
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}
