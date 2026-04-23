// IMPROVEMENT_PLAN_V2 A-S23 — OpenLibrary ingester.
// Free, unauthenticated. 30M+ books. Endpoint: /search.json paginated.
// Each book = a SKU with ISBN-13 as gtin/ean.

import { ensureBrands, type DatasetIngester, type IngestionContext, type IngestionReport } from "../framework.js";

const SOURCE_ID = "openlibrary";
const PAGE_SIZE = 100;

interface OLSearchResp {
  docs?: Array<{
    key?: string;
    title?: string;
    author_name?: string[];
    publisher?: string[];
    isbn?: string[];
    cover_i?: number;
    first_publish_year?: number;
    language?: string[];
    number_of_pages_median?: number;
    subject_facet?: string[];
  }>;
  numFound?: number;
  offset?: number;
}

// Seed queries to rotate through — covers major book categories.
const QUERIES = [
  "*:*",  // all
  "subject:fiction",
  "subject:nonfiction",
  "subject:programming",
  "subject:science",
  "subject:business",
  "subject:biography",
  "subject:history",
  "subject:cookbook",
  "subject:health",
  "subject:psychology",
  "subject:philosophy",
];

export const openLibraryIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 180_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = { rowsSeen: 0, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };
    const state = await readState(ctx);
    const q = QUERIES[state.queryIndex % QUERIES.length]!;
    const offset = state.offset;
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&offset=${offset}&limit=${PAGE_SIZE}&fields=key,title,author_name,publisher,isbn,cover_i,first_publish_year,language,number_of_pages_median,subject_facet`;

    let body: OLSearchResp;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "LensBot/1.0 (felipe@lens-b1h.pages.dev)", Accept: "application/json" },
        signal: ctx.signal,
      });
      if (!res.ok) throw new Error(`http ${res.status}`);
      body = (await res.json()) as OLSearchResp;
    } catch (err) {
      counters.errors.push((err as Error).message);
      return counters;
    }
    const docs = body.docs ?? [];
    counters.rowsSeen = docs.length;

    // Upsert publishers as brands.
    const brands = new Map<string, string>();
    for (const d of docs) {
      const pub = (d.publisher ?? [])[0]?.trim();
      if (!pub) continue;
      const slug = pub.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
      if (slug && !brands.has(slug)) brands.set(slug, pub);
    }
    await ensureBrands(ctx.env, brands);

    const BATCH = 12;
    for (let i = 0; i < docs.length; i += BATCH) {
      if (ctx.signal.aborted) break;
      const stmts: unknown[] = [];
      for (const d of docs.slice(i, i + BATCH)) {
        if (!d.key || !d.title) {
          counters.rowsSkipped++;
          continue;
        }
        const isbn = (d.isbn ?? []).find((x) => x && x.replace(/\D/g, "").length >= 10);
        const isbn13 = (d.isbn ?? []).find((x) => x && x.replace(/\D/g, "").length === 13);
        const pub = (d.publisher ?? [])[0]?.trim() ?? "";
        const brandSlug = pub.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "unknown";
        const skuId = `ol:${d.key.replace(/^\/works\//, "")}`;
        const author = (d.author_name ?? [])[0] ?? "";
        const coverUrl = d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null;
        const specsJson = JSON.stringify({
          author,
          year: d.first_publish_year ?? null,
          pages: d.number_of_pages_median ?? null,
          language: (d.language ?? [])[0] ?? null,
          subjects: (d.subject_facet ?? []).slice(0, 5),
        });
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO sku_catalog (id, canonical_name, brand_slug, gtin, ean, image_url, specs_json, first_seen_at, last_refreshed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
               canonical_name = excluded.canonical_name,
               image_url = excluded.image_url,
               specs_json = excluded.specs_json,
               last_refreshed_at = datetime('now')`,
          ).bind(
            skuId,
            d.title.slice(0, 200),
            brandSlug,
            isbn13 ?? isbn ?? null,
            isbn13 ?? null,
            coverUrl,
            specsJson,
          ),
        );
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO sku_source_link (sku_id, source_id, external_id, external_url, specs_json, observed_at, confidence, active)
             VALUES (?, ?, ?, ?, ?, datetime('now'), 0.9, 1)
             ON CONFLICT(sku_id, source_id, external_id) DO UPDATE SET
               observed_at = datetime('now'),
               active = 1`,
          ).bind(skuId, SOURCE_ID, d.key, `https://openlibrary.org${d.key}`, specsJson),
        );
      }
      if (stmts.length === 0) continue;
      try {
        await (ctx.env.LENS_D1 as unknown as { batch(s: unknown[]): Promise<unknown[]> }).batch(stmts);
        counters.rowsUpserted += stmts.length / 2;
      } catch (err) {
        if (counters.errors.length < 10) counters.errors.push((err as Error).message);
      }
      if ((i / BATCH) % 20 === 0) await ctx.progress({});
    }

    const exhausted = docs.length < PAGE_SIZE;
    await writeState(ctx, exhausted
      ? { queryIndex: state.queryIndex + 1, offset: 0 }
      : { queryIndex: state.queryIndex, offset: offset + docs.length });

    return counters;
  },
};

async function readState(ctx: IngestionContext): Promise<{ queryIndex: number; offset: number }> {
  const row = await ctx.env.LENS_D1!.prepare("SELECT last_error FROM data_source WHERE id = ?")
    .bind(SOURCE_ID)
    .first<{ last_error: string | null }>();
  try {
    const p = JSON.parse(row?.last_error ?? "{}");
    return {
      queryIndex: typeof p.queryIndex === "number" ? p.queryIndex : 0,
      offset: typeof p.offset === "number" ? p.offset : 0,
    };
  } catch {
    return { queryIndex: 0, offset: 0 };
  }
}

async function writeState(ctx: IngestionContext, s: { queryIndex: number; offset: number }): Promise<void> {
  await ctx.env.LENS_D1!.prepare("UPDATE data_source SET last_error = ? WHERE id = ?")
    .bind(JSON.stringify(s), SOURCE_ID)
    .run();
}