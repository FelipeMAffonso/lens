import type { AuditInput, AuditResult } from "@lens/shared";
import type { Env } from "./index.js";
import { extractIntentAndRecommendation } from "./extract.js";
import { searchCandidates } from "./search.js";
import { verifyClaims } from "./verify.js";
import { rankCandidates } from "./rank.js";
import { runCrossModelCheck } from "./crossModel.js";

export interface PipelineOptions {
  onEvent?: (event: string, data: unknown) => void;
}

function createEmptyOptimal(_intent: { category: string }): {
  name: string; brand: string; price: number | null; currency: string; specs: Record<string, never>;
  attributeScores: Record<string, never>; utilityScore: number; utilityBreakdown: never[];
} {
  return { name: "(no candidates available)", brand: "", price: null, currency: "USD", specs: {}, attributeScores: {}, utilityScore: 0, utilityBreakdown: [] };
}

class StageError extends Error {
  constructor(public stage: string, message: string, public cause?: unknown) {
    super(`[${stage}] ${message}`);
    this.name = "StageError";
  }
}

async function runStage<T>(stage: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const e = err as Error;
    throw new StageError(stage, e.message, err);
  }
}

export async function runAuditPipeline(
  input: AuditInput,
  env: Env,
  opts: PipelineOptions = {},
): Promise<AuditResult> {
  const t0 = Date.now();
  const emit = opts.onEvent ?? (() => {});

  emit("extract:start", { kind: input.kind });
  const extract = await runStage("extract", () => extractIntentAndRecommendation(input, env));
  const tExtract = Date.now();
  emit("extract:done", {
    intent: extract.intent,
    aiRecommendation: extract.aiRecommendation,
  });
  console.log(
    "[extract] category=%s criteria=%d claims=%d",
    extract.intent.category,
    extract.intent.criteria?.length ?? 0,
    extract.aiRecommendation.claims?.length ?? 0,
  );

  emit("search:start", { category: extract.intent.category });
  emit("crossModel:start", {});

  const [candidates, crossModel] = await Promise.all([
    runStage("search", () => searchCandidates(extract.intent, env)).then((c) => {
      console.log("[search] candidates=%d", c.length);
      emit("search:done", { count: c.length });
      return c;
    }),
    runStage("crossModel", () =>
      runCrossModelCheck(extract.intent, extract.aiRecommendation, env),
    ).then((c) => {
      console.log("[crossModel] providers=%d", c.length);
      emit("crossModel:done", { results: c });
      return c;
    }),
  ]);
  const tSearch = Date.now();

  emit("verify:start", { claimCount: extract.aiRecommendation.claims?.length ?? 0 });
  const claims = await runStage("verify", () =>
    verifyClaims(extract.aiRecommendation, candidates, extract.intent, env),
  );
  const tVerify = Date.now();
  console.log("[verify] verified=%d", claims.length);
  emit("verify:done", { claims });

  emit("rank:start", { candidateCount: candidates.length });
  const ranked = await runStage("rank", () => rankCandidates(extract.intent, candidates));
  const tRank = Date.now();
  console.log("[rank] top=%s score=%s", ranked[0]?.name ?? "?", ranked[0]?.utilityScore.toFixed(3));
  emit("rank:done", { top: ranked[0] });

  const aiPickName = extract.aiRecommendation.pickedProduct?.name?.toLowerCase() ?? "";
  const aiPickCandidate = aiPickName
    ? ranked.find(
        (c) => c.name.toLowerCase().includes(aiPickName) || aiPickName.includes(c.name.toLowerCase()),
      ) ?? null
    : null;

  const tTotal = Date.now();

  // Surface stage-level warnings to the caller. Silent failures are a critic-flagged
  // problem: callers can no longer tell a successful zero-claim audit from a parse failure.
  const warnings: Array<{ stage: string; message: string }> = [];
  if (extract.aiRecommendation.claims.length === 0 && input.kind === "text") {
    warnings.push({ stage: "extract", message: "No claims extracted from AI text — paste may be too short or non-recommendation." });
  }
  if (candidates.length === 0) {
    warnings.push({ stage: "search", message: "No candidates found. Switch LENS_SEARCH_MODE to 'real' or check fixture coverage for this category." });
  }
  if (crossModel.length === 0) {
    warnings.push({ stage: "crossModel", message: "No cross-model picks. Provider keys may be missing or rate-limited. Check Worker secrets." });
  }
  if (!ranked[0]) {
    warnings.push({ stage: "rank", message: "Ranking produced no top pick — verify candidates have parseable spec values." });
  }

  return {
    id: crypto.randomUUID(),
    host:
      input.kind === "text" || input.kind === "image"
        ? input.source
        : input.kind === "query"
          ? (input.source ?? "unknown")
          : ("unknown" as const),
    intent: extract.intent,
    aiRecommendation: extract.aiRecommendation,
    candidates: ranked,
    specOptimal: ranked[0] ?? createEmptyOptimal(extract.intent),
    warnings,
    aiPickCandidate,
    claims,
    crossModel,
    elapsedMs: {
      extract: tExtract - t0,
      search: tSearch - tExtract,
      verify: tVerify - tSearch,
      rank: tRank - tVerify,
      crossModel: tSearch - tExtract,
      total: tTotal - t0,
    },
    createdAt: new Date().toISOString(),
  };
}
