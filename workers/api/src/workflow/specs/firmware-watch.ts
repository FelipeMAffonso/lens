// S7-W38 — firmware.watch workflow spec. Registered at import-time so the
// cron dispatcher (wrangler.toml "31 7 * * 1") finds a target.

import { registerWorkflow } from "../registry.js";
import type { WorkflowSpec } from "../spec.js";
import { fetchAdvisories } from "../../firmware/source.js";
import { matchFirmware } from "../../firmware/matcher.js";
import { assessMatches } from "../../firmware/assess.js";
import type { FirmwareAdvisory, PurchaseLike } from "../../firmware/types.js";
import { createIntervention } from "../../db/repos/interventions.js";

interface FirmwareWatchInput {
  userIds?: string[];
}

interface FirmwareWatchOutput {
  advisoriesLoaded: number;
  usersScanned: number;
  matched: number;
  interventions: number;
}

const spec: WorkflowSpec<FirmwareWatchInput, FirmwareWatchOutput> = {
  id: "firmware.watch",
  version: "1.0.0",
  description:
    "Weekly cron: fetch firmware/CVE advisories + cross-reference against connected-device purchases for every user, writing interventions for critical/high matches.",
  finalNodeId: "summarize",
  nodes: [
    {
      id: "fetch-advisories",
      label: "Fetch advisories (fixture mode by default)",
      timeoutMs: 15_000,
      handler: async (_input, ctx) => {
        const env = ctx.env as { LENS_FIRMWARE_MODE?: string };
        const advisories = await fetchAdvisories(env);
        ctx.log("info", "firmware.advisories", { count: advisories.length });
        return advisories;
      },
    },
    {
      id: "scan-users",
      label: "Scan every user's purchases",
      inputsFrom: ["fetch-advisories"],
      timeoutMs: 60_000,
      handler: async (input, ctx) => {
        const advisories = input as FirmwareAdvisory[];
        const env = ctx.env as { LENS_D1?: unknown };
        const d1 = env.LENS_D1;
        if (!d1) {
          ctx.log("warn", "firmware.no-d1-binding");
          return { advisoriesLoaded: advisories.length, usersScanned: 0, matched: 0, interventions: 0 };
        }
        const typedD1 = d1 as {
          prepare: (sql: string) => {
            bind: (...values: unknown[]) => {
              all: <T>() => Promise<{ results: T[] }>;
            };
          };
        };
        const users = await typedD1
          .prepare(`SELECT DISTINCT user_id FROM purchases WHERE user_id IS NOT NULL LIMIT 1000`)
          .bind()
          .all<{ user_id: string }>();
        const userIds = (users.results ?? []).map((r) => r.user_id);
        let matched = 0;
        let interventionsCount = 0;
        for (const uid of userIds) {
          const res = await typedD1
            .prepare(
              `SELECT id, user_id, product_name, brand, category, purchased_at
               FROM purchases WHERE user_id = ? ORDER BY purchased_at DESC LIMIT 500`,
            )
            .bind(uid)
            .all<PurchaseLike>();
          const purchases = res.results ?? [];
          const assessed = assessMatches(matchFirmware(advisories, purchases));
          matched += assessed.length;
          for (const m of assessed) {
            if (!m.shouldNotify) continue;
            await createIntervention(d1 as never, {
              userId: uid,
              packSlug: "advisory/apply-firmware-update",
              payload: { advisory: m.advisory, score: m.score, reasons: m.reasons, band: m.band },
              relatedPurchaseId: m.purchase.id,
            }).catch((e: Error) => {
              ctx.log("warn", "firmware.intervention-insert-failed", { err: { message: e.message } });
            });
            interventionsCount += 1;
          }
        }
        return {
          advisoriesLoaded: advisories.length,
          usersScanned: userIds.length,
          matched,
          interventions: interventionsCount,
        };
      },
    },
    {
      id: "summarize",
      label: "Summarize run",
      inputsFrom: ["scan-users"],
      handler: async (input, _ctx) => input as FirmwareWatchOutput,
    },
  ],
};

registerWorkflow(spec);

export default spec;
