// IMPROVEMENT_PLAN_V2 A-S21 — FTC enforcement actions ingester.
// FTC retired their RSS feeds during 2025-2026, so we scrape the public
// press-releases listing pages (Drupal-backed, stable URL structure) and
// extract the h3.node-title anchors. URLs always carry YYYY/MM which we
// parse into an effective_date. Keyword-filtered to consumer-protection +
// enforcement actions only (skips pure speeches, appointments, etc.).

import type { DatasetIngester, IngestionContext, IngestionReport } from "../framework.js";

const SOURCE_ID = "ftc-enforcement";
const LISTING_URL_BASE = "https://www.ftc.gov/news-events/news/press-releases";
const PAGES_PER_RUN = 5; // ~50-75 press releases per run, rotates through.

interface Release { url: string; title: string; year: number; month: number; slug: string }

export const ftcEnforcementIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 120_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = { rowsSeen: 0, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };
    const startPage = await readPage(ctx);
    const releases: Release[] = [];

    for (let offset = 0; offset < PAGES_PER_RUN; offset++) {
      if (ctx.signal.aborted) break;
      const p = startPage + offset;
      try {
        const html = await fetchListing(p, ctx.signal);
        const found = parseListing(html);
        if (found.length === 0) break; // past the end
        releases.push(...found);
      } catch (err) {
        counters.errors.push(`page ${p}: ${(err as Error).message}`);
        if (counters.errors.length > 3) break;
      }
    }

    // Dedupe by URL.
    const seen = new Set<string>();
    const unique = releases.filter((r) => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    });
    counters.rowsSeen = unique.length;

    const KEYWORDS = [
      "sues", "sue ", "settle", "settles", "settlement", "complaint",
      "enforcement", "deceptive", "mislead", "fine", "fines",
      "order", "orders", "injunction", "action", "ban", "bans",
      "charge", "charges", "refund", "refunds", "fraud", "scam",
      "stop", "stops", "deceptive", "violation", "consent",
    ];

    const BATCH = 20;
    for (let i = 0; i < unique.length; i += BATCH) {
      if (ctx.signal.aborted) break;
      const stmts: unknown[] = [];
      for (const r of unique.slice(i, i + BATCH)) {
        const low = r.title.toLowerCase();
        const match = KEYWORDS.some((k) => low.includes(k));
        if (!match) { counters.rowsSkipped++; continue; }
        const id = `ftc:${r.slug}`;
        const effective = `${r.year}-${String(r.month).padStart(2, "0")}-01T00:00:00`;
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO regulation_event (id, source_id, external_id, jurisdiction, citation, title, status, effective_date, scope_summary, url, raw_json)
             VALUES (?, ?, ?, 'us-federal-ftc-action', 'FTC Enforcement', ?, 'in-force', ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               title = excluded.title,
               scope_summary = excluded.scope_summary,
               effective_date = excluded.effective_date,
               raw_json = excluded.raw_json`,
          ).bind(
            id,
            SOURCE_ID,
            id,
            r.title.slice(0, 400),
            effective,
            r.title.slice(0, 1000),
            r.url,
            JSON.stringify({ title: r.title, url: r.url, year: r.year, month: r.month, slug: r.slug }).slice(0, 32_000),
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

    // Rotate page cursor so successive runs see older releases.
    const nextPage = unique.length === 0 ? 0 : (startPage + PAGES_PER_RUN) % 40;
    await writePage(ctx, nextPage);
    return counters;
  },
};

async function fetchListing(page: number, signal: AbortSignal): Promise<string> {
  const url = `${LISTING_URL_BASE}?page=${page}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Lens welfare crawler; contact=github.com/FelipeMAffonso/lens)",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal,
  });
  if (!res.ok) throw new Error(`http ${res.status}`);
  return await res.text();
}

function parseListing(html: string): Release[] {
  const out: Release[] = [];
  const re = /class="node-title"><a\s+href="(\/news-events\/news\/press-releases\/(\d{4})\/(\d{2})\/([^"]+))"[^>]*>([^<]+)</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const path = m[1]!;
    const year = parseInt(m[2]!, 10);
    const month = parseInt(m[3]!, 10);
    const slug = m[4]!;
    const title = decodeEntities(m[5]!).trim();
    if (!title || !slug) continue;
    out.push({ url: `https://www.ftc.gov${path}`, title, year, month, slug });
  }
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

async function readPage(ctx: IngestionContext): Promise<number> {
  const row = await ctx.env.LENS_D1!.prepare("SELECT last_error FROM data_source WHERE id = ?")
    .bind(SOURCE_ID)
    .first<{ last_error: string | null }>();
  try {
    const p = JSON.parse(row?.last_error ?? "{}");
    return typeof p.page === "number" ? p.page : 0;
  } catch {
    return 0;
  }
}

async function writePage(ctx: IngestionContext, page: number): Promise<void> {
  await ctx.env.LENS_D1!.prepare("UPDATE data_source SET last_error = ? WHERE id = ?")
    .bind(JSON.stringify({ page }), SOURCE_ID)
    .run();
}
