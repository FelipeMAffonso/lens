// IMPROVEMENT_PLAN_V2 A-S21 — FTC enforcement actions ingester.
// FTC publishes a public press-releases API. We filter for consumer-protection
// actions (cases against retailers, advertisers, dark patterns, etc.) and
// persist as regulation_event rows with jurisdiction='us-federal-ftc-action'.

import type { DatasetIngester, IngestionContext, IngestionReport } from "../framework.js";

const SOURCE_ID = "ftc-enforcement";
const PAGE_SIZE = 50;

export const ftcEnforcementIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 120_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = { rowsSeen: 0, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };
    const page = await readPage(ctx);

    const url = `https://www.ftc.gov/system/files/attachments/press-releases/ftc_press_releases_${page}.json`;
    // Fallback: use FTC's enforcement/cases-proceedings RSS
    const rssUrl = "https://www.ftc.gov/news-events/news/rss.xml";

    let rss = "";
    try {
      const res = await fetch(rssUrl, { headers: { "User-Agent": "LensBot/1.0" }, signal: ctx.signal });
      if (!res.ok) throw new Error(`http ${res.status}`);
      rss = await res.text();
    } catch (err) {
      counters.errors.push((err as Error).message);
      return counters;
    }

    const items = extractBlocks(rss, "item").slice(0, 60);
    counters.rowsSeen = items.length;

    const BATCH = 20;
    for (let i = 0; i < items.length; i += BATCH) {
      if (ctx.signal.aborted) break;
      const stmts: unknown[] = [];
      for (const it of items.slice(i, i + BATCH)) {
        const title = stripTag(extractTag(it, "title"));
        const link = stripTag(extractTag(it, "link"));
        const pubDate = stripTag(extractTag(it, "pubDate"));
        const desc = stripTag(extractTag(it, "description"));
        if (!title || !link) {
          counters.rowsSkipped++;
          continue;
        }
        // Filter: is this actually an enforcement / consumer-protection action?
        const keywords = ["settles", "sue", "complaint", "enforcement", "deceptive", "mislead", "fine", "settlement", "order", "injunction", "action"];
        const low = (title + " " + desc).toLowerCase();
        if (!keywords.some((k) => low.includes(k))) {
          counters.rowsSkipped++;
          continue;
        }
        const id = `ftc:${link.split("/").filter(Boolean).pop() ?? title.slice(0, 80)}`;
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
            title.slice(0, 400),
            pubDate ? new Date(pubDate).toISOString().slice(0, 19) : null,
            desc.slice(0, 1000),
            link,
            JSON.stringify({ title, link, pubDate, desc }).slice(0, 32_000),
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

    await writePage(ctx, page + 1);
    return counters;
  },
};

function extractBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[\\s>][^]*?</${tag}>`, "gi");
  return xml.match(re) ?? [];
}

function extractTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([^]*?)</${tag}>`, "i");
  const m = block.match(re);
  return m ? m[1]! : "";
}

function stripTag(s: string): string {
  return s
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

async function readPage(ctx: IngestionContext): Promise<number> {
  const row = await ctx.env.LENS_D1!.prepare("SELECT last_error FROM data_source WHERE id = ?")
    .bind(SOURCE_ID)
    .first<{ last_error: string | null }>();
  try {
    const p = JSON.parse(row?.last_error ?? "{}");
    return typeof p.page === "number" ? p.page : 1;
  } catch {
    return 1;
  }
}

async function writePage(ctx: IngestionContext, page: number): Promise<void> {
  await ctx.env.LENS_D1!.prepare("UPDATE data_source SET last_error = ? WHERE id = ?")
    .bind(JSON.stringify({ page }), SOURCE_ID)
    .run();
}