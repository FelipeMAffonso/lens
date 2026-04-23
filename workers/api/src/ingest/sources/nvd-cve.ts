// IMPROVEMENT_PLAN_V2 A-S22 — NVD CVE ingester (firmware & security advisories).
// NIST National Vulnerability Database. Free, unauthenticated, rate-limited.
// API: https://services.nvd.nist.gov/rest/json/cves/2.0?pubStartDate=&pubEndDate=
// Feeds firmware_advisory table; cross-referenced against sku_catalog by
// cpe_matcher (vendor+product string match) in a later A12b triangulation pass.

import type { DatasetIngester, IngestionContext, IngestionReport } from "../framework.js";

const SOURCE_ID = "nvd-cve";
const PAGE_SIZE = 200;

interface NvdPage {
  vulnerabilities?: Array<{
    cve?: {
      id?: string;
      descriptions?: Array<{ lang?: string; value?: string }>;
      metrics?: {
        cvssMetricV31?: Array<{ cvssData?: { baseScore?: number; baseSeverity?: string } }>;
      };
      references?: Array<{ url?: string }>;
      configurations?: Array<{
        nodes?: Array<{ cpeMatch?: Array<{ criteria?: string }> }>;
      }>;
      published?: string;
      lastModified?: string;
    };
  }>;
  totalResults?: number;
}

export const nvdCveIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 180_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = { rowsSeen: 0, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };
    const cursor = await readCursor(ctx);

    // Window the fetch — pull last 30 days on first run, then 24h windows.
    const windowDays = cursor.startIndex === 0 ? 30 : 1;
    const end = new Date();
    const start = new Date(end.getTime() - windowDays * 24 * 60 * 60 * 1000);
    const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?pubStartDate=${encodeURIComponent(start.toISOString())}&pubEndDate=${encodeURIComponent(end.toISOString())}&resultsPerPage=${PAGE_SIZE}&startIndex=${cursor.startIndex}`;

    let body: NvdPage;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "LensBot/1.0 (academic)", Accept: "application/json" },
        signal: ctx.signal,
      });
      if (!res.ok) throw new Error(`http ${res.status}`);
      body = (await res.json()) as NvdPage;
    } catch (err) {
      counters.errors.push((err as Error).message);
      return counters;
    }

    const vulns = body.vulnerabilities ?? [];
    counters.rowsSeen = vulns.length;

    const BATCH = 20;
    for (let i = 0; i < vulns.length; i += BATCH) {
      if (ctx.signal.aborted) break;
      const stmts: unknown[] = [];
      for (const v of vulns.slice(i, i + BATCH)) {
        const c = v.cve;
        if (!c?.id) {
          counters.rowsSkipped++;
          continue;
        }
        const description = (c.descriptions ?? []).find((d) => d.lang === "en")?.value ?? "";
        const metric = c.metrics?.cvssMetricV31?.[0]?.cvssData;
        const cvssScore = metric?.baseScore ?? null;
        const severityRaw = metric?.baseSeverity?.toLowerCase();
        const severity = severityRaw === "critical" ? "critical" : severityRaw === "high" ? "high" : severityRaw === "medium" ? "medium" : "low";
        // Extract vendor+product from first CPE match.
        const cpe = c.configurations?.[0]?.nodes?.[0]?.cpeMatch?.[0]?.criteria ?? "";
        const cpeParts = cpe.split(":");
        const vendor = cpeParts[3] ?? "unknown";
        const product = cpeParts[4] ?? "unknown";
        const url = c.references?.[0]?.url ?? `https://nvd.nist.gov/vuln/detail/${c.id}`;
        const published = (c.published ?? new Date().toISOString()).slice(0, 19);
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO firmware_advisory (id, source_id, external_id, vendor, product, cve, severity, cvss_score, summary, remediation, published_at, url, raw_json, ingested_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
               severity = excluded.severity,
               cvss_score = excluded.cvss_score,
               summary = excluded.summary,
               raw_json = excluded.raw_json`,
          ).bind(
            `nvd:${c.id}`,
            SOURCE_ID,
            c.id,
            vendor,
            product,
            c.id,
            severity,
            cvssScore,
            description.slice(0, 1000),
            published,
            url,
            JSON.stringify({
              id: c.id,
              description,
              cvss: metric,
              references: c.references?.slice(0, 5) ?? [],
              cpe,
              published,
              last_modified: c.lastModified,
            }).slice(0, 32_000),
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

    const exhausted = vulns.length < PAGE_SIZE;
    await writeCursor(ctx, exhausted ? { startIndex: 0 } : { startIndex: cursor.startIndex + vulns.length });
    return counters;
  },
};

async function readCursor(ctx: IngestionContext): Promise<{ startIndex: number }> {
  const row = await ctx.env.LENS_D1!.prepare("SELECT cursor_json FROM data_source WHERE id = ?")
    .bind(SOURCE_ID)
    .first<{ cursor_json: string | null }>();
  try {
    const p = JSON.parse(row?.cursor_json ?? "{}");
    return { startIndex: typeof p.startIndex === "number" ? p.startIndex : 0 };
  } catch {
    return { startIndex: 0 };
  }
}

async function writeCursor(ctx: IngestionContext, c: { startIndex: number }): Promise<void> {
  await ctx.env.LENS_D1!.prepare("UPDATE data_source SET cursor_json = ? WHERE id = ?")
    .bind(JSON.stringify(c), SOURCE_ID)
    .run();
}