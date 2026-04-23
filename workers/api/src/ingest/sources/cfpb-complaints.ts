// IMPROVEMENT_PLAN_V2 A-S22c — CFPB Consumer Complaint Database.
// https://www.consumerfinance.gov/data-research/consumer-complaints/search/
// ~14.6M complaints since 2011. Public JSON, no auth. Rich consumer-trust
// signal: tells us which companies consumers complained about to the
// federal regulator, what product, what issue, how the company responded.
// Ingest strategy: fetch latest 200 complaints, aggregate by
// (company, product, issue), write top aggregates as regulation_event
// rows tagged jurisdiction='us-federal-cfpb-complaint' so the existing
// audit + regulation-watcher picks them up.

import type { DatasetIngester, IngestionContext, IngestionReport } from "../framework.js";

const SOURCE_ID = "cfpb-complaints";
const PAGE_SIZE = 200;
const BASE = "https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/";

interface CFPBHit {
  _source?: {
    company?: string;
    product?: string;
    sub_product?: string;
    issue?: string;
    sub_issue?: string;
    date_received?: string;
    company_response?: string;
    state?: string;
    complaint_id?: string;
    timely?: string;
  };
}

interface CFPBResponse {
  hits?: { total?: { value?: number }; hits?: CFPBHit[] };
}

export const cfpbComplaintsIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 120_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = { rowsSeen: 0, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };
    // Pull the most recently SENT batch — covers current enforcement-era issues.
    const url = `${BASE}?size=${PAGE_SIZE}&sort=created_date_desc`;

    let body: CFPBResponse;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "LensBot/1.0 (consumer-welfare research)", Accept: "application/json" },
        signal: ctx.signal,
      });
      if (!res.ok) throw new Error(`http ${res.status}`);
      body = (await res.json()) as CFPBResponse;
    } catch (err) {
      counters.errors.push((err as Error).message);
      return counters;
    }

    const hits = body.hits?.hits ?? [];
    counters.rowsSeen = hits.length;
    counters.log = `total_corpus=${body.hits?.total?.value ?? 0} fetched=${hits.length}`;

    // Aggregate by (company, product).
    interface Agg { company: string; product: string; count: number; latestDate: string; sampleIssues: Set<string> }
    const agg = new Map<string, Agg>();
    for (const h of hits) {
      const s = h._source;
      if (!s) continue;
      const company = (s.company ?? "").trim();
      const product = (s.product ?? "").trim();
      if (!company || !product) { counters.rowsSkipped++; continue; }
      const key = `${company}||${product}`;
      let row = agg.get(key);
      if (!row) {
        row = { company, product, count: 0, latestDate: s.date_received ?? "", sampleIssues: new Set() };
        agg.set(key, row);
      }
      row.count += 1;
      if (s.issue) row.sampleIssues.add(s.issue);
      if (s.date_received && s.date_received > row.latestDate) row.latestDate = s.date_received;
    }

    const rows = Array.from(agg.values()).sort((a, b) => b.count - a.count);
    const BATCH = 20;
    for (let i = 0; i < rows.length; i += BATCH) {
      if (ctx.signal.aborted) break;
      const stmts: unknown[] = [];
      for (const r of rows.slice(i, i + BATCH)) {
        const slug = r.company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
        const id = `cfpb:${slug}:${r.product.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
        const title = `CFPB: ${r.count} consumer complaints against ${r.company} (${r.product})`.slice(0, 400);
        const issues = Array.from(r.sampleIssues).slice(0, 5);
        const scopeSummary = `Recent CFPB complaints: ${r.count} in this batch. Sample issues: ${issues.join("; ") || "(unspecified)"}`.slice(0, 1000);
        const effective = r.latestDate ? r.latestDate.slice(0, 19) : new Date().toISOString().slice(0, 19);
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO regulation_event (id, source_id, external_id, jurisdiction, citation, title, status, effective_date, scope_summary, url, raw_json)
             VALUES (?, ?, ?, 'us-federal-cfpb-complaint', 'CFPB Consumer Complaint Database', ?, 'in-force', ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               title = excluded.title,
               scope_summary = excluded.scope_summary,
               effective_date = excluded.effective_date,
               raw_json = excluded.raw_json`,
          ).bind(
            id,
            SOURCE_ID,
            id,
            title,
            effective,
            scopeSummary,
            "https://www.consumerfinance.gov/data-research/consumer-complaints/search/",
            JSON.stringify({ company: r.company, product: r.product, count: r.count, issues, latestDate: r.latestDate }).slice(0, 16_000),
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
    return counters;
  },
};
