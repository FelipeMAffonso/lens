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

  const aiPickName = extract.aiRecommendation.pickedProduct.name.toLowerCase();
  const aiPickCandidate =
    ranked.find(
      (c) => c.name.toLowerCase().includes(aiPickName) || aiPickName.includes(c.name.toLowerCase()),
    ) ?? null;

  const tTotal = Date.now();

  return {
    id: crypto.randomUUID(),
    host: input.kind === "query" ? (input.source ?? "unknown") : input.source,
    intent: extract.intent,
    aiRecommendation: extract.aiRecommendation,
    candidates: ranked,
    specOptimal: ranked[0]!,
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
