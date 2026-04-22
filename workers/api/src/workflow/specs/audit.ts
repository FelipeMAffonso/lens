// F3 — audit workflow spec. Port of the existing runAuditPipeline into a DAG.
//
// DAG:
//            ┌─ search ─────┐
//   extract ─┤              ├─ verify ─┐
//            └─ crossModel ─┘          ├─ assemble
//                                rank ─┘
//
// extract produces { intent, aiRecommendation }.
// search + crossModel run in parallel, both depend on extract.
// verify depends on extract + search.
// rank depends on extract + search (can run in parallel with verify).
// assemble depends on all five.

import type { AuditInput, AuditResult } from "@lens/shared";
import type { WorkflowSpec } from "../spec.js";
import { extractIntentAndRecommendation } from "../../extract.js";
import { searchCandidates } from "../../search.js";
import { runCrossModelCheck } from "../../crossModel.js";
import { verifyClaims } from "../../verify.js";
import { rankCandidates } from "../../rank.js";
import { registerWorkflow } from "../registry.js";
import type { Env } from "../../index.js";

type ExtractOut = Awaited<ReturnType<typeof extractIntentAndRecommendation>>;
type SearchOut = Awaited<ReturnType<typeof searchCandidates>>;
type CrossOut = Awaited<ReturnType<typeof runCrossModelCheck>>;
type VerifyOut = Awaited<ReturnType<typeof verifyClaims>>;
type RankOut = Awaited<ReturnType<typeof rankCandidates>>;

const spec: WorkflowSpec<AuditInput, AuditResult> = {
  id: "audit",
  version: "1.0.0",
  description:
    "Audit an AI shopping recommendation (or a user query) across the 4-stage pipeline: extract, search/cross-model, verify, rank, assemble.",
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
        ctx.log("info", "extract:start", { kind: (input as AuditInput).kind });
        const out = await extractIntentAndRecommendation(input as AuditInput, env);
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
        ctx.log("info", "rank:done", { top: out[0]?.name });
        return out;
      },
    },
    {
      id: "assemble",
      label: "Assemble AuditResult",
      inputsFrom: ["extract", "search", "crossModel", "verify", "rank"],
      handler: async (input, ctx): Promise<AuditResult> => {
        const {
          extract,
          search: _search,
          crossModel,
          verify: claims,
          rank: ranked,
        } = input as {
          extract: ExtractOut;
          search: SearchOut;
          crossModel: CrossOut;
          verify: VerifyOut;
          rank: RankOut;
        };

        const aiPickName = extract.aiRecommendation.pickedProduct.name.toLowerCase();
        const aiPickCandidate = aiPickName
          ? (ranked.find(
              (c) =>
                c.name.toLowerCase().includes(aiPickName) ||
                aiPickName.includes(c.name.toLowerCase()),
            ) ?? null)
          : null;

        const warnings: Array<{ stage: string; message: string }> = [];
        if (extract.aiRecommendation.claims.length === 0) {
          warnings.push({
            stage: "extract",
            message:
              "No claims extracted — paste may be too short or not a recommendation.",
          });
        }
        if (ranked.length === 0) {
          warnings.push({
            stage: "search",
            message:
              "No candidates found. Check LENS_SEARCH_MODE or fixture coverage.",
          });
        }
        if (crossModel.length === 0) {
          warnings.push({
            stage: "crossModel",
            message:
              "No cross-model picks. Provider keys may be missing or rate-limited.",
          });
        }

        const result: AuditResult = {
          id: ctx.runId,
          host:
            extract.aiRecommendation.host ??
            "unknown",
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
            extract: 0,
            search: 0,
            verify: 0,
            rank: 0,
            crossModel: 0,
            total: 0,
          },
          createdAt: new Date().toISOString(),
        };

        ctx.emit("audit:completed", { runId: ctx.runId, auditId: result.id });
        return result;
      },
    },
  ],
};

registerWorkflow(spec);

export const auditWorkflow = spec;
