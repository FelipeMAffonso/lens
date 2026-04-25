import type { Context } from "hono";
import { CustomerJourneyMapSchema } from "@lens/shared";
import type { Env } from "../index.js";
import { buildCustomerJourneyMap } from "./map.js";
import { workflowStats } from "../workflow/registry.js";
import { packStats } from "../packs/registry.js";

export async function handleCustomerJourneyMap(c: Context<{ Bindings: Env }>): Promise<Response> {
  let totalPacks = 0;
  try {
    const stats = packStats();
    totalPacks = typeof stats.totalPacks === "number" ? stats.totalPacks : 0;
  } catch {
    totalPacks = 0;
  }

  const workflowIds = workflowStats().ids;
  const sourceCount = await readSourceCount(c.env).catch(() => undefined);
  const body = buildCustomerJourneyMap({
    workflowIds,
    totalPacks,
    ...(sourceCount !== undefined ? { sourceCount } : {}),
  });

  const parsed = CustomerJourneyMapSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "journey_map_invalid", issues: parsed.error.issues }, 500);
  }

  return c.json(parsed.data, 200, { "cache-control": "public, max-age=60" });
}

async function readSourceCount(env: Env): Promise<number | undefined> {
  if (!env.LENS_D1) return undefined;
  const row = await env.LENS_D1.prepare("SELECT COUNT(*) AS n FROM data_source").first<{ n: number }>();
  return typeof row?.n === "number" ? row.n : undefined;
}
