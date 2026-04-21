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

/**
 * End-to-end audit pipeline.
 *
 * Stages run partially in parallel:
 *   1. extract   — Opus 4.7 extended thinking decomposes the pasted answer
 *      ↓ (unlocks)
 *   2. search    — Opus 4.7 web search pulls real candidates matching criteria
 *   3. verify    — parallel claim verification against spec sheets (1M context)
 *   4. rank      — derived utility function scores candidates
 *   5. crossModel — Managed Agent fans out to 3 other frontier models (in parallel with 2-4)
 */
export async function runAuditPipeline(
  input: AuditInput,
  env: Env,
  opts: PipelineOptions = {},
): Promise<AuditResult> {
  const t0 = Date.now();
  const emit = opts.onEvent ?? (() => {});

  emit("extract:start", { kind: input.kind });
  const extract = await extractIntentAndRecommendation(input, env);
  const tExtract = Date.now();
  emit("extract:done", { intent: extract.intent, aiRecommendation: extract.aiRecommendation });

  // From here, search + crossModel run in parallel.
  emit("search:start", { category: extract.intent.category });
  emit("crossModel:start", {});

  const [candidates, crossModel] = await Promise.all([
    searchCandidates(extract.intent, env).then((c) => {
      emit("search:done", { count: c.length });
      return c;
    }),
    runCrossModelCheck(extract.intent, extract.aiRecommendation, env).then((c) => {
      emit("crossModel:done", { results: c });
      return c;
    }),
  ]);
  const tSearch = Date.now();

  emit("verify:start", { claimCount: extract.aiRecommendation.claims.length });
  const claims = await verifyClaims(
    extract.aiRecommendation,
    candidates,
    extract.intent,
    env,
  );
  const tVerify = Date.now();
  emit("verify:done", { claims });

  emit("rank:start", { candidateCount: candidates.length });
  const ranked = await rankCandidates(extract.intent, candidates);
  const tRank = Date.now();
  emit("rank:done", { top: ranked[0] });

  const aiPickCandidate =
    ranked.find(
      (c) =>
        c.name.toLowerCase().includes(extract.aiRecommendation.pickedProduct.name.toLowerCase()) ||
        extract.aiRecommendation.pickedProduct.name.toLowerCase().includes(c.name.toLowerCase()),
    ) ?? null;

  const tTotal = Date.now();

  const result: AuditResult = {
    id: crypto.randomUUID(),
    host: input.source,
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
      crossModel: tSearch - tExtract, // ran in parallel with search
      total: tTotal - t0,
    },
    createdAt: new Date().toISOString(),
  };

  return result;
}
