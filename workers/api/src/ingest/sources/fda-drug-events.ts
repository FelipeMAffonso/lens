// IMPROVEMENT_PLAN_V2 A-S6c — FDA drug adverse events.
// openFDA /drug/event.json returns 20M+ adverse-event reports. Per-event
// detail is too much; per-drug aggregation is the consumer-useful layer:
// "how many adverse events have been filed against this drug in the last
// quarter, how many were marked serious". Writes to regulation_event with
// jurisdiction='us-federal-fda-adverse-event' so the audit + regulation
// watcher picks them up for OTC / pharmacy SKUs.

import type { DatasetIngester, IngestionContext, IngestionReport } from "../framework.js";

const SOURCE_ID = "fda-drug-events";
const PAGE_SIZE = 100;

interface DrugEvent {
  safetyreportid?: string;
  serious?: string;
  seriousnessdeath?: string;
  receivedate?: string;
  patient?: {
    drug?: Array<{
      medicinalproduct?: string;
      drugindication?: string;
      drugcharacterization?: string;
    }>;
    reaction?: Array<{ reactionmeddrapt?: string }>;
  };
}

interface DrugEventResp {
  meta?: { results?: { total?: number } };
  results?: DrugEvent[];
}

export const fdaDrugEventsIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 120_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = { rowsSeen: 0, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };
    const state = await readCursor(ctx);
    const url = `https://api.fda.gov/drug/event.json?limit=${PAGE_SIZE}&skip=${state.offset}&sort=receivedate:desc`;

    let body: DrugEventResp;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "LensBot/1.0 (welfare audit)", Accept: "application/json" },
        signal: ctx.signal,
      });
      if (res.status === 404) {
        await writeCursor(ctx, { offset: 0 });
        counters.log = "end-of-window — wrapping to offset 0";
        return counters;
      }
      if (!res.ok) throw new Error(`http ${res.status}`);
      body = (await res.json()) as DrugEventResp;
    } catch (err) {
      counters.errors.push((err as Error).message);
      return counters;
    }

    const events = body.results ?? [];
    counters.rowsSeen = events.length;
    counters.log = `total-corpus=${body.meta?.results?.total ?? 0} fetched=${events.length} offset=${state.offset}`;

    // Aggregate: drug name → { eventCount, seriousCount, sampleReactions, sampleIndication }
    interface Agg {
      drug: string;
      eventCount: number;
      seriousCount: number;
      deathCount: number;
      reactions: Set<string>;
      indications: Set<string>;
      latestDate: string;
    }
    const agg = new Map<string, Agg>();
    for (const ev of events) {
      const drugs = ev.patient?.drug ?? [];
      for (const d of drugs) {
        const name = (d.medicinalproduct ?? "").trim();
        if (!name) continue;
        const key = name.toUpperCase().slice(0, 80);
        let row = agg.get(key);
        if (!row) {
          row = { drug: name, eventCount: 0, seriousCount: 0, deathCount: 0, reactions: new Set(), indications: new Set(), latestDate: "" };
          agg.set(key, row);
        }
        row.eventCount++;
        if (ev.serious === "1") row.seriousCount++;
        if (ev.seriousnessdeath === "1") row.deathCount++;
        if (d.drugindication) row.indications.add(d.drugindication);
        for (const r of ev.patient?.reaction ?? []) {
          if (r.reactionmeddrapt) row.reactions.add(r.reactionmeddrapt);
        }
        if (ev.receivedate && ev.receivedate > row.latestDate) row.latestDate = ev.receivedate;
      }
    }

    const rows = Array.from(agg.values()).sort((a, b) => b.eventCount - a.eventCount);
    const BATCH = 20;
    for (let i = 0; i < rows.length; i += BATCH) {
      if (ctx.signal.aborted) break;
      const stmts: unknown[] = [];
      for (const r of rows.slice(i, i + BATCH)) {
        const slug = r.drug.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
        if (!slug) { counters.rowsSkipped++; continue; }
        const id = `fda-drug-event:${slug}`;
        const title = `FDA adverse events: ${r.drug} — ${r.eventCount} reports this batch (${r.seriousCount} serious, ${r.deathCount} deaths)`.slice(0, 400);
        const reactionsList = Array.from(r.reactions).slice(0, 8);
        const indicationsList = Array.from(r.indications).slice(0, 4);
        const scope = `Sample reactions: ${reactionsList.join("; ") || "(unspecified)"}. Indications: ${indicationsList.join("; ") || "(unspecified)"}.`.slice(0, 1000);
        const effective = r.latestDate && r.latestDate.length === 8
          ? `${r.latestDate.slice(0,4)}-${r.latestDate.slice(4,6)}-${r.latestDate.slice(6,8)}T00:00:00`
          : new Date().toISOString().slice(0, 19);
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO regulation_event (id, source_id, external_id, jurisdiction, citation, title, status, effective_date, scope_summary, url, raw_json)
             VALUES (?, ?, ?, 'us-federal-fda-adverse-event', 'FDA Adverse Event Reporting System (FAERS)', ?, 'in-force', ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               title = excluded.title,
               scope_summary = excluded.scope_summary,
               effective_date = excluded.effective_date,
               raw_json = excluded.raw_json`,
          ).bind(
            id, SOURCE_ID, id,
            title, effective, scope,
            `https://www.fda.gov/drugs/questions-and-answers-fdas-adverse-event-reporting-system-faers/fda-adverse-event-reporting-system-faers-public-dashboard`,
            JSON.stringify({
              drug: r.drug, eventCount: r.eventCount, seriousCount: r.seriousCount, deathCount: r.deathCount,
              reactions: reactionsList, indications: indicationsList, latestDate: r.latestDate,
            }).slice(0, 16_000),
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
    }

    await writeCursor(ctx, { offset: state.offset + events.length });
    return counters;
  },
};

interface Cursor { offset: number }

async function readCursor(ctx: IngestionContext): Promise<Cursor> {
  const row = await ctx.env.LENS_D1!.prepare("SELECT cursor_json FROM data_source WHERE id = ?")
    .bind(SOURCE_ID)
    .first<{ cursor_json: string | null }>();
  try {
    const p = JSON.parse(row?.cursor_json ?? "{}");
    return { offset: typeof p.offset === "number" ? p.offset : 0 };
  } catch {
    return { offset: 0 };
  }
}

async function writeCursor(ctx: IngestionContext, c: Cursor): Promise<void> {
  await ctx.env.LENS_D1!.prepare("UPDATE data_source SET cursor_json = ? WHERE id = ?")
    .bind(JSON.stringify(c), SOURCE_ID)
    .run();
}
