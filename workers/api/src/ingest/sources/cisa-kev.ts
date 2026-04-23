// IMPROVEMENT_PLAN_V2 A-S22b — CISA KEV (Known Exploited Vulnerabilities).
// Hand-curated subset of CVEs that are actively being exploited. ~1,500
// entries, refreshed a few times per day. Sharpest firmware-risk signal
// we can surface for connected-device purchases — higher signal-to-noise
// than the full NVD feed which we also ingest (nvd-cve).
// Feed: https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json

import type { DatasetIngester, IngestionContext, IngestionReport } from "../framework.js";

const SOURCE_ID = "cisa-kev";
const FEED_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";

interface KEVEntry {
  cveID?: string;
  vendorProject?: string;
  product?: string;
  vulnerabilityName?: string;
  dateAdded?: string;
  shortDescription?: string;
  requiredAction?: string;
  dueDate?: string;
  knownRansomwareCampaignUse?: string;
  notes?: string;
  cwes?: string[];
}

interface KEVCatalog {
  title?: string;
  catalogVersion?: string;
  dateReleased?: string;
  count?: number;
  vulnerabilities?: KEVEntry[];
}

export const cisaKevIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 180_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = { rowsSeen: 0, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };

    let catalog: KEVCatalog;
    try {
      const res = await fetch(FEED_URL, {
        headers: {
          "User-Agent": "LensBot/1.0 (academic consumer-welfare research; contact=github.com/FelipeMAffonso/lens)",
          Accept: "application/json",
        },
        signal: ctx.signal,
      });
      if (!res.ok) throw new Error(`http ${res.status}`);
      catalog = (await res.json()) as KEVCatalog;
    } catch (err) {
      counters.errors.push((err as Error).message);
      return counters;
    }

    const entries = catalog.vulnerabilities ?? [];
    counters.rowsSeen = entries.length;
    counters.log = `catalogVersion=${catalog.catalogVersion} dateReleased=${catalog.dateReleased} count=${catalog.count}`;

    const BATCH = 25;
    for (let i = 0; i < entries.length; i += BATCH) {
      if (ctx.signal.aborted) break;
      const stmts: unknown[] = [];
      for (const e of entries.slice(i, i + BATCH)) {
        const cve = (e.cveID ?? "").trim();
        if (!cve) { counters.rowsSkipped++; continue; }
        const vendor = (e.vendorProject ?? "unknown").trim().slice(0, 120);
        const product = (e.product ?? "unknown").trim().slice(0, 160);
        const summary = `${e.vulnerabilityName ?? cve}. ${e.shortDescription ?? ""}`.slice(0, 800);
        const remediation = (e.requiredAction ?? "").slice(0, 800);
        // CISA KEV doesn't publish CVSS scores directly. We infer severity
        // from whether it's linked to ransomware use (always critical) or
        // default to "high" since CISA only lists actively-exploited CVEs.
        const severity =
          (e.knownRansomwareCampaignUse ?? "").toLowerCase() === "known"
            ? "critical"
            : "high";
        const published = (e.dateAdded ?? new Date().toISOString().slice(0, 10)) + "T00:00:00";
        const url = `https://www.cisa.gov/known-exploited-vulnerabilities-catalog`;
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO firmware_advisory (id, source_id, external_id, vendor, product, cve, severity, cvss_score, summary, remediation, published_at, url, raw_json, ingested_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
               vendor = excluded.vendor,
               product = excluded.product,
               severity = excluded.severity,
               summary = excluded.summary,
               remediation = excluded.remediation,
               raw_json = excluded.raw_json,
               ingested_at = excluded.ingested_at`,
          ).bind(
            `cisa-kev:${cve}`,
            SOURCE_ID,
            cve,
            vendor,
            product,
            cve,
            severity,
            summary,
            remediation,
            published,
            url,
            JSON.stringify(e).slice(0, 32_000),
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
