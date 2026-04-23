// IMPROVEMENT_PLAN_V2 A-S24 — MusicBrainz ingester (physical music media).
// Free API. ~3M releases. Populates sku_catalog for vinyl/CD/cassette media.

import { ensureBrands, type DatasetIngester, type IngestionContext, type IngestionReport } from "../framework.js";

const SOURCE_ID = "musicbrainz";
const PAGE_SIZE = 100;

interface MBResp {
  releases?: Array<{
    id?: string;
    title?: string;
    date?: string;
    country?: string;
    barcode?: string;
    status?: string;
    "artist-credit"?: Array<{ artist?: { id?: string; name?: string } }>;
    "label-info"?: Array<{ label?: { id?: string; name?: string } }>;
    media?: Array<{ format?: string; "track-count"?: number }>;
  }>;
  count?: number;
}

export const musicBrainzIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 120_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = { rowsSeen: 0, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };
    const state = await readState(ctx);
    const offset = state.offset;
    // Search by country:US | status:official | pagination
    const url = `https://musicbrainz.org/ws/2/release?query=status:official AND country:US AND format:Vinyl OR format:CD&limit=${PAGE_SIZE}&offset=${offset}&fmt=json`;

    let body: MBResp;
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "LensBot/1.0 (felipe@lens-b1h.pages.dev)",
          Accept: "application/json",
        },
        signal: ctx.signal,
      });
      if (!res.ok) throw new Error(`http ${res.status}`);
      body = (await res.json()) as MBResp;
    } catch (err) {
      counters.errors.push((err as Error).message);
      return counters;
    }
    const releases = body.releases ?? [];
    counters.rowsSeen = releases.length;

    // Upsert all labels as brands.
    const brands = new Map<string, string>();
    for (const r of releases) {
      const label = r["label-info"]?.[0]?.label?.name;
      if (!label) continue;
      const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
      if (slug && !brands.has(slug)) brands.set(slug, label);
    }
    await ensureBrands(ctx.env, brands);

    const BATCH = 15;
    for (let i = 0; i < releases.length; i += BATCH) {
      if (ctx.signal.aborted) break;
      const stmts: unknown[] = [];
      for (const r of releases.slice(i, i + BATCH)) {
        if (!r.id || !r.title) {
          counters.rowsSkipped++;
          continue;
        }
        const artist = r["artist-credit"]?.[0]?.artist?.name ?? "";
        const label = r["label-info"]?.[0]?.label?.name ?? "";
        const brandSlug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "unknown";
        const format = r.media?.[0]?.format ?? "";
        const skuId = `mb:${r.id}`;
        const name = `${artist} — ${r.title} (${format})`.slice(0, 200);
        const specsJson = JSON.stringify({
          artist,
          label,
          format,
          country: r.country ?? null,
          date: r.date ?? null,
          barcode: r.barcode ?? null,
          track_count: r.media?.[0]?.["track-count"] ?? null,
        });
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO sku_catalog (id, canonical_name, brand_slug, gtin, specs_json, first_seen_at, last_refreshed_at)
             VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
               canonical_name = excluded.canonical_name,
               specs_json = excluded.specs_json,
               last_refreshed_at = datetime('now')`,
          ).bind(skuId, name, brandSlug, r.barcode ?? null, specsJson),
        );
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO sku_source_link (sku_id, source_id, external_id, external_url, specs_json, observed_at, confidence, active)
             VALUES (?, ?, ?, ?, ?, datetime('now'), 0.85, 1)
             ON CONFLICT(sku_id, source_id, external_id) DO UPDATE SET
               observed_at = datetime('now'),
               active = 1`,
          ).bind(skuId, SOURCE_ID, r.id, `https://musicbrainz.org/release/${r.id}`, specsJson),
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

    await writeState(ctx, { offset: releases.length === PAGE_SIZE ? offset + PAGE_SIZE : 0 });
    return counters;
  },
};

async function readState(ctx: IngestionContext): Promise<{ offset: number }> {
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

async function writeState(ctx: IngestionContext, s: { offset: number }): Promise<void> {
  await ctx.env.LENS_D1!.prepare("UPDATE data_source SET cursor_json = ? WHERE id = ?")
    .bind(JSON.stringify(s), SOURCE_ID)
    .run();
}