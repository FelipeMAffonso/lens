// IMPROVEMENT_PLAN_V2 A4b — NHTSA (vehicle) recall ingester.
// api.nhtsa.gov's /recallsByVehicle endpoint requires an exact model
// (model=ALL returns http 400), so we first enumerate models for the
// current (make, modelYear) pair via /products/vehicle/models, then fetch
// recalls per model. Each run rotates one (make, year) combination
// through MANUFACTURERS × last 3 model years.

import type { DatasetIngester, IngestionContext, IngestionReport } from "../framework.js";

const SOURCE_ID = "nhtsa-recalls";
const MODELS_PER_RUN = 15;

const MANUFACTURERS = [
  "FORD", "TOYOTA", "HONDA", "NISSAN", "HYUNDAI", "KIA",
  "CHEVROLET", "TESLA", "VOLKSWAGEN", "BMW", "MERCEDES-BENZ",
  "SUBARU", "MAZDA", "JEEP", "RAM", "DODGE", "CHRYSLER",
  "GMC", "CADILLAC", "BUICK", "LEXUS", "ACURA", "INFINITI",
  "VOLVO", "AUDI", "PORSCHE", "LAND ROVER", "JAGUAR",
  "MITSUBISHI", "MINI", "ALFA ROMEO", "FIAT", "GENESIS",
];

interface ModelRow { modelYear?: string; make?: string; model?: string }
interface RecallRow {
  NHTSACampaignNumber?: string; Manufacturer?: string; ReportReceivedDate?: string;
  Component?: string; Summary?: string; Make?: string; Model?: string; ModelYear?: string;
  Consequence?: string; Remedy?: string; parkIt?: boolean; parkOutSide?: boolean;
}

export const nhtsaRecallsIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 180_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = { rowsSeen: 0, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };
    const logLines: string[] = [];

    const idx = await readIdx(ctx);
    const mfg = MANUFACTURERS[idx % MANUFACTURERS.length]!;
    const thisYear = new Date().getFullYear();
    const year = thisYear - (Math.floor(idx / MANUFACTURERS.length) % 3);
    logLines.push(`idx=${idx} mfg=${mfg} year=${year}`);

    // Step 1 — enumerate models with recalls for this (make, year).
    let models: ModelRow[];
    try {
      const res = await fetch(
        `https://api.nhtsa.gov/products/vehicle/models?modelYear=${year}&make=${encodeURIComponent(mfg)}&issueType=r`,
        { headers: browserHeaders(), signal: ctx.signal },
      );
      if (!res.ok) throw new Error(`models http ${res.status}`);
      const body = (await res.json()) as { results?: ModelRow[] };
      models = body.results ?? [];
    } catch (err) {
      counters.errors.push((err as Error).message);
      await writeIdx(ctx, idx + 1);
      counters.log = logLines.join("\n");
      return counters;
    }

    // Normalize + dedupe model names. The /products endpoint returns
    // trim-level variants like "F-150 (SUPER CAB) GAS" which /recallsByVehicle
    // can't resolve (returns HTTP 400). Strip parenthetical qualifiers and
    // trailing fuel/drivetrain suffixes to land on the canonical model name.
    const normalize = (m: string) =>
      m
        .replace(/\([^)]*\)/g, " ") // drop parenthetical trim indicators
        .replace(/\b(GAS|DIESEL|HEV|PHEV|EV|HYBRID|ELECTRIC|AWD|FWD|RWD|4WD|2WD)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    const seen = new Set<string>();
    const uniqModels = models
      .map((m) => normalize(m.model ?? ""))
      .filter((m) => m && !seen.has(m) && seen.add(m))
      .slice(0, MODELS_PER_RUN);
    logLines.push(`models=${uniqModels.length}`);

    // Step 2 — for each model, fetch recalls and upsert.
    for (const model of uniqModels) {
      if (ctx.signal.aborted) break;
      let rows: RecallRow[] = [];
      try {
        const url = `https://api.nhtsa.gov/recalls/recallsByVehicle?make=${encodeURIComponent(mfg)}&modelYear=${year}&model=${encodeURIComponent(model)}`;
        const res = await fetch(url, { headers: browserHeaders(), signal: ctx.signal });
        if (!res.ok) { counters.errors.push(`${model}: ${res.status}`); continue; }
        const body = (await res.json()) as { results?: RecallRow[] };
        rows = body.results ?? [];
      } catch (err) {
        counters.errors.push(`${model}: ${(err as Error).message}`);
        continue;
      }
      counters.rowsSeen += rows.length;
      if (rows.length === 0) continue;

      const stmts: unknown[] = [];
      for (const r of rows) {
        const extId = (r.NHTSACampaignNumber ?? "").trim();
        if (!extId) { counters.rowsSkipped++; continue; }
        const title = `${mfg} ${r.Model ?? model} ${r.ModelYear ?? year}: ${r.Component ?? ""}`.slice(0, 240);
        const productMatch = JSON.stringify({
          brands: [mfg],
          products: [{ make: r.Make ?? mfg, model: r.Model ?? model, year: r.ModelYear ?? year, component: r.Component }],
        });
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO recall (id, source_id, external_id, title, product_match_json, severity, hazard, published_at, url, remedy, raw_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            r.parkIt ? "park-it" : r.parkOutSide ? "park-outside" : "recall",
            inferHazard((r.Component ?? "") + " " + (r.Summary ?? "")),
            parseDate(r.ReportReceivedDate) ?? new Date().toISOString().slice(0, 19),
            `https://www.nhtsa.gov/recalls?nhtsaId=${encodeURIComponent(extId)}`,
            r.Remedy ?? r.Consequence ?? null,
            JSON.stringify(r).slice(0, 32_000),
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
      await ctx.progress({});
    }

    await writeIdx(ctx, idx + 1);
    counters.log = logLines.join("\n");
    return counters;
  },
};

function browserHeaders(): Record<string, string> {
  return {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nhtsa.gov/",
  };
}

function inferHazard(s: string): string {
  const low = s.toLowerCase();
  if (/fire|burn|thermal/.test(low)) return "fire";
  if (/airbag|inflator/.test(low)) return "airbag";
  if (/brake|brak/.test(low)) return "brake-failure";
  if (/fuel|leak/.test(low)) return "fuel-leak";
  if (/steering|steer/.test(low)) return "steering";
  if (/tire/.test(low)) return "tire";
  if (/seat|belt/.test(low)) return "restraint";
  if (/electr|battery|charger|voltage/.test(low)) return "electrical";
  return "other";
}

function parseDate(d?: string): string | null {
  if (!d) return null;
  // NHTSA returns "MM/DD/YYYY" or ISO. Normalize to ISO prefix.
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const mm = m[1]!.padStart(2, "0"); const dd = m[2]!.padStart(2, "0"); const yy = m[3]!;
    return `${yy}-${mm}-${dd}T00:00:00`;
  }
  const t = Date.parse(d);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 19);
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
