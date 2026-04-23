// IMPROVEMENT_PLAN_V2 Phase B + C hybrid — Lens Triggers (content-free
// privacy-preserving passive-monitoring). Spec: docs/TRIGGERS.md.
//
// Three endpoints:
//   POST /triggers/report     — receive a hash-only event from browser/PWA
//   GET  /triggers/definitions — fetch the current catalog (versioned)
//   GET  /triggers/aggregate  — k-anonymity ≥ 5 aggregates for public ticker

import type { Context } from "hono";
import { z } from "zod";
import type { Env } from "../index.js";

const K_ANON_MIN = 5;

export const TriggerReportSchema = z.object({
  trigger_id: z.string().min(1).max(80),
  host: z.string().max(200).default("email"),
  ts: z.string().max(40), // ISO string minute-resolution
  hit_hash: z.string().regex(/^[0-9a-f]{16,128}$/, "hit_hash must be hex"),
});

export async function handleTriggerReport(c: Context<{ Bindings: Env }>): Promise<Response> {
  const body = await c.req.json().catch(() => null);
  const parsed = TriggerReportSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  if (!c.env.LENS_D1) {
    return c.json({ error: "d1_not_bound" }, 503);
  }
  try {
    await c.env.LENS_D1.prepare(
      `INSERT INTO trigger_hit (trigger_id, host, hit_hash, occurred_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(trigger_id, host, hit_hash, occurred_at) DO NOTHING`,
    )
      .bind(parsed.data.trigger_id, parsed.data.host, parsed.data.hit_hash, parsed.data.ts)
      .run();
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: "db", message: (err as Error).message }, 500);
  }
}

export async function handleTriggerDefinitions(c: Context<{ Bindings: Env }>): Promise<Response> {
  if (!c.env.LENS_D1) return c.json({ triggers: [], bootstrapping: true });
  try {
    const { results } = await c.env.LENS_D1.prepare(
      `SELECT id, category, severity, pack_slug, title, description, version
         FROM trigger_catalog
        WHERE retired = 0
        ORDER BY category, id`,
    ).all();
    return c.json({ triggers: results ?? [] }, 200, { "cache-control": "public, max-age=300" });
  } catch (err) {
    return c.json({ triggers: [], error: (err as Error).message });
  }
}

export async function handleTriggerAggregate(c: Context<{ Bindings: Env }>): Promise<Response> {
  const triggerId = c.req.query("trigger_id");
  const host = c.req.query("host");
  const window = c.req.query("window") ?? "7d";
  const days = window.endsWith("d") ? parseInt(window, 10) : 7;
  if (!c.env.LENS_D1) return c.json({ error: "d1_not_bound" }, 503);

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const conditions: string[] = ["reported_at >= ?"];
  const binds: unknown[] = [since];
  if (triggerId) {
    conditions.push("trigger_id = ?");
    binds.push(triggerId);
  }
  if (host) {
    conditions.push("host = ?");
    binds.push(host);
  }

  try {
    const { results } = await c.env.LENS_D1.prepare(
      `SELECT trigger_id, host,
              COUNT(*) AS hits,
              COUNT(DISTINCT hit_hash) AS distinct_devices
         FROM trigger_hit
        WHERE ${conditions.join(" AND ")}
        GROUP BY trigger_id, host
       HAVING distinct_devices >= ${K_ANON_MIN}
        ORDER BY hits DESC
        LIMIT 200`,
    ).bind(...binds).all();
    return c.json({
      window,
      k_anon_min: K_ANON_MIN,
      aggregates: results ?? [],
      computed_at: new Date().toISOString(),
    }, 200, { "cache-control": "public, max-age=60" });
  } catch (err) {
    return c.json({ error: (err as Error).message, aggregates: [] });
  }
}