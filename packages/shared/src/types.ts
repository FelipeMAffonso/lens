// Core domain types for Lens.
// Everything the frontend, extension, API Worker, and cross-model agent share.

/** The raw input the user gives Lens. Five shapes covering the real consumer flows:
 *   - "text"  — paste an AI recommendation (ChatGPT/Claude/Gemini/Rufus/...)
 *   - "image" — screenshot of an AI chat (Opus 4.7 vision)
 *   - "query" — type what you're shopping for, no AI in the loop (Job 1)
 *   - "url"   — paste a product URL from any retailer (Amazon, Best Buy, manufacturer site)
 *   - "photo" — phone camera photo of a product or shelf (Opus 4.7 vision)
 */
export type ImageMime = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export type AuditInput =
  | { kind: "text"; source: HostAI; raw: string; userPrompt?: string | undefined }
  | { kind: "image"; source: HostAI; imageBase64: string; imageMime?: ImageMime | undefined; userPrompt?: string | undefined }
  | { kind: "query"; source?: HostAI | undefined; userPrompt: string; category?: string | undefined }
  | { kind: "url"; url: string; userPrompt?: string | undefined; category?: string | undefined }
  | { kind: "photo"; imageBase64: string; imageMime?: ImageMime | undefined; userPrompt?: string | undefined; category?: string | undefined };

/** Which AI assistant produced the output being audited. */
export type HostAI = "chatgpt" | "claude" | "gemini" | "rufus" | "perplexity" | "unknown";

/** A single attribute claim the AI made about the product it recommended. */
export interface Claim {
  attribute: string;         // e.g. "pressure", "RAM"
  statedValue: string;       // what the AI said, e.g. "15 bar"
  verdict: "true" | "false" | "misleading" | "unverifiable";
  evidenceUrl?: string | undefined;      // source that proves or disproves
  evidenceSnippet?: string | undefined;  // passage that was checked
  note?: string | undefined;             // human-readable explanation of verdict
}

/** A product candidate Lens evaluated (not necessarily one the AI mentioned). */
export interface Candidate {
  name: string;
  brand: string;
  price: number | null;
  currency: string;          // "USD"
  url?: string | undefined;              // product page (scrubbed of affiliate tags)
  thumbnailUrl?: string | undefined;
  imageUrl?: string | undefined;
  model?: string | undefined;
  specs: Record<string, string | number | boolean>;
  attributeScores: Record<string, number>; // each user-criterion → 0..1
  utilityScore: number;                     // weighted sum ∈ [0, 1]
  utilityBreakdown: Array<{ criterion: string; weight: number; score: number; contribution: number }>;
  /** Price-story transparency: how many retailer rows triangulate into the
   *  displayed median price, and the p25/p75 range. Lets the UI show
   *  "triangulated across N retailers · range $X-$Y" per candidate. */
  priceSources?: number | undefined;
  priceMin?: number | undefined;
  priceMax?: number | undefined;
  priceObservedAt?: string | undefined;
  /** Canonical SKU id in the spine (e.g. wd:Q123, amazon:B0..., fda510k:K123).
   *  Frontend can use this to fetch per-retailer price history on demand. */
  skuId?: string | undefined;
}

/** Parsed user intent extracted from the original prompt (or inferred from the AI's answer). */
export interface UserIntent {
  category: string;                 // "espresso machine", "laptop"
  criteria: Array<{
    name: string;                   // e.g. "pressure"
    weight: number;                 // 0..1, normalized to sum 1 across criteria
    direction: "higher_is_better" | "lower_is_better" | "target" | "binary";
    target?: string | number | undefined;       // for "target" or "binary"
    /** S1-W8 Layer-2: Opus's self-reported confidence 0..1 in this criterion.
     *  < 0.6 triggers clarification. User-edited sliders set this to 1.0. */
    confidence?: number | undefined;
    /** Preference-inference transparency: where this weight came from. */
    source?:
      | "stated"
      | "budget"
      | "category_prior"
      | "profile"
      | "revealed"
      | "clarification"
      | "explicit_edit"
      | "safety_guardrail"
      | "default"
      | undefined;
    /** One-sentence rationale shown to users when explaining the utility model. */
    rationale?: string | undefined;
  }>;
  budget?: { min?: number | undefined; max?: number | undefined; currency: string } | undefined;
  rawCriteriaText: string;          // original user words, for tooltip explainability
  /**
   * Preference-inference audit trail. Lens must derive a utility function
   * before ranking, but every inferred layer stays inspectable and user-editable.
   */
  preferenceModel?: {
    version: "layered-utility-v1";
    confidence: number;
    needsClarification: boolean;
    layers: Array<{
      layer:
        | "stated"
        | "budget"
        | "category_prior"
        | "profile"
        | "revealed"
        | "cross_category"
        | "guardrail";
      status: "used" | "missing" | "requires_consent" | "user_controlled";
      signals: number;
      rationale: string;
    }>;
    userControls: string[];
    privacy: {
      dataTier: "in_flight" | "local_only" | "server_profile" | "oauth_sensitive";
      usesExternalBehavior: boolean;
      consentRequiredFor: string[];
      retention: "per_request" | "device_local" | "account_scoped";
    };
  } | undefined;
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
  pickedProduct: {
    name: string;
    brand?: string | undefined;
    price?: number | undefined;
    currency?: string | undefined;
    url?: string | undefined;
  };
  claims: Array<Omit<Claim, "verdict" | "evidenceUrl" | "evidenceSnippet" | "note">>;
  reasoningTrace: string;           // the AI's justification prose, normalized
  citedUrls?: string[] | undefined;
  /** Original URL the user pasted (URL mode only) — feeds enrichments when no candidate URL. */
  sourceUrl?: string | undefined;
}

/** Result of running the same question through one of the three other frontier models. */
export interface CrossModelCheck {
  provider: "openai" | "google" | "openrouter";
  model: string;                    // e.g. "gpt-5", "gemini-3-pro", "kimi-k2"
  pickedProduct: { name: string; brand?: string | undefined };
  agreesWithLens: boolean;
  reasoning?: string | undefined;
  latencyMs: number;
}

/** The full audit card Lens returns. */
export interface AuditResult {
  id: string;                       // request id for caching / debug
  host: HostAI;
  intent: UserIntent;
  aiRecommendation: AIRecommendation;
  candidates: Candidate[];          // top N from live web search, ranked by utility
  specOptimal: Candidate | null;    // candidates[0], or null when Lens has no defensible top pick
  aiPickCandidate: Candidate | null; // the candidate matching AI's pick (if found)
  claims: Claim[];                  // each AI claim, verified
  crossModel: CrossModelCheck[];
  elapsedMs: {
    extract: number;
    search: number;
    verify: number;
    rank: number;
    crossModel: number;
    enrich?: number | undefined;  // B2 parallel-enrichments wall-clock (judge P1-4)
    total: number;
  };
  createdAt: string;                // ISO timestamp
  /** Stage-level warnings — surfaces silent degradation that previously vanished. */
  warnings?: Array<{ stage: string; message: string }> | undefined;
  /**
   * B2 parallel enrichments — each audit fans out to the per-signal checks
   * so the card surfaces scam/breach/price/provenance verdicts alongside the
   * claim audit. Each entry is best-effort: a failed or skipped enrichment
   * shows `status: "skipped" | "error"` with a reason rather than blocking.
   */
  enrichments?: {
    scam?: { status: "ok" | "skipped" | "error"; verdict?: "safe" | "caution" | "scam" | undefined; riskScore?: number | undefined; host?: string | undefined; reason?: string | undefined } | null | undefined;
    breach?: { status: "ok" | "skipped" | "error"; score?: number | undefined; band?: "none" | "low" | "moderate" | "high" | "elevated" | "critical" | undefined; domain?: string | undefined; reason?: string | undefined } | null | undefined;
    priceHistory?: { status: "ok" | "skipped" | "error"; verdict?: "genuine-sale" | "fake-sale" | "modest-dip" | "no-sale" | "insufficient-data" | undefined; reason?: string | undefined } | null | undefined;
    provenance?: { status: "ok" | "skipped" | "error"; score?: number | undefined; affiliateFlags?: number | undefined; reason?: string | undefined } | null | undefined;
    sponsorship?: { status: "ok" | "skipped" | "error"; verdict?: "clear" | "disclosed-partnership" | "undisclosed-partnership" | undefined; reason?: string | undefined } | null | undefined;
  } | undefined;
}

export type CustomerJourneyStageId =
  | "pre_search"
  | "ai_research"
  | "product_page"
  | "cart_checkout"
  | "post_purchase"
  | "ownership"
  | "end_of_life";

export type CustomerJourneyStatus = "live" | "partial" | "planned";

export type CustomerJourneyConsentTier =
  | "none"
  | "local_only"
  | "account"
  | "oauth_sensitive"
  | "financial_sensitive";

export interface CustomerJourneyStage {
  id: CustomerJourneyStageId;
  label: string;
  status: CustomerJourneyStatus;
  promise: string;
  surfaces: string[];
  endpoints: string[];
  workflows: string[];
  dataSources: string[];
  implementedSignals: string[];
  edgeCasesCovered: string[];
  failureRecovery: string[];
  consentTier: CustomerJourneyConsentTier;
  userControls: string[];
  nextHardening: string[];
}

export interface CustomerJourneyMap {
  version: "customer-journey-map-v1";
  generatedAt: string;
  readiness: {
    live: number;
    partial: number;
    planned: number;
    total: number;
    score: number;
  };
  guarantees: string[];
  privacyControls: string[];
  stages: CustomerJourneyStage[];
}
