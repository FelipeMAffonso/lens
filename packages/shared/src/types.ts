// Core domain types for Lens.
// Everything the frontend, extension, API Worker, and cross-model agent share.

/** The raw input the user gives Lens. Five shapes covering the real consumer flows:
 *   - "text"  — paste an AI recommendation (ChatGPT/Claude/Gemini/Rufus/...)
 *   - "image" — screenshot of an AI chat (Opus 4.7 vision)
 *   - "query" — type what you're shopping for, no AI in the loop (Job 1)
 *   - "url"   — paste a product URL from any retailer (Amazon, Best Buy, manufacturer site)
 *   - "photo" — phone camera photo of a product or shelf (Opus 4.7 vision)
 */
export type AuditInput =
  | { kind: "text"; source: HostAI; raw: string; userPrompt?: string | undefined }
  | { kind: "image"; source: HostAI; imageBase64: string; userPrompt?: string | undefined }
  | { kind: "query"; source?: HostAI | undefined; userPrompt: string; category?: string | undefined }
  | { kind: "url"; url: string; userPrompt?: string | undefined; category?: string | undefined }
  | { kind: "photo"; imageBase64: string; userPrompt?: string | undefined; category?: string | undefined };

/** Which AI assistant produced the output being audited. */
export type HostAI = "chatgpt" | "claude" | "gemini" | "rufus" | "unknown";

/** A single attribute claim the AI made about the product it recommended. */
export interface Claim {
  attribute: string;         // e.g. "pressure", "RAM"
  statedValue: string;       // what the AI said, e.g. "15 bar"
  verdict: "true" | "false" | "misleading" | "unverifiable";
  evidenceUrl?: string;      // source that proves or disproves
  evidenceSnippet?: string;  // passage that was checked
  note?: string;             // human-readable explanation of verdict
}

/** A product candidate Lens evaluated (not necessarily one the AI mentioned). */
export interface Candidate {
  name: string;
  brand: string;
  price: number | null;
  currency: string;          // "USD"
  url?: string;              // product page
  thumbnailUrl?: string;
  specs: Record<string, string | number | boolean>;
  attributeScores: Record<string, number>; // each user-criterion → 0..1
  utilityScore: number;                     // weighted sum ∈ [0, 1]
  utilityBreakdown: Array<{ criterion: string; weight: number; score: number; contribution: number }>;
}

/** Parsed user intent extracted from the original prompt (or inferred from the AI's answer). */
export interface UserIntent {
  category: string;                 // "espresso machine", "laptop"
  criteria: Array<{
    name: string;                   // e.g. "pressure"
    weight: number;                 // 0..1, normalized to sum 1 across criteria
    direction: "higher_is_better" | "lower_is_better" | "target" | "binary";
    target?: string | number;       // for "target" or "binary"
    /** S1-W8 Layer-2: Opus's self-reported confidence 0..1 in this criterion.
     *  < 0.6 triggers clarification. User-edited sliders set this to 1.0. */
    confidence?: number;
  }>;
  budget?: { min?: number; max?: number; currency: string };
  rawCriteriaText: string;          // original user words, for tooltip explainability
}

/** S1-W8 — a single binary trade-off question posed to the user to disambiguate a low-confidence criterion. */
export interface ClarifyQuestion {
  id: string;                       // ULID
  targetCriterion: string;          // which criterion this disambiguates
  prompt: string;                   // user-facing sentence
  optionA: { label: string; impliedWeightShift: Record<string, number> };
  optionB: { label: string; impliedWeightShift: Record<string, number> };
}

/** S1-W8 — the user's choice on one ClarifyQuestion. */
export interface ClarifyAnswer {
  questionId: string;
  chose: "A" | "B";
}

/** Parsed summary of the AI assistant's recommendation. */
export interface AIRecommendation {
  host: HostAI;
  pickedProduct: { name: string; brand?: string; price?: number; currency?: string; url?: string };
  claims: Array<Omit<Claim, "verdict" | "evidenceUrl" | "evidenceSnippet" | "note">>;
  reasoningTrace: string;           // the AI's justification prose, normalized
  citedUrls?: string[];
  /** Original URL the user pasted (URL mode only) — feeds enrichments when no candidate URL. */
  sourceUrl?: string;
}

/** Result of running the same question through one of the three other frontier models. */
export interface CrossModelCheck {
  provider: "openai" | "google" | "openrouter";
  model: string;                    // e.g. "gpt-5", "gemini-3-pro", "kimi-k2"
  pickedProduct: { name: string; brand?: string };
  agreesWithLens: boolean;
  reasoning?: string;
  latencyMs: number;
}

/** The full audit card Lens returns. */
export interface AuditResult {
  id: string;                       // request id for caching / debug
  host: HostAI;
  intent: UserIntent;
  aiRecommendation: AIRecommendation;
  candidates: Candidate[];          // top N from live web search, ranked by utility
  specOptimal: Candidate;           // candidates[0]
  aiPickCandidate: Candidate | null; // the candidate matching AI's pick (if found)
  claims: Claim[];                  // each AI claim, verified
  crossModel: CrossModelCheck[];
  elapsedMs: {
    extract: number;
    search: number;
    verify: number;
    rank: number;
    crossModel: number;
    enrich?: number;  // B2 parallel-enrichments wall-clock (judge P1-4)
    total: number;
  };
  createdAt: string;                // ISO timestamp
  /** Stage-level warnings — surfaces silent degradation that previously vanished. */
  warnings?: Array<{ stage: string; message: string }>;
  /**
   * B2 parallel enrichments — each audit fans out to the per-signal checks
   * so the card surfaces scam/breach/price/provenance verdicts alongside the
   * claim audit. Each entry is best-effort: a failed or skipped enrichment
   * shows `status: "skipped" | "error"` with a reason rather than blocking.
   */
  enrichments?: {
    scam?: { status: "ok" | "skipped" | "error"; verdict?: "safe" | "caution" | "scam"; riskScore?: number; host?: string; reason?: string } | null;
    breach?: { status: "ok" | "skipped" | "error"; score?: number; band?: "none" | "low" | "moderate" | "elevated" | "critical"; domain?: string; reason?: string } | null;
    priceHistory?: { status: "ok" | "skipped" | "error"; verdict?: "genuine-sale" | "fake-sale" | "modest-dip" | "no-sale" | "insufficient-data"; reason?: string } | null;
    provenance?: { status: "ok" | "skipped" | "error"; score?: number; affiliateFlags?: number; reason?: string } | null;
    sponsorship?: { status: "ok" | "skipped" | "error"; verdict?: "clear" | "disclosed-partnership" | "undisclosed-partnership"; reason?: string } | null;
  };
}
