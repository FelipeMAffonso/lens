// IMPROVEMENT_PLAN_V2 A4c — FDA device & drug recall ingester.
// Endpoint: https://api.fda.gov/device/recall.json?limit=100&skip=<offset>
// Also: https://api.fda.gov/drug/enforcement.json for drug recalls.
// Rotates between the two every other run.

import type { DatasetIngester, IngestionContext, IngestionReport } from "../framework.js";

const SOURCE_ID = "fda-recalls";
const PAGE_SIZE = 100;

const PROGRAMS = [
  { kind: "device" as const, base: "https://api.fda.gov/device/recall.json" },
  { kind: "drug" as const, base: "https://api.fda.gov/drug/enforcement.json" },
];

export const fdaRecallsIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 180_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = { rowsSeen: 0, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };
    const logLines: string[] = [];

    const state = await readState(ctx);
    const program = PROGRAMS[state.programIndex % PROGRAMS.length]!;
    const url = `${program.base}?limit=${PAGE_SIZE}&skip=${state.offset}`;
    logLines.push(`program=${program.kind} offset=${state.offset}`);

    let body: { results?: Array<Record<string, string>>; error?: { message?: string } };
    try {
      const res = await fetch(url, { headers: { "User-Agent": "LensBot/1.0" }, signal: ctx.signal });
      if (res.status === 404) {
        // openFDA returns 404 when offset exceeds result count — advance.
        await writeState(ctx, { programIndex: state.programIndex + 1, offset: 0 });
        counters.log = `${logLines.join("\n")}\nend of ${program.kind} dataset`;
        return counters;
      }
      if (!res.ok) throw new Error(`http ${res.status}`);
      body = (await res.json()) as typeof body;
    } catch (err) {
      counters.errors.push((err as Error).message);
      counters.log = logLines.join("\n");
      return counters;
    }
    const rows = body.results ?? [];
    counters.rowsSeen = rows.length;

    const BATCH = 20;
    for (let i = 0; i < rows.length; i += BATCH) {
      if (ctx.signal.aborted) break;
      const stmts: unknown[] = [];
      for (const r of rows.slice(i, i + BATCH)) {
        const extId = (r.recall_number ?? r.event_id ?? r.res_event_number ?? "").trim();
        if (!extId) {
          counters.rowsSkipped++;
          continue;
        }
        const title = (r.product_description ?? r.openfda?.[0] ?? "FDA Recall").toString().slice(0, 240);
        const productMatch = JSON.stringify({
          brands: r.recalling_firm ? [r.recalling_firm] : [],
          products: [{ name: r.product_description, classification: r.classification ?? r.product_type }],
        });
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO recall (id, source_id, external_id, title, product_match_json, severity, hazard, published_at, url, remedy, raw_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               title = excluded.title,
               product_match_json = excluded.product_match_json,
               raw_json = excluded.raw_json`,
          ).bind(
            `fda:${program.kind}:${extId}`,
            SOURCE_ID,
            extId,
            title,
            productMatch,
            inferSeverity(r.classification ?? ""),
            inferHazardFda(r.reason_for_recall ?? ""),
            (r.recall_initiation_date ?? new Date().toISOString()).slice(0, 19),
            `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfRES/res.cfm?ID=${encodeURIComponent(extId)}`,
            r.recall_action ?? null,
            JSON.stringify(r).slice(0, 64_000),
          ),
        );
      }
      if (stmts.length === 0) continue;
      try {
        await (ctx.env.LENS_D1 as unknown as { batch(s: unknown[]): Promise<unknown[]> }).batch(stmts);
        counters.rowsUpserted += stmts.length;
      } catch (err) {
        if (counters.errors.length < 10) counters.errors.push((err as Error).message);
      }
      if ((i / BATCH) % 10 === 0) await ctx.progress({});
    }

    const nextOffset = rows.length === PAGE_SIZE ? state.offset + PAGE_SIZE : 0;
    const nextProgramIndex = rows.length === PAGE_SIZE ? state.programIndex : state.programIndex + 1;
    await writeState(ctx, { programIndex: nextProgramIndex, offset: nextOffset });
    counters.log = logLines.join("\n");
    return counters;
  },
};

function inferSeverity(cls: string): string {
  if (cls === "Class I") return "recall";
  if (cls === "Class II") return "warning";
  if (cls === "Class III") return "advisory";
  return "recall";
}

function inferHazardFda(reason: string): string {
  const low = reason.toLowerCase();
  if (/contamination|listeria|salmonella|e\.?\s*coli/.test(low)) return "contamination";
  if (/allerg/.test(low)) return "allergen";
  if (/mislabel/.test(low)) return "mislabeling";
  if (/foreign|metal|plastic/.test(low)) return "foreign-object";
  if (/potency|sub-?potent|super-?potent/.test(low)) return "potency";
  return "other";
}

async function readState(ctx: IngestionContext): Promise<{ programIndex: number; offset: number }> {
  const row = await ctx.env.LENS_D1!.prepare("SELECT last_error FROM data_source WHERE id = ?")
    .bind(SOURCE_ID)
    .first<{ last_error: string | null }>();
  try {
    const p = JSON.parse(row?.last_error ?? "{}");
    return {
      programIndex: typeof p.programIndex === "number" ? p.programIndex : 0,
      offset: typeof p.offset === "number" ? p.offset : 0,
    };
  } catch {
    return { programIndex: 0, offset: 0 };
  }
}

async function writeState(ctx: IngestionContext, s: { programIndex: number; offset: number }): Promise<void> {
  await ctx.env.LENS_D1!.prepare("UPDATE data_source SET last_error = ? WHERE id = ?")
    .bind(JSON.stringify(s), SOURCE_ID)
    .run();
}