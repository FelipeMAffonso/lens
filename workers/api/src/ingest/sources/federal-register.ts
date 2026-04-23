// IMPROVEMENT_PLAN_V2 A-S8 — Federal Register consumer-rules ingester.
// Free public API. Fetches articles tagged "consumer-protection" or matching
// CFPB/FTC/FDA/DOT agencies. Populates `regulation_event` with effective
// dates and status.

import type { DatasetIngester, IngestionContext, IngestionReport } from "../framework.js";

const SOURCE_ID = "federal-register";
const PAGE_SIZE = 100;

const AGENCIES = [
  "consumer-financial-protection-bureau",
  "federal-trade-commission",
  "food-and-drug-administration",
  "national-highway-traffic-safety-administration",
  "consumer-product-safety-commission",
  "federal-communications-commission",
];

export const federalRegisterIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 120_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = { rowsSeen: 0, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };
    const state = await readState(ctx);
    const agency = AGENCIES[state.agencyIndex % AGENCIES.length]!;
    const page = state.page;

    const url = `https://www.federalregister.gov/api/v1/articles.json?conditions[agencies][]=${agency}&per_page=${PAGE_SIZE}&page=${page}&fields[]=document_number&fields[]=title&fields[]=publication_date&fields[]=effective_on&fields[]=html_url&fields[]=abstract&fields[]=type&fields[]=regulations_dot_gov_info`;

    let body: { results?: Array<Record<string, unknown>>; total_pages?: number };
    try {
      const res = await fetch(url, { headers: { "User-Agent": "LensBot/1.0" }, signal: ctx.signal });
      if (!res.ok) throw new Error(`http ${res.status}`);
      body = (await res.json()) as typeof body;
    } catch (err) {
      counters.errors.push((err as Error).message);
      return counters;
    }
    const rows = body.results ?? [];
    counters.rowsSeen = rows.length;

    const BATCH = 15;
    for (let i = 0; i < rows.length; i += BATCH) {
      if (ctx.signal.aborted) break;
      const stmts: unknown[] = [];
      for (const r of rows.slice(i, i + BATCH)) {
        const docNum = String(r.document_number ?? "");
        const title = String(r.title ?? "").slice(0, 400);
        if (!docNum || !title) {
          counters.rowsSkipped++;
          continue;
        }
        const effective = (r.effective_on ?? r.publication_date ?? "").toString().slice(0, 19);
        const type = String(r.type ?? "");
        const status = type === "Rule" ? "in-force" : type === "Proposed Rule" ? "proposed" : "in-force";
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO regulation_event (id, source_id, external_id, jurisdiction, citation, title, status, effective_date, scope_summary, url, raw_json)
             VALUES (?, ?, ?, 'us-federal', ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               title = excluded.title,
               status = excluded.status,
               effective_date = excluded.effective_date,
               scope_summary = excluded.scope_summary,
               raw_json = excluded.raw_json`,
          ).bind(
            `fr:${docNum}`,
            SOURCE_ID,
            docNum,
            `FR ${docNum}`,
            title,
            status,
            effective || null,
            String(r.abstract ?? "").slice(0, 1000),
            String(r.html_url ?? `https://www.federalregister.gov/documents/${docNum}`),
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
      if ((i / BATCH) % 10 === 0) await ctx.progress({});
    }

    const exhausted = !body.total_pages || page >= body.total_pages;
    await writeState(ctx, exhausted
      ? { agencyIndex: state.agencyIndex + 1, page: 1 }
      : { agencyIndex: state.agencyIndex, page: page + 1 });

    return counters;
  },
};

async function readState(ctx: IngestionContext): Promise<{ agencyIndex: number; page: number }> {
  const row = await ctx.env.LENS_D1!.prepare("SELECT last_error FROM data_source WHERE id = ?")
    .bind(SOURCE_ID)
    .first<{ last_error: string | null }>();
  try {
    const p = JSON.parse(row?.last_error ?? "{}");
    return {
      agencyIndex: typeof p.agencyIndex === "number" ? p.agencyIndex : 0,
      page: typeof p.page === "number" ? p.page : 1,
    };
  } catch {
    return { agencyIndex: 0, page: 1 };
  }
}

async function writeState(ctx: IngestionContext, s: { agencyIndex: number; page: number }): Promise<void> {
  await ctx.env.LENS_D1!.prepare("UPDATE data_source SET last_error = ? WHERE id = ?")
    .bind(JSON.stringify(s), SOURCE_ID)
    .run();
}