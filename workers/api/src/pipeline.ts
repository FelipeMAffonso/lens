import type { AuditInput, AuditResult } from "@lens/shared";
import type { Env } from "./index.js";
import { extractIntentAndRecommendation } from "./extract.js";
import { searchCandidates } from "./search.js";
import { verifyClaims } from "./verify.js";
import { rankCandidates } from "./rank.js";
import { runCrossModelCheck } from "./crossModel.js";
import { runEnrichments } from "./enrich.js";

export interface PipelineOptions {
  onEvent?: (event: string, data: unknown) => void;
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

  // Judge P0 #1: every c.name must be a non-empty string before .toLowerCase().
  // search.ts now filters, but defense in depth — a malformed candidate slipping
  // through must not 500 the whole audit.
  const aiPickName = extract.aiRecommendation.pickedProduct?.name?.toLowerCase() ?? "";
  const aiPickCandidate = aiPickName
    ? ranked.find(
        (c) =>
          typeof c.name === "string" &&
          c.name.length > 0 &&
          (c.name.toLowerCase().includes(aiPickName) || aiPickName.includes(c.name.toLowerCase())),
      ) ?? null
    : null;

  // B2 — parallel enrichments. Runs after rank so we can pass aiPickCandidate
  // and the ranked candidate list; each signal wrapped in its own try/catch
  // inside runEnrichments so a failure never blocks the primary audit.
  emit("enrich:start", {});
  const enrichments = await runEnrichments(
    extract.intent,
    extract.aiRecommendation,
    ranked,
    aiPickCandidate,
    env,
  );
  emit("enrich:done", { enrichments });

  const tTotal = Date.now();

  // Surface stage-level warnings to the caller. Silent failures are a critic-flagged
  // problem: callers can no longer tell a successful zero-claim audit from a parse failure.
  const warnings: Array<{ stage: string; message: string }> = [];
  if (extract.aiRecommendation.claims.length === 0 && input.kind === "text") {
    warnings.push({ stage: "extract", message: "No claims extracted from AI text — paste may be too short or non-recommendation." });
  }
  if (candidates.length === 0) {
    warnings.push({
      stage: "search",
      message:
        "Lens could not find defensible product candidates for this request. Try a more specific category term or paste a cleaner product URL.",
    });
  }
  if (crossModel.length === 0) {
    warnings.push({ stage: "crossModel", message: "Cross-assistant comparison was skipped for this run." });
  }
  if (!ranked[0]) {
    warnings.push({ stage: "rank", message: "Ranking produced no top pick — verify candidates have parseable spec values." });
  }
  // Judge P2 #9: detect the fallback-to-overall_quality path. When the user's stated
  // criteria were all dropped (malformed / nameless from Opus), rank uses a single
  // default. Surface that honestly so the UI doesn't show "ranked by overall_quality"
  // as if the user had asked for it.
  const topBreakdown = ranked[0]?.utilityBreakdown ?? [];
  const userAskedForCriteria = (extract.intent.criteria?.length ?? 0) > 0;
  const rankedOnDefaultOnly =
    topBreakdown.length === 1 && topBreakdown[0]?.criterion === "overall_quality";
  if (userAskedForCriteria && rankedOnDefaultOnly) {
    warnings.push({
      stage: "rank",
      message:
        "Your stated criteria were dropped during extraction (missing names or invalid weights). Ranking fell back to a neutral overall_quality default. Try rephrasing with explicit attributes.",
    });
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
    specOptimal: ranked[0] ?? null,
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
    enrichments,
  };
}
