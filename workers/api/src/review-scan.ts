// Review-authenticity scanner (Workflow W17).
// Deterministic heuristics grounded in dark-pattern/fake-social-proof pack:
// temporal clustering, language homogeneity, rating skew, template phrasing,
// length homogeneity. No LLM call — fast, cheap, auditable. A future /review-scan?llm=1
// switch can layer Opus 4.7 verification on top.

import { z } from "zod";

export const ReviewSchema = z.object({
  text: z.string().min(1),
  date: z.string().optional(),
  rating: z.number().min(1).max(5).optional(),
  reviewer: z.string().optional(),
});

export const ReviewScanRequestSchema = z.object({
  reviews: z.array(ReviewSchema).min(2).max(500),
  productName: z.string().optional(),
});

export type Review = z.infer<typeof ReviewSchema>;
export type ReviewScanRequest = z.infer<typeof ReviewScanRequestSchema>;

export interface ReviewScanResult {
  authenticityScore: number; // 0..1 — 1 = authentic, 0 = likely fake
  signalsFound: string[];
  flaggedReviewIndices: number[];
  summary: string;
  packSlug: "dark-pattern/fake-social-proof";
  heuristics: {
    temporalClusteringPct: number;
    languageHomogeneityScore: number;
    fiveStarSharePct: number;
    templatePhrasingHitPct: number;
    lengthHomogeneityScore: number;
  };
}

// Common AI / template review phrases — grounded in Fakespot public heuristics
// and FTC 2024 fake-reviews-rule guidance.
const TEMPLATE_PHRASES = [
  "i love this product",
  "highly recommend",
  "exactly what i needed",
  "game changer",
  "works as advertised",
  "five stars",
  "best purchase i've made",
  "worth every penny",
  "will buy again",
  "exceeded my expectations",
  "arrived quickly",
  "packaged well",
  "easy to use",
  "great quality",
  "perfect for",
];

/** Measure what fraction of reviews cluster within a 72h window. */
function temporalClustering(reviews: Review[]): number {
  const dated = reviews
    .map((r) => (r.date ? new Date(r.date).getTime() : NaN))
    .filter((t) => !isNaN(t));
  if (dated.length < 3) return 0;
  dated.sort();
  const WINDOW = 72 * 60 * 60 * 1000;
  let maxCluster = 0;
  for (let i = 0; i < dated.length; i++) {
    let j = i;
    while (j < dated.length && (dated[j] as number) - (dated[i] as number) <= WINDOW) j++;
    maxCluster = Math.max(maxCluster, j - i);
  }
  return maxCluster / dated.length;
}

/**
 * Jaccard bigram overlap across all review pairs. Higher = reviews share
 * distinctive phrasing. >0.15 average is a strong inauthenticity signal.
 */
function languageHomogeneity(reviews: Review[]): number {
  const bigrams = (s: string) => {
    const toks = s.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length >= 3);
    const out = new Set<string>();
    for (let i = 0; i < toks.length - 1; i++) out.add(`${toks[i]} ${toks[i + 1]}`);
    return out;
  };
  const sigs = reviews.map((r) => bigrams(r.text));
  if (sigs.length < 2) return 0;
  let total = 0;
  let count = 0;
  for (let i = 0; i < sigs.length; i++) {
    const si = sigs[i]!;
    for (let j = i + 1; j < sigs.length; j++) {
      const sj = sigs[j]!;
      const inter = [...si].filter((b) => sj.has(b)).length;
      const union = new Set([...si, ...sj]).size;
      if (union > 0) {
        total += inter / union;
        count++;
      }
    }
  }
  return count > 0 ? total / count : 0;
}

/** Share of reviews that are 5-star, if ratings provided. Authentic distributions are ~60-70%. */
function fiveStarShare(reviews: Review[]): number {
  const rated = reviews.filter((r) => typeof r.rating === "number");
  if (rated.length === 0) return 0;
  return rated.filter((r) => r.rating === 5).length / rated.length;
}

/** What fraction of reviews contain ≥2 template phrases. */
function templatePhrasingHit(reviews: Review[]): number {
  let hits = 0;
  for (const r of reviews) {
    const lower = r.text.toLowerCase();
    const matches = TEMPLATE_PHRASES.filter((p) => lower.includes(p)).length;
    if (matches >= 2) hits++;
  }
  return hits / reviews.length;
}

/** 1 - (stdev / mean) of review lengths. Closer to 1 = suspicious uniformity. */
function lengthHomogeneity(reviews: Review[]): number {
  const lens = reviews.map((r) => r.text.length);
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  if (mean === 0) return 0;
  const variance = lens.reduce((s, l) => s + (l - mean) ** 2, 0) / lens.length;
  const stdev = Math.sqrt(variance);
  const cv = stdev / mean;
  return Math.max(0, 1 - cv);
}

export function scanReviews(req: ReviewScanRequest): ReviewScanResult {
  const { reviews, productName } = req;

  const tClust = temporalClustering(reviews);
  const langHom = languageHomogeneity(reviews);
  const fiveStar = fiveStarShare(reviews);
  const tplHit = templatePhrasingHit(reviews);
  const lenHom = lengthHomogeneity(reviews);

  const signals: string[] = [];
  const flagged = new Set<number>();

  if (tClust > 0.4) {
    signals.push(`temporal-clustering: ${Math.round(tClust * 100)}% of reviews posted within 72 hours`);
  }
  if (langHom > 0.15) {
    signals.push(`language-homogeneity: bigram overlap ${langHom.toFixed(2)} across review pairs`);
  }
  if (fiveStar > 0.85) {
    signals.push(`rating-skew: ${Math.round(fiveStar * 100)}% five-star reviews (authentic baseline 60-70%)`);
  }
  if (tplHit > 0.3) {
    signals.push(`template-phrasing: ${Math.round(tplHit * 100)}% of reviews contain ≥2 common template phrases`);
  }
  if (lenHom > 0.75) {
    signals.push(`length-homogeneity: reviews cluster around a narrow word count`);
  }

  // Flag individual reviews with 2+ template phrases
  reviews.forEach((r, i) => {
    const lower = r.text.toLowerCase();
    const matches = TEMPLATE_PHRASES.filter((p) => lower.includes(p)).length;
    if (matches >= 2) flagged.add(i);
  });

  // Composite authenticity score — 1 = clean, 0 = likely fake
  const penalty =
    Math.min(1, tClust * 1.0) * 0.25 +
    Math.min(1, langHom * 4) * 0.25 +
    Math.max(0, fiveStar - 0.7) * 1.0 * 0.2 +
    Math.min(1, tplHit * 2) * 0.2 +
    Math.max(0, lenHom - 0.6) * 1.0 * 0.1;
  const authenticityScore = Math.max(0, Math.min(1, 1 - penalty));

  let summary: string;
  if (authenticityScore >= 0.8) {
    summary = `Reviews look mostly authentic. ${signals.length === 0 ? "No red flags." : "Minor signals: " + signals.length + "."}`;
  } else if (authenticityScore >= 0.55) {
    summary = `Mixed signals. Some patterns consistent with manufactured reviews — treat ratings with caution.`;
  } else if (authenticityScore >= 0.3) {
    summary = `Likely manipulated. Multiple signals of review fabrication. Seek independent reviews before buying${productName ? ` "${productName}"` : ""}.`;
  } else {
    summary = `Strongly inauthentic pattern. Reviews cluster in time, share phrasing, and skew 5-star — consistent with the FTC Fake Reviews Rule prohibited categories. Report to FTC if used commercially.`;
  }

  return {
    authenticityScore: Number(authenticityScore.toFixed(3)),
    signalsFound: signals,
    flaggedReviewIndices: Array.from(flagged).sort((a, b) => a - b),
    summary,
    packSlug: "dark-pattern/fake-social-proof",
    heuristics: {
      temporalClusteringPct: Number((tClust * 100).toFixed(1)),
      languageHomogeneityScore: Number(langHom.toFixed(3)),
      fiveStarSharePct: Number((fiveStar * 100).toFixed(1)),
      templatePhrasingHitPct: Number((tplHit * 100).toFixed(1)),
      lengthHomogeneityScore: Number(lenHom.toFixed(3)),
    },
  };
}
