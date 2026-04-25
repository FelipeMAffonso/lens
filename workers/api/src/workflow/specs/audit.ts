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
import { scrubTrackingParams } from "../../url-scrub.js";
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
        const { intent, aiRecommendation } = input as ExtractOut;
        let out = await searchCandidates(intent, env);
        // USER-REPORTED FIX (2026-04-22): URL mode was silently dropping the
        // pasted product when web_search returned empty — leaving verify with
        // nothing to cross-reference and rank with "(no candidates available)".
        // Always prepend the extracted pickedProduct as a candidate when it
        // has a real name so the user sees their product AT MINIMUM, even if
        // live web_search fails/times-out.
        const rec = aiRecommendation;
        const pp = rec.pickedProduct;
        const hasPasted =
          pp &&
          typeof pp.name === "string" &&
          pp.name.trim().length > 0 &&
          !pp.name.toLowerCase().startsWith("(no ai");
        if (hasPasted) {
          const already = out.some(
            (c) => c.name.toLowerCase() === pp.name.toLowerCase(),
          );
          if (!already) {
            const seeded = {
              name: pp.name,
              brand: pp.brand ?? "",
              price: typeof pp.price === "number" ? pp.price : null,
              currency: pp.currency ?? "USD",
              ...(pp.url ? { url: pp.url } : {}),
              // Convert any typed spec-ish claims into spec fields so rank
              // has numeric data to work with.
              specs: rec.claims.reduce<Record<string, string | number | boolean>>((acc, claim) => {
                const key = (claim.attribute ?? "").toLowerCase().replace(/\s+/g, "_");
                if (!key) return acc;
                const val = claim.statedValue;
                if (val === undefined || val === null || val === "") return acc;
                acc[key] = val;
                return acc;
              }, {}),
              attributeScores: {},
              utilityScore: 0,
              utilityBreakdown: [],
            };
            out = [seeded, ...out];
            ctx.log("info", "search:seeded-from-paste", { name: pp.name });
          }
        }
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
      label: "Verify AI claims against candidates + self-verify",
      inputsFrom: ["extract", "search"],
      timeoutMs: 120_000,
      handler: async (input, ctx) => {
        const env = ctx.env as unknown as Env;
        const { extract, search } = input as { extract: ExtractOut; search: SearchOut };
        const out = await verifyClaims(
          extract.aiRecommendation,
          search,
          extract.intent,
          env,
        );

        // improve-D-opus47 — self-verification pass. Opus 4.7 re-reads its
        // own verdicts + the evidence + user criteria, flags mistakes, we
        // apply the revisions in-place. Skipped when there are 0 claims.
        try {
          if (out.length > 0) {
            const { runSelfVerification, applyCritiques } = await import("../../verify/self-verify.js");
            const userCriteria = (extract.intent?.criteria ?? [])
              .map((c: { name?: string }) => c.name ?? "")
              .filter(Boolean)
              .join(", ");
            const critiques = await runSelfVerification(env, out, search, userCriteria);
            const applied = applyCritiques(out, critiques);
            if (applied > 0) {
              ctx.log("info", "verify:self-critiqued", { applied, total: critiques.length });
            }
          }
        } catch (err) {
          // Self-verify is advisory; never block the original verify output.
          ctx.log("warn", "verify:self-verify-error", { message: (err as Error).message });
        }

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
      // Judge P1-3: enrich only needs extract + search. Previously declared
      // `rank` as an input which made Kahn put enrich in a later batch, blocking
      // behind verify's 90s timeout even though enrich doesn't use verify or
      // ranked order. AI-pick matching works on name-substring so candidate
      // iteration order is irrelevant — insertion-order `search` works the
      // same as utility-order `rank` for the enrichment signals.
      inputsFrom: ["extract", "search"],
      // Judge P3-9: enrich is pure CPU — deterministic hash + fixture lookup +
      // Levenshtein. 20s was 100× over-provisioned. Drop to 2s so a future
      // refactor that adds I/O fails fast.
      timeoutMs: 2_000,
      handler: async (input, ctx) => {
        const env = ctx.env as unknown as Env;
        const { extract, search } = input as {
          extract: ExtractOut;
          search: SearchOut;
        };
        const aiPickName = extract.aiRecommendation.pickedProduct?.name?.toLowerCase() ?? "";
        const aiPickCandidate = aiPickName
          ? search.find(
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
              "Lens could not find defensible product candidates for this request. Try a more specific category term or paste a cleaner product URL.",
          });
        }
        if (crossModel.length === 0) {
          warnings.push({
            stage: "crossModel",
            message: "Cross-assistant comparison was skipped for this run.",
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
        // Judge P1-4: surface enrich wall-clock alongside the other stages.
        const tEnrich = await ctx.readState<number>(tsKey("enrich"));
        const tNow = Date.now();

        // Judge P0-2: defense-in-depth scrub at the assemble boundary. extract.ts
        // already scrubs URL-mode input.url before populating sourceUrl + pickedProduct.url,
        // but if any future extractor path (photo mode, Opus-fallback JSON) populates
        // these fields with an unscrubbed URL, this catches the regression before the
        // AuditResult leaves the worker.
        const scrubbedAiRec = (() => {
          const r = extract.aiRecommendation;
          const pickedUrl = r.pickedProduct?.url ? scrubTrackingParams(r.pickedProduct.url) : undefined;
          const src = r.sourceUrl ? scrubTrackingParams(r.sourceUrl) : undefined;
          return {
            ...r,
            pickedProduct: {
              ...r.pickedProduct,
              ...(pickedUrl ? { url: pickedUrl } : { url: undefined }),
            },
            ...(src ? { sourceUrl: src } : { sourceUrl: undefined }),
          };
        })();

        const result: AuditResult = {
          id: ctx.runId,
          host: scrubbedAiRec.host ?? "unknown",
          intent: extract.intent,
          aiRecommendation: scrubbedAiRec,
          candidates: ranked,
          specOptimal: ranked[0] ?? null,
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
            ...(tEnrich ? { enrich: tEnrich - tSearch } : {}),
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
