// IMPROVEMENT_PLAN_V2 A4b — NHTSA (vehicle) recall ingester.
// API: https://api.nhtsa.gov/recalls/recallsByManufacturer?manufacturer=X
// Uses the SafetyRatings/recalls endpoint for bulk discovery.
// Each NHTSA recall → `recall` row with source_id="nhtsa-recalls".

import type { DatasetIngester, IngestionContext, IngestionReport } from "../framework.js";

const SOURCE_ID = "nhtsa-recalls";

// Rotates through major manufacturers; per-run pulls all active recalls for
// one manufacturer, then advances the cursor.
const MANUFACTURERS = [
  "Ford",
  "General Motors",
  "Toyota",
  "Honda",
  "Nissan",
  "Hyundai",
  "Kia",
  "Stellantis",
  "Tesla",
  "Volkswagen",
  "BMW",
  "Mercedes-Benz",
  "Subaru",
  "Mazda",
];

export const nhtsaRecallsIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 180_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = { rowsSeen: 0, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };
    const logLines: string[] = [];

    const idx = await readIdx(ctx);
    const mfg = MANUFACTURERS[idx % MANUFACTURERS.length]!;
    logLines.push(`mfg=${mfg} (idx ${idx})`);
    const url = `https://api.nhtsa.gov/recalls/recallsByManufacturer?manufacturer=${encodeURIComponent(mfg)}`;

    let body: { results?: Array<Record<string, string>> };
    try {
      const res = await fetch(url, { headers: { "User-Agent": "LensBot/1.0" }, signal: ctx.signal });
      if (!res.ok) throw new Error(`http ${res.status}`);
      body = (await res.json()) as { results?: Array<Record<string, string>> };
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
        const extId = (r.NHTSACampaignNumber ?? r.Campaign ?? "").trim();
        if (!extId) {
          counters.rowsSkipped++;
          continue;
        }
        const title = `${mfg} ${r.Component ?? ""} ${r.Summary ?? ""}`.slice(0, 240);
        const productMatch = JSON.stringify({
          brands: [mfg],
          products: [{ make: r.Make, model: r.Model, year: r.ModelYear, component: r.Component }],
        });
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO recall (id, source_id, external_id, title, product_match_json, severity, hazard, published_at, url, remedy, raw_json)
             VALUES (?, ?, ?, ?, ?, 'recall', ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               title = excluded.title,
               product_match_json = excluded.product_match_json,
               severity = excluded.severity,
               raw_json = excluded.raw_json`,
          ).bind(
            `nhtsa:${extId}`,
            SOURCE_ID,
            extId,
            title,
            productMatch,
            inferHazard(r.Component ?? r.Summary ?? ""),
            (r.ReportReceivedDate ?? new Date().toISOString()).slice(0, 19),
            `https://www.nhtsa.gov/recalls?nhtsaId=${encodeURIComponent(extId)}`,
            r.Conequence ?? r.Remedy ?? null,
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

    await writeIdx(ctx, idx + 1);
    counters.log = logLines.join("\n");
    return counters;
  },
};

function inferHazard(s: string): string {
  const low = s.toLowerCase();
  if (/fire|burn|thermal/.test(low)) return "fire";
  if (/airbag|inflator/.test(low)) return "airbag";
  if (/brake|brak/.test(low)) return "brake-failure";
  if (/fuel|leak/.test(low)) return "fuel-leak";
  if (/steering|steer/.test(low)) return "steering";
  if (/tire/.test(low)) return "tire";
  if (/seat|belt/.test(low)) return "restraint";
  return "other";
}

async function readIdx(ctx: IngestionContext): Promise<number> {
  const row = await ctx.env.LENS_D1!.prepare("SELECT last_error FROM data_source WHERE id = ?")
    .bind(SOURCE_ID)
    .first<{ last_error: string | null }>();
  try {
    const p = JSON.parse(row?.last_error ?? "{}");
    return typeof p.idx === "number" ? p.idx : 0;
  } catch {
    return 0;
  }
}

async function writeIdx(ctx: IngestionContext, idx: number): Promise<void> {
  await ctx.env.LENS_D1!.prepare("UPDATE data_source SET last_error = ? WHERE id = ?")
    .bind(JSON.stringify({ idx }), SOURCE_ID)
    .run();
}