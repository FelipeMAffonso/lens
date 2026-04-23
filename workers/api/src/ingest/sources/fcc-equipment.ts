// IMPROVEMENT_PLAN_V2 A5 — FCC Equipment Authorization ingester.
//
// Every wireless device sold in the US must be FCC-certified before sale.
// The FCC publishes the Equipment Authorization System database ("EAS")
// covering ~3M grants across phones, earbuds, laptops, routers, smart-home
// hubs, cars, medical devices, toys — anything that emits RF.
//
// Primary endpoint (unofficial but stable): the "OET" generic search at
//   https://apps.fcc.gov/oetcf/eas/reports/GenericSearch.cfm
// returns CSV paginated by `rows_per_page`. It tolerates ~5000 rows/page.
//
// Strategy here: fetch ONE page per run (2000 rows). The dispatcher calls us
// every few hours, so over ~1500 runs we cover the full 3M-record history
// without blowing any single-run budget. Persisting ~1500 rows to D1 per run
// is well under the 128MB memory ceiling.
//
// Each FCC row becomes:
//   * a `sku_catalog` row with brand + model + fcc_id populated
//   * a `sku_source_link` row attributing source=fcc-equipment with the
//     grant_date and the canonical EAS detail URL.

import type { Env } from "../../index.js";
import { ensureBrands, type DatasetIngester, type IngestionContext, type IngestionReport } from "../framework.js";

const SOURCE_ID = "fcc-equipment";
// CSV export endpoint — takes ~6 seconds to respond for 2000 rows.
const EAS_EXPORT_URL =
  "https://apps.fcc.gov/oetcf/eas/reports/GenericSearch.cfm?RequestTimeout=500";

interface FccRow {
  applicantName: string;    // "Apple Inc."
  applicantId: string;       // FCC grantee code (3 chars)
  productCode: string;        // "XYZ"
  fccId: string;              // applicantId + productCode (e.g. "BCG-E1234")
  grantDate: string;          // "2024-05-17"
  productDescription: string; // "AirPods Pro (2nd gen)"
  equipmentClass: string;     // "DTS - Digital Transmission System"
  applicantCountry: string;
  modelName: string;           // might be empty — fall back to description
  detailUrl: string;
}

export const fccEquipmentIngester: DatasetIngester = {
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

    const cursor = await readCursor(ctx.env);
    const pageSize = 2000;
    const params = new URLSearchParams({
      output_format: "csv",
      rows_per_page: String(pageSize),
      start_row: String(cursor),
      // Sort by grant date ASC so we deterministically progress forward.
      sort_by: "grant_date",
      sort_order: "asc",
    });
    const url = `${EAS_EXPORT_URL}&${params.toString()}`;
    logLines.push(`start_row=${cursor} rows_per_page=${pageSize}`);
    logLines.push(`fetching ${url}`);

    let csv = "";
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "LensBot/1.0 (academic; felipe@lens-b1h.pages.dev)",
          Accept: "text/csv,application/csv,text/plain",
        },
        signal: ctx.signal,
      });
      if (!res.ok) throw new Error(`fcc http ${res.status}`);
      csv = await res.text();
    } catch (err) {
      const msg = `fcc fetch failed: ${(err as Error).message}`;
      counters.errors.push(msg);
      counters.log = logLines.concat(msg).join("\n");
      return counters;
    }

    const rows = parseCsvLoose(csv);
    logLines.push(`rows parsed: ${rows.length}`);
    counters.rowsSeen = rows.length;

    // Ensure all applicant brands exist before inserting sku_catalog rows.
    const brands = new Map<string, string>();
    for (const r of rows) {
      const applicant = pick(r, ["Applicant Name", "applicant_name", "applicantName"]);
      if (!applicant) continue;
      const slug = normalizeBrand(applicant);
      if (!brands.has(slug)) brands.set(slug, applicant);
    }
    await ensureBrands(ctx.env, brands);

    // Batch UPSERT (25 per D1 batch; 2 statements per row → 12-13 rows per batch).
    const BATCH = 12;
    for (let i = 0; i < rows.length; i += BATCH) {
      if (ctx.signal.aborted) {
        counters.errors.push("aborted (framework timeout)");
        break;
      }
      const chunk = rows.slice(i, i + BATCH);
      const stmts: unknown[] = [];
      for (const r of chunk) {
        const normalized = normalizeFccRow(r);
        if (!normalized) {
          counters.rowsSkipped++;
          continue;
        }
        stmts.push(upsertSku(ctx.env, normalized));
        stmts.push(upsertSourceLink(ctx.env, normalized));
      }
      if (stmts.length === 0) continue;
      try {
        await (ctx.env.LENS_D1 as unknown as { batch(s: unknown[]): Promise<unknown[]> }).batch(stmts);
        counters.rowsUpserted += stmts.length / 2;
      } catch (err) {
        const msg = `batch ${i / BATCH} failed: ${(err as Error).message}`;
        if (counters.errors.length < 10) counters.errors.push(msg);
      }
      if ((i / BATCH) % 20 === 0) await ctx.progress({});
    }

    // Advance the cursor so the next run picks up where we left off.
    await writeCursor(ctx.env, cursor + rows.length);
    logLines.push(`new cursor: ${cursor + rows.length}`);

    counters.log = logLines.join("\n");
    return counters;
  },
};

// ---- cursor — stored in `data_source.cursor_json` (added in 0020) ----

async function readCursor(env: Env): Promise<number> {
  const row = await db(env).prepare(
    "SELECT cursor_json FROM data_source WHERE id = ?",
  )
    .bind(SOURCE_ID)
    .first<{ cursor_json: string | null }>();
  if (!row?.cursor_json) return 1;
  try {
    const parsed = JSON.parse(row.cursor_json);
    return typeof parsed.cursor === "number" ? parsed.cursor : 1;
  } catch {
    return 1;
  }
}

async function writeCursor(env: Env, cursor: number): Promise<void> {
  const blob = JSON.stringify({ cursor });
  await db(env).prepare("UPDATE data_source SET cursor_json = ? WHERE id = ?").bind(blob, SOURCE_ID).run();
}

// ---- helpers ----

function db(env: Env) {
  if (!env.LENS_D1) throw new Error("LENS_D1 required");
  return env.LENS_D1;
}

/** Super-loose CSV parser: handles quoted fields with commas, doubled quotes. */
export function parseCsvLoose(csv: string): Record<string, string>[] {
  const lines = splitCsvLines(csv);
  if (lines.length < 2) return [];
  const header = splitCsvRow(lines[0]!);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvRow(lines[i]!);
    if (cells.length === 0) continue;
    const obj: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) {
      obj[header[j]!] = (cells[j] ?? "").trim();
    }
    rows.push(obj);
  }
  return rows;
}

function splitCsvLines(csv: string): string[] {
  // Split only on unquoted \n.
  const out: string[] = [];
  let buf = "";
  let inQ = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i]!;
    if (ch === '"') inQ = !inQ;
    if (ch === "\n" && !inQ) {
      out.push(buf.replace(/\r$/, ""));
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf) out.push(buf.replace(/\r$/, ""));
  return out;
}

function splitCsvRow(line: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        buf += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (ch === "," && !inQ) {
      out.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  out.push(buf);
  return out;
}

interface NormalizedFcc {
  fccId: string;
  skuId: string;
  brand: string;
  model: string;
  name: string;
  grantDate: string;
  detailUrl: string;
  specsJson: string;
}

function normalizeFccRow(r: Record<string, string>): NormalizedFcc | null {
  // Column names vary across export revisions; match loosely.
  const applicantName = pick(r, ["Applicant Name", "applicant_name", "applicantName"]);
  const applicantId = pick(r, ["Grantee Code", "grantee_code", "applicantId"]);
  const productCode = pick(r, ["Product Code", "product_code", "productCode"]);
  const productDescription = pick(r, ["Product Description", "product_description", "description"]);
  const grantDate = pick(r, ["Grant Date", "grant_date", "grantDate"]) || new Date().toISOString().slice(0, 10);
  const modelName = pick(r, ["Model Name", "model", "modelName"]);
  const fccId = (applicantId && productCode ? `${applicantId}-${productCode}` : pick(r, ["FCC ID", "fccId"])) || "";
  if (!fccId || !applicantName) return null;
  const brand = normalizeBrand(applicantName);
  const model = modelName || productCode || productDescription.slice(0, 80);
  const skuId = `fcc:${fccId}`;
  const detailUrl = `https://apps.fcc.gov/oetcf/eas/reports/ViewExhibitReport.cfm?mode=Exhibits&RequestTimeout=500&application_id=${applicantId}&fcc_id=${encodeURIComponent(fccId)}`;
  const specsJson = JSON.stringify({
    equipment_class: pick(r, ["Equipment Class", "equipment_class"]),
    applicant_country: pick(r, ["Applicant Country", "country"]),
    lower_frequency: pick(r, ["Lower Frequency", "lower_frequency"]),
    upper_frequency: pick(r, ["Upper Frequency", "upper_frequency"]),
    test_firm: pick(r, ["Test Firm", "test_firm"]),
  });
  return {
    fccId,
    skuId,
    brand,
    model: model.slice(0, 120),
    name: (productDescription || model || fccId).slice(0, 200),
    grantDate,
    detailUrl,
    specsJson,
  };
}

function pick(r: Record<string, string>, keys: string[]): string {
  for (const k of keys) if (r[k]) return r[k]!;
  return "";
}

function normalizeBrand(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(inc|llc|co|ltd|corp|gmbh|sa|sas|bv)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "unknown";
}

function upsertSku(env: Env, n: NormalizedFcc) {
  return db(env).prepare(
    `INSERT INTO sku_catalog (id, canonical_name, brand_slug, model_code, fcc_id, specs_json, first_seen_at, last_refreshed_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       canonical_name = excluded.canonical_name,
       model_code = excluded.model_code,
       last_refreshed_at = datetime('now')`,
  ).bind(n.skuId, n.name, n.brand, n.model, n.fccId, n.specsJson);
}

function upsertSourceLink(env: Env, n: NormalizedFcc) {
  return db(env).prepare(
    `INSERT INTO sku_source_link (sku_id, source_id, external_id, external_url, specs_json, observed_at, confidence, active)
     VALUES (?, ?, ?, ?, ?, datetime('now'), 0.95, 1)
     ON CONFLICT(sku_id, source_id, external_id) DO UPDATE SET
       external_url = excluded.external_url,
       specs_json = excluded.specs_json,
       observed_at = datetime('now'),
       active = 1`,
  ).bind(n.skuId, SOURCE_ID, n.fccId, n.detailUrl, n.specsJson);
}