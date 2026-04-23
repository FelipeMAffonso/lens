// IMPROVEMENT_PLAN_V2 A12b — triangulation engine (specs).
// Per-SKU consensus over sku_source_link.specs_json. For each spec key
// seen in ≥2 sources we pick a consensus value (majority for
// categorical, median for numeric), write to sku_spec, and log
// discrepancies (>15% numeric delta, or any categorical disagreement)
// into discrepancy_log. Runs hourly on the `41 * * * *` cron alongside
// price triangulation.

import type { Env } from "../index.js";

const DISCREPANCY_THRESHOLD = 0.15;
const MAX_SKUS_PER_RUN = 500;
const MAX_KEYS_PER_SKU = 30;

// Numeric + unit-bearing spec keys we care to triangulate. Categorical
// (like retailer, dealUrl, img) are best-effort but only numeric deltas
// feed discrepancy_log.
const NUMERIC_KEYS = new Set([
  "mass", "weight", "height", "width", "depth",
  "battery_life", "cpu_frequency", "ram", "storage",
  "display_resolution", "cvss_score", "rating",
  "lowestPrice", "highestPrice", "priceCents",
]);

export async function runSpecTriangulation(env: Env): Promise<{
  skusProcessed: number;
  specsWritten: number;
  discrepanciesLogged: number;
}> {
  if (!env.LENS_D1) return { skusProcessed: 0, specsWritten: 0, discrepanciesLogged: 0 };

  // SKUs with ≥2 source links that have specs_json.
  const { results: targets } = await env.LENS_D1.prepare(
    `SELECT ssl.sku_id, COUNT(*) AS n
       FROM sku_source_link ssl
      WHERE ssl.active = 1 AND ssl.specs_json IS NOT NULL
        AND LENGTH(ssl.specs_json) > 10
      GROUP BY ssl.sku_id
     HAVING n >= 2
      ORDER BY RANDOM()
      LIMIT ?`,
  ).bind(MAX_SKUS_PER_RUN).all<{ sku_id: string; n: number }>();

  const skuIds = (targets ?? []).map((t) => t.sku_id);
  let specsWritten = 0;
  let discrepanciesLogged = 0;

  const BATCH = 30;
  for (let i = 0; i < skuIds.length; i += BATCH) {
    const group = skuIds.slice(i, i + BATCH);
    const placeholders = group.map(() => "?").join(",");
    const { results: rows } = await env.LENS_D1.prepare(
      `SELECT sku_id, source_id, specs_json
         FROM sku_source_link
        WHERE sku_id IN (${placeholders}) AND active = 1
          AND specs_json IS NOT NULL`,
    ).bind(...group).all<{ sku_id: string; source_id: string; specs_json: string }>();

    // Collect per-sku, per-key values.
    const perSku = new Map<string, Map<string, Array<{ source: string; val: unknown }>>>();
    for (const r of rows ?? []) {
      let specs: Record<string, unknown>;
      try { specs = JSON.parse(r.specs_json) as Record<string, unknown>; } catch { continue; }
      if (!perSku.has(r.sku_id)) perSku.set(r.sku_id, new Map());
      const m = perSku.get(r.sku_id)!;
      for (const [k, v] of Object.entries(specs)) {
        if (k.startsWith("_") || k.length > 60 || v == null) continue;
        if (!m.has(k)) m.set(k, []);
        const arr = m.get(k)!;
        if (arr.length < 8) arr.push({ source: r.source_id, val: v });
      }
    }

    // For each sku × key, compute consensus and log disagreements.
    const stmts: unknown[] = [];
    for (const [skuId, keyMap] of perSku) {
      let keysDone = 0;
      for (const [key, vals] of keyMap) {
        if (keysDone >= MAX_KEYS_PER_SKU) break;
        if (vals.length < 2) continue;
        keysDone++;

        // Numeric path.
        const nums = vals
          .map((v) => ({ source: v.source, num: toNum(v.val) }))
          .filter((x) => x.num != null) as Array<{ source: string; num: number }>;
        const isNumeric = NUMERIC_KEYS.has(key) || nums.length === vals.length;
        if (isNumeric && nums.length >= 2) {
          const sorted = nums.slice().sort((a, b) => a.num - b.num);
          const mid = sorted[Math.floor(sorted.length / 2)]!;
          stmts.push(
            env.LENS_D1!.prepare(
              `INSERT INTO sku_spec (sku_id, key, value_num, unit, source_id, confidence, observed_at)
               VALUES (?, ?, ?, NULL, ?, ?, datetime('now'))
               ON CONFLICT(sku_id, key, source_id) DO UPDATE SET
                 value_num = excluded.value_num,
                 confidence = excluded.confidence,
                 observed_at = excluded.observed_at`,
            ).bind(skuId, key, mid.num, `triangulated:${nums.length}`, Math.min(1, 0.5 + 0.1 * nums.length)),
          );
          specsWritten++;
          // Discrepancy pass: first pair >15% delta
          for (let a = 0; a < nums.length; a++) {
            for (let b = a + 1; b < nums.length; b++) {
              const va = nums[a]!.num; const vb = nums[b]!.num;
              const max = Math.max(Math.abs(va), Math.abs(vb));
              if (max === 0) continue;
              const delta = Math.abs(va - vb) / max;
              if (delta > DISCREPANCY_THRESHOLD) {
                stmts.push(
                  env.LENS_D1!.prepare(
                    `INSERT INTO discrepancy_log (sku_id, field, source_a, source_b, value_a, value_b, delta_pct, flagged_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
                  ).bind(skuId, `spec.${key}`.slice(0, 80), nums[a]!.source, nums[b]!.source, String(va), String(vb), delta),
                );
                discrepanciesLogged++;
                break;
              }
            }
            if (discrepanciesLogged > 0) break;
          }
        } else {
          // Categorical: majority vote.
          const counts = new Map<string, Array<string>>();
          for (const v of vals) {
            const s = String(v.val).slice(0, 200);
            if (!counts.has(s)) counts.set(s, []);
            counts.get(s)!.push(v.source);
          }
          let winner: [string, string[]] | null = null;
          for (const [val, srcs] of counts) {
            if (!winner || srcs.length > winner[1].length) winner = [val, srcs];
          }
          if (!winner) continue;
          stmts.push(
            env.LENS_D1!.prepare(
              `INSERT INTO sku_spec (sku_id, key, value_text, value_num, unit, source_id, confidence, observed_at)
               VALUES (?, ?, ?, NULL, NULL, ?, ?, datetime('now'))
               ON CONFLICT(sku_id, key, source_id) DO UPDATE SET
                 value_text = excluded.value_text,
                 confidence = excluded.confidence,
                 observed_at = excluded.observed_at`,
            ).bind(skuId, key, winner[0], `triangulated:${winner[1].length}`, Math.min(1, 0.5 + 0.1 * winner[1].length)),
          );
          specsWritten++;
          // Disagreement: if any other value group exists, log first conflict.
          if (counts.size > 1) {
            const [a, b] = Array.from(counts.entries()).slice(0, 2);
            if (a && b && a[0] !== b[0]) {
              stmts.push(
                env.LENS_D1!.prepare(
                  `INSERT INTO discrepancy_log (sku_id, field, source_a, source_b, value_a, value_b, delta_pct, flagged_at)
                   VALUES (?, ?, ?, ?, ?, ?, NULL, datetime('now'))`,
                ).bind(skuId, `spec.${key}`.slice(0, 80), a[1]![0], b[1]![0], a[0].slice(0, 200), b[0].slice(0, 200)),
              );
              discrepanciesLogged++;
            }
          }
        }
      }
    }

    if (stmts.length > 0) {
      try {
        // D1 batch cap ≈100 stmts — split if needed.
        for (let j = 0; j < stmts.length; j += 80) {
          await (env.LENS_D1 as unknown as { batch(s: unknown[]): Promise<unknown[]> })
            .batch(stmts.slice(j, j + 80));
        }
      } catch { /* best-effort — next hour retries */ }
    }
  }

  return { skusProcessed: skuIds.length, specsWritten, discrepanciesLogged };
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[,_]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
