// S6-W33 — real recall-watch workflow. Polls CPSC RSS + optional NHTSA/FDA
// fixtures, normalizes, matches against the purchases table, writes
// intervention drafts for matches. Runs on the daily 07:09 UTC cron (pattern
// `7 9 * * *` in cron registry).

import type { WorkflowSpec } from "../spec.js";
import { registerWorkflow } from "../registry.js";
import { fetchCpscRecalls } from "../../feeds/cpsc.js";
import { fetchNhtsaRecalls } from "../../feeds/nhtsa.js";
import { fetchFdaRecalls } from "../../feeds/fda.js";
import { matchRecalls } from "../../feeds/matcher.js";
import type { NormalizedRecall, PurchaseRow, MatchResult } from "../../feeds/types.js";

interface RecallWatchInput {
  scheduledTime?: number;
}

interface RecallWatchOutput {
  fetched: number;
  purchases: number;
  matched: number;
  notified: number;
}

interface D1Minimal {
  prepare: (sql: string) => {
    bind: (...values: unknown[]) => {
      run: () => Promise<unknown>;
      first: () => Promise<unknown>;
      all: () => Promise<{ results: unknown[] }>;
    };
  };
}

async function loadRecentPurchases(db: D1Minimal | undefined): Promise<PurchaseRow[]> {
  if (!db) return [];
  const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString();
  const res = await db
    .prepare(
      `SELECT id, user_id, product_name, brand, category, purchased_at
       FROM purchases WHERE purchased_at >= ? ORDER BY purchased_at DESC LIMIT 5000`,
    )
    .bind(twoYearsAgo)
    .all();
  return (res.results ?? []) as unknown as PurchaseRow[];
}

async function recordIntervention(
  db: D1Minimal | undefined,
  match: MatchResult,
): Promise<void> {
  if (!db) return;
  const id = `int_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO interventions (
         id, user_id, pack_slug, status, payload_json,
         related_purchase_id, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      match.purchase.user_id,
      "intervention/draft-magnuson-moss-return",
      "drafted",
      JSON.stringify({
        recall: match.recall,
        score: match.score,
        reasons: match.reasons,
      }),
      match.purchase.id,
      now,
    )
    .run()
    .catch((e: Error) => {
      // If interventions table doesn't exist yet (F2 not fully applied), log + continue.
      console.error("[recall.watch] intervention insert failed:", e.message);
    });
}

const spec: WorkflowSpec<RecallWatchInput, RecallWatchOutput> = {
  id: "recall.watch",
  version: "1.0.0",
  description:
    "Poll CPSC + NHTSA + FDA recall feeds. Cross-reference against user purchase history using brand + product-name + date matcher (threshold 0.7). Draft Magnuson-Moss return interventions for matches.",
  finalNodeId: "summarize",
  nodes: [
    {
      id: "fetch-cpsc",
      label: "Fetch CPSC RSS",
      timeoutMs: 15_000,
      retry: { maxAttempts: 2, backoffMs: 2000 },
      handler: async (_input, ctx) => {
        try {
          const recalls = await fetchCpscRecalls();
          ctx.log("info", "recall.cpsc", { count: recalls.length });
          return recalls;
        } catch (e) {
          ctx.log("warn", "recall.cpsc.failed", { err: { message: (e as Error).message } });
          return [] as NormalizedRecall[];
        }
      },
    },
    {
      id: "fetch-nhtsa",
      label: "Fetch NHTSA recalls",
      timeoutMs: 15_000,
      handler: async (_input, ctx) => {
        try {
          const recalls = await fetchNhtsaRecalls();
          ctx.log("info", "recall.nhtsa", { count: recalls.length });
          return recalls;
        } catch (e) {
          ctx.log("warn", "recall.nhtsa.failed", { err: { message: (e as Error).message } });
          return [] as NormalizedRecall[];
        }
      },
    },
    {
      id: "fetch-fda",
      label: "Fetch FDA recalls",
      timeoutMs: 15_000,
      handler: async (_input, ctx) => {
        try {
          const recalls = await fetchFdaRecalls();
          ctx.log("info", "recall.fda", { count: recalls.length });
          return recalls;
        } catch (e) {
          ctx.log("warn", "recall.fda.failed", { err: { message: (e as Error).message } });
          return [] as NormalizedRecall[];
        }
      },
    },
    {
      id: "load-purchases",
      label: "Load recent purchases from D1",
      timeoutMs: 10_000,
      handler: async (_input, ctx) => {
        const env = ctx.env as { LENS_D1?: unknown };
        const rows = await loadRecentPurchases(env.LENS_D1 as never);
        ctx.log("info", "recall.purchases", { count: rows.length });
        return rows;
      },
    },
    {
      id: "match",
      label: "Match recalls × purchases",
      inputsFrom: ["fetch-cpsc", "fetch-nhtsa", "fetch-fda", "load-purchases"],
      timeoutMs: 30_000,
      handler: async (inputs, ctx) => {
        const {
          "fetch-cpsc": cpsc,
          "fetch-nhtsa": nhtsa,
          "fetch-fda": fda,
          "load-purchases": purchases,
        } = inputs as {
          "fetch-cpsc": NormalizedRecall[];
          "fetch-nhtsa": NormalizedRecall[];
          "fetch-fda": NormalizedRecall[];
          "load-purchases": PurchaseRow[];
        };
        const all = [...cpsc, ...nhtsa, ...fda];
        const matches = matchRecalls(all, purchases);
        ctx.log("info", "recall.matches", { matchCount: matches.length, recallCount: all.length });
        return { recalls: all, purchases, matches };
      },
    },
    {
      id: "notify",
      label: "Record intervention drafts",
      inputsFrom: ["match"],
      timeoutMs: 30_000,
      handler: async (input, ctx) => {
        const { matches } = input as {
          recalls: NormalizedRecall[];
          purchases: PurchaseRow[];
          matches: MatchResult[];
        };
        const env = ctx.env as { LENS_D1?: unknown };
        let notified = 0;
        for (const m of matches) {
          await recordIntervention(env.LENS_D1 as never, m);
          ctx.emit("recall:detected", {
            userId: m.purchase.user_id,
            purchaseId: m.purchase.id,
            recallId: m.recall.recallId,
          });
          notified += 1;
        }
        return notified;
      },
    },
    {
      id: "summarize",
      inputsFrom: ["match", "notify"],
      timeoutMs: 3000,
      handler: async (inputs): Promise<RecallWatchOutput> => {
        const { match, notify } = inputs as {
          match: {
            recalls: NormalizedRecall[];
            purchases: PurchaseRow[];
            matches: MatchResult[];
          };
          notify: number;
        };
        return {
          fetched: match.recalls.length,
          purchases: match.purchases.length,
          matched: match.matches.length,
          notified: notify,
        };
      },
    },
  ],
};

registerWorkflow(spec);

export const recallWatchWorkflow = spec;
