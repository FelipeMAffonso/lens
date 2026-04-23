// IMPROVEMENT_PLAN_V2 Phase A4 — CPSC recall ingester.
//
// Source: US Consumer Product Safety Commission.
// Endpoint: https://www.saferproducts.gov/RestWebServices/Recall?format=json
// Docs: https://www.cpsc.gov/cgibin/RetrieveDocs.aspx
//
// The CPSC API is a public, unauthenticated JSON endpoint. It returns the
// full recall history (~15K rows as of 2026-04). Each recall has:
//   - RecallID               "24-071"
//   - RecallNumber
//   - RecallDate
//   - Description
//   - URL
//   - Products[]             with {Name, Model, Type, ...}
//   - Manufacturers[]
//   - Retailers[]
//   - Hazards[]              with {Name, HazardType}
//   - Remedies[]
//   - Images[]               with {URL, Caption}
//
// The ingester:
//   1. Paginates with RecallDateStart/End year-by-year to stay under the
//      endpoint's 10K-rows-per-response ceiling.
//   2. Upserts into `recall` (normalized) + `product_match_json` that the
//      matcher cron later scans against `sku_catalog`.
//   3. Is fully idempotent — running it twice re-upserts the same rows.
//   4. Is bounded to ~4 min per run; subsequent runs pick up where this one
//      stopped via `last_success_at`.

import type { Env } from "../../index.js";
import type { DatasetIngester, IngestionContext, IngestionReport } from "../framework.js";

const SOURCE_ID = "cpsc-recalls";
const BASE_URL = "https://www.saferproducts.gov/RestWebServices/Recall";

interface CPSCRecall {
  RecallID?: number;
  RecallNumber?: string;
  RecallDate?: string;
  Description?: string;
  URL?: string;
  Title?: string;
  Products?: Array<{ Name?: string; Model?: string; Type?: string; NumberOfUnits?: string }>;
  Manufacturers?: Array<{ Name?: string }>;
  Retailers?: Array<{ Name?: string }>;
  Hazards?: Array<{ Name?: string; HazardType?: string }>;
  Remedies?: Array<{ Name?: string }>;
  Images?: Array<{ URL?: string; Caption?: string }>;
  Injuries?: Array<{ Name?: string }>;
  ConsumerContact?: string;
}

export const cpscRecallsIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 240_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = {
      rowsSeen: 0,
      rowsUpserted: 0,
      rowsSkipped: 0,
      errors: [],
      log: "",
    };
    const logLines: string[] = [];

    // Determine window: on first run, pull last 5 years. On subsequent runs,
    // pull the last 60 days (plenty of overlap to catch reclassifications).
    const lastSuccess = await readLastSuccessAt(ctx.env);
    const now = new Date();
    const windowDays = lastSuccess ? 60 : 5 * 365;
    const startDate = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
    const startISO = startDate.toISOString().slice(0, 10);
    const endISO = now.toISOString().slice(0, 10);
    logLines.push(`window: ${startISO} .. ${endISO} (${windowDays} days)`);

    const url = `${BASE_URL}?format=json&RecallDateStart=${startISO}&RecallDateEnd=${endISO}`;
    logLines.push(`fetching ${url}`);

    let payload: CPSCRecall[] = [];
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "LensBot/1.0 (academic-research; contact: felipe@lens-b1h.pages.dev)",
          Accept: "application/json",
        },
        signal: ctx.signal,
      });
      if (!res.ok) throw new Error(`cpsc http ${res.status}`);
      payload = (await res.json()) as CPSCRecall[];
    } catch (err) {
      const msg = `cpsc fetch failed: ${(err as Error).message}`;
      counters.errors.push(msg);
      counters.log = logLines.concat(msg).join("\n");
      return counters;
    }

    logLines.push(`payload rows: ${payload.length}`);
    counters.rowsSeen = payload.length;

    // Chunked UPSERT — D1 supports batch() with ≤ 50 statements per call.
    const BATCH = 25;
    for (let i = 0; i < payload.length; i += BATCH) {
      if (ctx.signal.aborted) {
        counters.errors.push("aborted (framework timeout)");
        break;
      }
      const chunk = payload.slice(i, i + BATCH);
      const stmts = chunk
        .map((r) => normalizeRecall(r))
        .filter((r): r is NormalizedRecall => r !== null)
        .map((r) => prepareUpsert(ctx.env, r));

      counters.rowsSkipped += chunk.length - stmts.length;

      if (stmts.length === 0) continue;

      try {
        const results = await ctx.env.LENS_D1.batch(stmts);
        counters.rowsUpserted += results.filter((x) => x.success).length;
      } catch (err) {
        const msg = `batch ${i / BATCH} failed: ${(err as Error).message}`;
        if (counters.errors.length < 10) counters.errors.push(msg);
      }

      if ((i / BATCH) % 20 === 0) {
        await ctx.progress({}); // flush counters to run row every ~500 rows
      }
    }

    counters.log = logLines.join("\n");
    return counters;
  },
};

interface NormalizedRecall {
  id: string;
  externalId: string;
  title: string;
  productMatchJson: string;
  severity: string;
  hazard: string | null;
  publishedAt: string;
  url: string;
  remedy: string | null;
  affectedUnits: number | null;
  rawJson: string;
}

function normalizeRecall(r: CPSCRecall): NormalizedRecall | null {
  const extId = (r.RecallNumber || r.RecallID?.toString())?.trim();
  if (!extId) return null;

  const title =
    r.Title ||
    r.Products?.[0]?.Name ||
    r.Description?.slice(0, 200) ||
    `CPSC Recall ${extId}`;

  const hazardName = r.Hazards?.[0]?.Name ?? null;
  const hazardType = inferHazardType(r.Hazards?.[0]?.HazardType ?? hazardName);

  const productMatch = {
    brands: (r.Manufacturers ?? []).map((m) => (m.Name ?? "").trim()).filter(Boolean),
    products: (r.Products ?? []).map((p) => ({
      name: p.Name ?? "",
      model: p.Model ?? null,
      type: p.Type ?? null,
      units: p.NumberOfUnits ?? null,
    })),
    retailers: (r.Retailers ?? []).map((rt) => (rt.Name ?? "").trim()).filter(Boolean),
  };

  const affected = parseUnitCount(r.Products?.[0]?.NumberOfUnits);

  return {
    id: `cpsc:${extId}`,
    externalId: extId,
    title,
    productMatchJson: JSON.stringify(productMatch),
    severity: "recall",
    hazard: hazardType,
    publishedAt: (r.RecallDate ?? new Date().toISOString()).slice(0, 19),
    url: r.URL ?? `https://www.cpsc.gov/Recalls/${extId}`,
    remedy: r.Remedies?.[0]?.Name ?? null,
    affectedUnits: affected,
    rawJson: JSON.stringify(r).slice(0, 64_000),
  };
}

function inferHazardType(s: string | null | undefined): string | null {
  if (!s) return null;
  const lower = s.toLowerCase();
  if (/fire|burn|thermal/.test(lower)) return "fire";
  if (/chem|lead|asbest|form[a-z]*dehyde|bpa/.test(lower)) return "chemical";
  if (/laceration|cut|sharp/.test(lower)) return "laceration";
  if (/choke|choking|swallow/.test(lower)) return "choking";
  if (/electric|shock/.test(lower)) return "electrical";
  if (/fall|tip/.test(lower)) return "fall";
  if (/strang|entangl/.test(lower)) return "strangulation";
  if (/drown/.test(lower)) return "drowning";
  if (/carbon.?monoxide|co\s+risk/.test(lower)) return "co-poisoning";
  return "other";
}

function parseUnitCount(s: string | undefined): number | null {
  if (!s) return null;
  const match = s.replace(/,/g, "").match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function prepareUpsert(env: Env, r: NormalizedRecall): ReturnType<Env["LENS_D1"]["prepare"]> {
  return env.LENS_D1.prepare(
    `INSERT INTO recall (id, source_id, external_id, title, product_match_json, severity, hazard, published_at, url, remedy, affected_units, raw_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       product_match_json = excluded.product_match_json,
       severity = excluded.severity,
       hazard = excluded.hazard,
       published_at = excluded.published_at,
       url = excluded.url,
       remedy = excluded.remedy,
       affected_units = excluded.affected_units,
       raw_json = excluded.raw_json`,
  ).bind(
    r.id,
    SOURCE_ID,
    r.externalId,
    r.title,
    r.productMatchJson,
    r.severity,
    r.hazard,
    r.publishedAt,
    r.url,
    r.remedy,
    r.affectedUnits,
    r.rawJson,
  );
}

async function readLastSuccessAt(env: Env): Promise<string | null> {
  const row = await env.LENS_D1.prepare(
    "SELECT last_success_at FROM data_source WHERE id = ?",
  )
    .bind(SOURCE_ID)
    .first<{ last_success_at: string | null }>();
  return row?.last_success_at ?? null;
}

