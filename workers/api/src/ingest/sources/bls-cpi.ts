// IMPROVEMENT_PLAN_V2 A-S8c — BLS Consumer Price Index.
// Provides inflation-anchored context for Lens's price audits: a claim
// like "this mattress is $2,400 — 25% below list" means something
// different in 2024 than 2018 if cumulative CPI-U is +22% in between.
// We ingest the monthly CPI-U (All Items) series + a handful of
// consumer-category sub-indexes. Public API, no key needed on the
// v2 endpoint for low-volume use.

import type { DatasetIngester, IngestionContext, IngestionReport } from "../framework.js";

const SOURCE_ID = "bls-cpi";

// https://data.bls.gov/cgi-bin/surveymost?cu — series IDs we care about.
const SERIES = [
  { id: "CUUR0000SA0", label: "CPI-U All Items" },
  { id: "CUUR0000SA0L1E", label: "CPI-U All Items less food and energy" },
  { id: "CUUR0000SAF1", label: "Food" },
  { id: "CUUR0000SEHA", label: "Rent of primary residence" },
  { id: "CUUR0000SETA01", label: "New vehicles" },
  { id: "CUUR0000SETA02", label: "Used cars and trucks" },
  { id: "CUUR0000SEFV", label: "Food away from home" },
  { id: "CUUR0000SAH1", label: "Shelter" },
  { id: "CUUR0000SAM", label: "Medical care" },
  { id: "CUUR0000SAE1", label: "Education" },
  { id: "CUUR0000SAE2", label: "Communication" },
];

interface BlsDatum { year?: string; period?: string; periodName?: string; value?: string; latest?: string }
interface BlsResp { Results?: { series?: Array<{ seriesID?: string; data?: BlsDatum[] }> } }

export const blsCpiIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 60_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = { rowsSeen: 0, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };

    const stmts: unknown[] = [];
    for (const s of SERIES) {
      if (ctx.signal.aborted) break;
      let body: BlsResp;
      try {
        const res = await fetch(`https://api.bls.gov/publicAPI/v2/timeseries/data/${s.id}`, {
          headers: { "User-Agent": "LensBot/1.0 (welfare audit)", Accept: "application/json" },
          signal: ctx.signal,
        });
        if (!res.ok) { counters.errors.push(`${s.id}: http ${res.status}`); continue; }
        body = (await res.json()) as BlsResp;
      } catch (err) {
        counters.errors.push(`${s.id}: ${(err as Error).message}`);
        continue;
      }

      const data = body.Results?.series?.[0]?.data ?? [];
      const latest = data.find((d) => d.latest === "true") ?? data[0];
      if (!latest || !latest.value) { counters.rowsSkipped++; continue; }
      counters.rowsSeen++;
      const when = `${latest.year}-${(latest.period ?? "M00").replace("M", "").padStart(2, "0")}-01T00:00:00`;
      const id = `bls-cpi:${s.id}`;
      const title = `BLS CPI ${latest.year}/${latest.periodName ?? latest.period}: ${s.label} index = ${latest.value}`.slice(0, 400);
      stmts.push(
        ctx.env.LENS_D1!.prepare(
          `INSERT INTO regulation_event (id, source_id, external_id, jurisdiction, citation, title, status, effective_date, scope_summary, url, raw_json)
           VALUES (?, ?, ?, 'us-federal-bls-cpi', 'BLS Consumer Price Index', ?, 'in-force', ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             title = excluded.title,
             scope_summary = excluded.scope_summary,
             effective_date = excluded.effective_date,
             raw_json = excluded.raw_json`,
        ).bind(
          id, SOURCE_ID, id, title, when,
          `Latest ${s.label} index: ${latest.value} (${latest.year}/${latest.periodName}). Monthly series from BLS API v2.`.slice(0, 1000),
          `https://data.bls.gov/timeseries/${s.id}`,
          JSON.stringify({ seriesId: s.id, label: s.label, latest, recent: data.slice(0, 6) }).slice(0, 8000),
        ),
      );
    }
    if (stmts.length > 0) {
      try {
        await (ctx.env.LENS_D1 as unknown as { batch(s: unknown[]): Promise<unknown[]> }).batch(stmts);
        counters.rowsUpserted = stmts.length;
      } catch (err) {
        counters.errors.push(`batch: ${(err as Error).message}`);
      }
    }
    counters.log = `series=${SERIES.length} upserted=${counters.rowsUpserted}`;
    return counters;
  },
};
