// IMPROVEMENT_PLAN_V2 A-S12b — UNSPSC taxonomy seed.
// One-shot-ish: fetches the UNSPSC level-2 "family" codes (~3000) and seeds
// category_taxonomy. Level-3 "class" (~10K) and level-4 "commodity" (~50K)
// require the full UNSPSC CSV which is not free; we get the public level-2
// from the GitHub mirror used by NPPES + many vendors.

import type { DatasetIngester, IngestionContext, IngestionReport } from "../framework.js";

const SOURCE_ID = "unspsc";
const SEED_URL = "https://raw.githubusercontent.com/datasets/unspsc/main/data/unspsc.csv";

export const unspscSeedIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 120_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = { rowsSeen: 0, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };

    // Check: if we already have >100 rows, skip (this is a one-shot seed).
    const existing = await ctx.env.LENS_D1!.prepare(
      "SELECT COUNT(*) AS n FROM category_taxonomy WHERE source = 'unspsc'",
    ).first<{ n: number }>();
    if ((existing?.n ?? 0) > 100) {
      counters.log = `unspsc already seeded (${existing?.n} rows)`;
      return counters;
    }

    let csv = "";
    try {
      const res = await fetch(SEED_URL, {
        headers: { "User-Agent": "LensBot/1.0" },
        signal: ctx.signal,
      });
      if (!res.ok) throw new Error(`http ${res.status}`);
      csv = await res.text();
    } catch (err) {
      counters.errors.push((err as Error).message);
      return counters;
    }

    const lines = csv.split(/\r?\n/);
    counters.rowsSeen = lines.length - 1;

    const BATCH = 25;
    for (let i = 1; i < lines.length; i += BATCH) {
      if (ctx.signal.aborted) break;
      const stmts: unknown[] = [];
      for (const line of lines.slice(i, i + BATCH)) {
        const cells = parseCsvRow(line);
        const code = cells[0]?.trim();
        const name = cells[1]?.trim();
        if (!code || !name || !/^\d+$/.test(code)) {
          counters.rowsSkipped++;
          continue;
        }
        // Infer level from code length (UNSPSC: 2/4/6/8 digits = segment/family/class/commodity)
        const level = code.length <= 2 ? 1 : code.length <= 4 ? 2 : code.length <= 6 ? 3 : 4;
        const parentCode = level === 1 ? null : code.slice(0, code.length - 2);
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO category_taxonomy (code, parent_code, level, name, source)
             VALUES (?, ?, ?, ?, 'unspsc')
             ON CONFLICT(code) DO UPDATE SET
               name = excluded.name,
               level = excluded.level,
               parent_code = excluded.parent_code`,
          ).bind(code, parentCode, level, name.slice(0, 200)),
        );
      }
      if (stmts.length === 0) continue;
      try {
        await (ctx.env.LENS_D1 as unknown as { batch(s: unknown[]): Promise<unknown[]> }).batch(stmts);
        counters.rowsUpserted += stmts.length;
      } catch (err) {
        if (counters.errors.length < 10) counters.errors.push((err as Error).message);
      }
      if ((i / BATCH) % 40 === 0) await ctx.progress({});
    }

    return counters;
  },
};

function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        buf += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (ch === "," && !inQ) {
      out.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  out.push(buf);
  return out;
}