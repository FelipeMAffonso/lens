// S6-W33 — shared types for recall feeds.

export type RecallSource = "cpsc" | "nhtsa" | "fda" | "usda";

export interface NormalizedRecall {
  source: RecallSource;
  recallId: string;          // `${source}:${vendor-id}` — stable across fetches
  title: string;
  description: string;
  brand: string;             // best-effort extraction
  productNames: string[];    // multiple product names as cited
  hazard: string;            // one-line plain-English hazard summary
  remedyText: string;        // what the consumer can do
  publishedAt: string;       // ISO date
  sourceUrl: string;
}

export interface PurchaseRow {
  id: string;
  user_id: string;
  product_name: string;
  brand: string | null;
  category: string | null;
  purchased_at: string;
}

export interface MatchResult {
  recall: NormalizedRecall;
  purchase: PurchaseRow;
  score: number;          // 0..1
  reasons: string[];
}
