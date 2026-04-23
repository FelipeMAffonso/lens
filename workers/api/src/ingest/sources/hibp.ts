// IMPROVEMENT_PLAN_V2 A-S17 — Have I Been Pwned ingester.
// HIBP publishes a full breach catalogue at /api/v3/breaches.
// Write all breaches to a generic `data_source`-owned structure:
//   we'll repurpose `regulation_event` with jurisdiction='breach' for now
//   (no dedicated table in 0010; keeps migration count low; TODO A-S17b add
//   breach_event table if we need more structure).

import type { DatasetIngester, IngestionContext, IngestionReport } from "../framework.js";

const SOURCE_ID = "hibp";

interface HibpBreach {
  Name: string;
  Title: string;
  Domain: string;
  BreachDate: string;
  AddedDate: string;
  PwnCount: number;
  Description: string;
  DataClasses: string[];
  IsVerified: boolean;
  IsSensitive: boolean;
  IsRetired: boolean;
}

export const hibpIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 120_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = { rowsSeen: 0, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };

    // The /breaches endpoint is free + unauthenticated.
    let breaches: HibpBreach[] = [];
    try {
      const res = await fetch("https://haveibeenpwned.com/api/v3/breaches", {
        headers: {
          "User-Agent": "LensBot/1.0 (academic; felipe@lens-b1h.pages.dev)",
          Accept: "application/json",
        },
        signal: ctx.signal,
      });
      if (!res.ok) throw new Error(`http ${res.status}`);
      breaches = (await res.json()) as HibpBreach[];
    } catch (err) {
      counters.errors.push((err as Error).message);
      return counters;
    }
    counters.rowsSeen = breaches.length;

    const BATCH = 20;
    for (let i = 0; i < breaches.length; i += BATCH) {
      if (ctx.signal.aborted) break;
      const stmts: unknown[] = [];
      for (const b of breaches.slice(i, i + BATCH)) {
        const summary = `${b.Title} — ${b.Domain}: ${b.PwnCount.toLocaleString()} accounts. Data: ${(b.DataClasses ?? []).slice(0, 4).join(", ")}.`;
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO regulation_event (id, source_id, external_id, jurisdiction, citation, title, status, effective_date, scope_summary, url, raw_json)
             VALUES (?, ?, ?, 'breach', ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               title = excluded.title,
               status = excluded.status,
               effective_date = excluded.effective_date,
               scope_summary = excluded.scope_summary,
               raw_json = excluded.raw_json`,
          ).bind(
            `hibp:${b.Name}`,
            SOURCE_ID,
            b.Name,
            b.Domain || b.Name,
            b.Title,
            b.IsRetired ? "retired" : "in-force",
            b.BreachDate,
            summary.slice(0, 1000),
            `https://haveibeenpwned.com/PwnedWebsites#${encodeURIComponent(b.Name)}`,
            JSON.stringify(b).slice(0, 32_000),
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