// IMPROVEMENT_PLAN_V2 A-S6b — FDA 510(k) device clearances.
// Separate from fda-recalls. This is the catalog of every medical device
// cleared for US sale since the 1970s (~200K+ entries). Consumer-relevant
// for: glucose meters, blood-pressure cuffs, thermometers, pulse oximeters,
// nebulizers, hearing aids, insulin pumps, home-test kits, etc.
// Endpoint: https://api.fda.gov/device/510k.json?limit=100&skip=<offset>

import type { DatasetIngester, IngestionContext, IngestionReport } from "../framework.js";
import { ensureBrands } from "../framework.js";

const SOURCE_ID = "fda-510k";
const PAGE_SIZE = 100;

interface K510Row {
  k_number?: string;
  applicant?: string;
  device_name?: string;
  product_code?: string;
  decision_date?: string;
  date_received?: string;
  openfda?: { device_name?: string; medical_specialty_description?: string; device_class?: string };
}

export const fda510kIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 180_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = { rowsSeen: 0, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };
    const state = await readState(ctx);
    const url = `https://api.fda.gov/device/510k.json?limit=${PAGE_SIZE}&skip=${state.offset}&sort=date_received:desc`;

    let body: { results?: K510Row[]; error?: { message?: string } };
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "LensBot/1.0 (consumer welfare research)", Accept: "application/json" },
        signal: ctx.signal,
      });
      if (res.status === 404) {
        // openFDA returns 404 when skip exceeds result count — wrap around.
        await writeState(ctx, { offset: 0 });
        counters.log = "end of 510k dataset — wrapping to offset 0";
        return counters;
      }
      if (!res.ok) throw new Error(`http ${res.status}`);
      body = (await res.json()) as typeof body;
    } catch (err) {
      counters.errors.push((err as Error).message);
      return counters;
    }

    const rows = body.results ?? [];
    counters.rowsSeen = rows.length;
    if (rows.length === 0) {
      await writeState(ctx, { offset: 0 });
      return counters;
    }

    // First pass — collect brand slugs so FK constraint is satisfied.
    const brandMap = new Map<string, string>();
    for (const r of rows) {
      const applicant = (r.applicant ?? "").trim();
      if (!applicant) continue;
      const slug = slugify(applicant);
      if (!brandMap.has(slug)) brandMap.set(slug, applicant);
    }
    try {
      await ensureBrands(ctx.env, brandMap);
    } catch (err) {
      if (counters.errors.length < 10) counters.errors.push(`ensureBrands: ${(err as Error).message}`);
    }

    const BATCH = 20;
    for (let i = 0; i < rows.length; i += BATCH) {
      if (ctx.signal.aborted) break;
      const stmts: unknown[] = [];
      for (const r of rows.slice(i, i + BATCH)) {
        const kNumber = (r.k_number ?? "").trim();
        if (!kNumber) { counters.rowsSkipped++; continue; }
        const deviceName = (r.device_name || r.openfda?.device_name || "").trim();
        if (!deviceName) { counters.rowsSkipped++; continue; }
        const applicant = (r.applicant ?? "").trim();
        const brandSlug = applicant ? slugify(applicant) : "unknown";
        const skuId = `fda510k:${kNumber}`;
        const specs = {
          k_number: kNumber,
          product_code: r.product_code ?? null,
          device_class: r.openfda?.device_class ?? null,
          specialty: r.openfda?.medical_specialty_description ?? null,
          clearance_date: r.decision_date ?? r.date_received ?? null,
          applicant,
        };
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO sku_catalog (id, canonical_name, brand_slug, model_code, specs_json, first_seen_at, last_refreshed_at)
             VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
               canonical_name = excluded.canonical_name,
               specs_json = excluded.specs_json,
               last_refreshed_at = datetime('now')`,
          ).bind(skuId, deviceName.slice(0, 200), brandSlug, r.product_code ?? null, JSON.stringify(specs).slice(0, 16_000)),
        );
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO sku_source_link (sku_id, source_id, external_id, external_url, specs_json, observed_at, confidence, active)
             VALUES (?, ?, ?, ?, ?, datetime('now'), 0.95, 1)
             ON CONFLICT(sku_id, source_id, external_id) DO UPDATE SET
               external_url = excluded.external_url,
               specs_json = excluded.specs_json,
               observed_at = datetime('now'),
               active = 1`,
          ).bind(
            skuId,
            SOURCE_ID,
            kNumber,
            `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID=${encodeURIComponent(kNumber)}`,
            JSON.stringify(specs).slice(0, 16_000),
          ),
        );
      }
      if (stmts.length === 0) continue;
      try {
        await (ctx.env.LENS_D1 as unknown as { batch(s: unknown[]): Promise<unknown[]> }).batch(stmts);
        counters.rowsUpserted += stmts.length / 2;
      } catch (err) {
        if (counters.errors.length < 10) counters.errors.push((err as Error).message);
      }
      if ((i / BATCH) % 10 === 0) await ctx.progress({});
    }

    await writeState(ctx, { offset: state.offset + rows.length });
    counters.log = `offset=${state.offset} fetched=${rows.length}`;
    return counters;
  },
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "unknown";
}

interface State { offset: number }

async function readState(ctx: IngestionContext): Promise<State> {
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

async function writeState(ctx: IngestionContext, s: State): Promise<void> {
  await ctx.env.LENS_D1!.prepare("UPDATE data_source SET cursor_json = ? WHERE id = ?")
    .bind(JSON.stringify(s), SOURCE_ID)
    .run();
}
