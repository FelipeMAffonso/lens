// F3 — audit workflow spec. Port of the existing runAuditPipeline into a DAG.
//
// DAG:
//            ┌─ search ─────┐
//   extract ─┤              ├─ verify ─┬─ assemble
//            └─ crossModel ─┘          │
//                                rank ─┤
//                              enrich ─┘
//
// extract produces { intent, aiRecommendation }.
// search + crossModel run in parallel, both depend on extract.
// verify depends on extract + search.
// rank depends on extract + search (parallel with verify).
// enrich runs the B2 parallel signal fanout on rank+extract output.
// assemble depends on all six.

import type { AuditInput, AuditResult } from "@lens/shared";
import type { WorkflowSpec } from "../spec.js";
import { extractIntentAndRecommendation } from "../../extract.js";
import { searchCandidates } from "../../search.js";
import { runCrossModelCheck } from "../../crossModel.js";
import { verifyClaims } from "../../verify.js";
import { rankCandidates } from "../../rank.js";
import { runEnrichments } from "../../enrich.js";
import { registerWorkflow } from "../registry.js";
import type { Env } from "../../index.js";

type ExtractOut = Awaited<ReturnType<typeof extractIntentAndRecommendation>>;
type SearchOut = Awaited<ReturnType<typeof searchCandidates>>;
type CrossOut = Awaited<ReturnType<typeof runCrossModelCheck>>;
type VerifyOut = Awaited<ReturnType<typeof verifyClaims>>;
type RankOut = Awaited<ReturnType<typeof rankCandidates>>;
type EnrichOut = Awaited<ReturnType<typeof runEnrichments>>;

// Per-node timestamp tracking so elapsedMs reflects real work. The engine
// doesn't expose node-level timings, so we stash them on ctx.state.
const tsKey = (id: string): string => `ts:${id}`;

const spec: WorkflowSpec<AuditInput, AuditResult> = {
  id: "audit",
  version: "2.0.0",
  description:
    "Audit an AI shopping recommendation across extract, search ‖ cross-model, verify + rank + enrich in parallel, then assemble.",
  entryNodeId: "extract",
  finalNodeId: "assemble",
  nodes: [
    {
      id: "extract",
      label: "Extract intent + AI recommendation",
      timeoutMs: 90_000,
      retry: { maxAttempts: 2, backoffMs: 1000 },
      handler: async (input, ctx) => {
        const env = ctx.env as unknown as Env;
        const t0 = Date.now();
        await ctx.writeState(tsKey("t0"), t0);
        ctx.log("info", "extract:start", { kind: (input as AuditInput).kind });
        const out = await extractIntentAndRecommendation(input as AuditInput, env);
        await ctx.writeState(tsKey("extract"), Date.now());
        ctx.log("info", "extract:done", {
          category: out.intent.category,
          criteria: out.intent.criteria.length,
          claims: out.aiRecommendation.claims.length,
        });
        return out;
      },
    },
    {
      id: "search",
      label: "Web search for candidates",
      inputsFrom: ["extract"],
      timeoutMs: 120_000,
      retry: { maxAttempts: 2, backoffMs: 1500 },
      handler: async (input, ctx) => {
        const env = ctx.env as unknown as Env;
        const { intent } = input as ExtractOut;
        const out = await searchCandidates(intent, env);
        await ctx.writeState(tsKey("search"), Date.now());
        ctx.log("info", "search:done", { candidates: out.length });
        return out;
      },
    },
    {
      id: "crossModel",
      label: "Cross-assistant fanout",
      inputsFrom: ["extract"],
      timeoutMs: 60_000,
      handler: async (input, ctx) => {
        const env = ctx.env as unknown as Env;
        const { intent, aiRecommendation } = input as ExtractOut;
        const out = await runCrossModelCheck(intent, aiRecommendation, env);
        await ctx.writeState(tsKey("crossModel"), Date.now());
        ctx.log("info", "crossModel:done", { providers: out.length });
        return out;
      },
    },
    {
      id: "verify",
      label: "Verify AI claims against candidates",
      inputsFrom: ["extract", "search"],
      timeoutMs: 90_000,
      handler: async (input, ctx) => {
        const env = ctx.env as unknown as Env;
        const { extract, search } = input as { extract: ExtractOut; search: SearchOut };
        const out = await verifyClaims(
          extract.aiRecommendation,
          search,
          extract.intent,
          env,
        );
        await ctx.writeState(tsKey("verify"), Date.now());
        ctx.log("info", "verify:done", { claims: out.length });
        return out;
      },
    },
    {
      id: "rank",
      label: "Deterministic utility ranking",
      inputsFrom: ["extract", "search"],
      timeoutMs: 5000,
      handler: async (input, ctx) => {
        const { extract, search } = input as { extract: ExtractOut; search: SearchOut };
        const out = await rankCandidates(extract.intent, search);
        await ctx.writeState(tsKey("rank"), Date.now());
        ctx.log("info", "rank:done", { top: out[0]?.name });
        return out;
      },
    },
    {
      id: "enrich",
      label: "Parallel enrichments (scam, breach, price, provenance, sponsorship)",
      inputsFrom: ["extract", "search", "rank"],
      timeoutMs: 20_000,
      handler: async (input, ctx) => {
        const env = ctx.env as unknown as Env;
        const { extract, search, rank: ranked } = input as {
          extract: ExtractOut;
          search: SearchOut;
          rank: RankOut;
        };
        const aiPickName = extract.aiRecommendation.pickedProduct?.name?.toLowerCase() ?? "";
        const aiPickCandidate = aiPickName
          ? ranked.find(
              (c) =>
                typeof c.name === "string" &&
                c.name.trim().length > 0 &&
                (c.name.toLowerCase().includes(aiPickName) ||
                  aiPickName.includes(c.name.toLowerCase())),
            ) ?? null
          : null;
        const out = await runEnrichments(
          extract.intent,
          extract.aiRecommendation,
          search,
          aiPickCandidate,
          env,
        );
        await ctx.writeState(tsKey("enrich"), Date.now());
        ctx.log("info", "enrich:done", {
          scam: out.scam?.status,
          breach: out.breach?.status,
          priceHistory: out.priceHistory?.status,
        });
        return out;
      },
    },
    {
      id: "assemble",
      label: "Assemble AuditResult",
      inputsFrom: ["extract", "search", "crossModel", "verify", "rank", "enrich"],
      handler: async (input, ctx): Promise<AuditResult> => {
        const {
          extract,
          search: _search,
          crossModel,
          verify: claims,
          rank: ranked,
          enrich,
        } = input as {
          extract: ExtractOut;
          search: SearchOut;
          crossModel: CrossOut;
          verify: VerifyOut;
          rank: RankOut;
          enrich: EnrichOut;
        };

        // Judge P0: null-safe pickedProduct.name + c.name.
        const aiPickName = extract.aiRecommendation.pickedProduct?.name?.toLowerCase() ?? "";
        const aiPickCandidate = aiPickName
          ? ranked.find(
              (c) =>
                typeof c.name === "string" &&
                c.name.trim().length > 0 &&
                (c.name.toLowerCase().includes(aiPickName) ||
                  aiPickName.includes(c.name.toLowerCase())),
            ) ?? null
          : null;

        const warnings: Array<{ stage: string; message: string }> = [];
        if (extract.aiRecommendation.claims.length === 0) {
          warnings.push({
            stage: "extract",
            message:
              "No claims extracted — paste may be too short or not a product recommendation.",
          });
        }
        if (ranked.length === 0) {
          warnings.push({
            stage: "search",
            message:
              "Live web search returned no products and no pack SKU match for this category. Try a more specific category term (e.g. 'robot vacuum' instead of 'cleaning device'), or your Opus API key may be rate-limited.",
          });
        }
        if (crossModel.length === 0) {
          warnings.push({
            stage: "crossModel",
            message:
              "No cross-model picks. Provider keys may be missing or rate-limited. Check OPENAI_API_KEY / GOOGLE_API_KEY / OPENROUTER_API_KEY.",
          });
        }
        // Judge P2 #9: detect the default-criterion fallback.
        const topBreakdown = ranked[0]?.utilityBreakdown ?? [];
        const userAskedForCriteria = (extract.intent.criteria?.length ?? 0) > 0;
        const rankedOnDefaultOnly =
          topBreakdown.length === 1 && topBreakdown[0]?.criterion === "overall_quality";
        if (userAskedForCriteria && rankedOnDefaultOnly) {
          warnings.push({
            stage: "rank",
            message:
              "Your stated criteria were dropped during extraction. Ranking fell back to a neutral default — the displayed utility reflects that fallback, not your original priorities.",
          });
        }

        // Compute real per-node timings from stashed timestamps.
        const t0 = ((await ctx.readState<number>(tsKey("t0"))) ?? Date.now());
        const tExtract = ((await ctx.readState<number>(tsKey("extract"))) ?? t0);
        const tSearch = ((await ctx.readState<number>(tsKey("search"))) ?? tExtract);
        const tCrossModel = ((await ctx.readState<number>(tsKey("crossModel"))) ?? tExtract);
        const tVerify = ((await ctx.readState<number>(tsKey("verify"))) ?? tSearch);
        const tRank = ((await ctx.readState<number>(tsKey("rank"))) ?? tSearch);
        const tNow = Date.now();

        const result: AuditResult = {
          id: ctx.runId,
          host: extract.aiRecommendation.host ?? "unknown",
          intent: extract.intent,
          aiRecommendation: extract.aiRecommendation,
          candidates: ranked,
          specOptimal:
            ranked[0] ??
            ({
              name: "(no candidates available)",
              brand: "",
              price: null,
              currency: "USD",
              specs: {},
              attributeScores: {},
              utilityScore: 0,
              utilityBreakdown: [],
            } as unknown as AuditResult["specOptimal"]),
          aiPickCandidate,
          claims,
          crossModel,
          warnings,
          elapsedMs: {
            extract: tExtract - t0,
            search: tSearch - tExtract,
            crossModel: tCrossModel - tExtract,
            verify: tVerify - tSearch,
            rank: tRank - tSearch,
            total: tNow - t0,
          },
          createdAt: new Date().toISOString(),
          enrichments: enrich,
        };

        ctx.emit("audit:completed", { runId: ctx.runId, auditId: result.id });
        return result;
      },
    },
  ],
};

registerWorkflow(spec);

export const auditWorkflow = spec;
