// S6-W33 — CPSC (Consumer Product Safety Commission) recall feed.
// Reference: https://www.cpsc.gov/Recalls RSS / Atom feed.
// Parser is hand-rolled to avoid pulling in a full XML lib on the Worker.

import type { NormalizedRecall } from "./types.js";

const CPSC_FEED_URL = "https://www.cpsc.gov/Newsroom/News-Releases/Recalls/Feed";

export interface CpscFetchEnv {
  fetch?: typeof fetch;
}

export async function fetchCpscRecalls(
  env: CpscFetchEnv = {},
): Promise<NormalizedRecall[]> {
  const fn = env.fetch ?? fetch;
  const res = await fn(CPSC_FEED_URL, {
    headers: { accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8" },
  });
  if (!res.ok) return [];
  const xml = await res.text();
  return parseCpscRss(xml);
}

/**
 * Parse a CPSC RSS/Atom feed into normalized recall records.
 * Handles both <item> (RSS) and <entry> (Atom) element shapes.
 */
export function parseCpscRss(xml: string): NormalizedRecall[] {
  const items = extractBlocks(xml, "item").length > 0
    ? extractBlocks(xml, "item")
    : extractBlocks(xml, "entry");
  const out: NormalizedRecall[] = [];
  for (const block of items) {
    const title = stripCdata(extractTag(block, "title")) ?? "";
    const link = stripCdata(extractTag(block, "link")) ?? "";
    const description = stripCdata(extractTag(block, "description") ?? extractTag(block, "summary")) ?? "";
    const pubDate =
      stripCdata(extractTag(block, "pubDate") ?? extractTag(block, "updated") ?? extractTag(block, "published")) ?? "";

    if (!title) continue;
    // CPSC titles look like: "Brand Name Recalls Product Model Due To Hazard"
    const { brand, productNames, hazard } = parseCpscTitle(title);
    const recallId = deriveId(link, title);
    out.push({
      source: "cpsc",
      recallId: `cpsc:${recallId}`,
      title,
      description: stripTags(description),
      brand,
      productNames,
      hazard,
      remedyText: extractRemedy(description) ?? "Contact the manufacturer for a refund or replacement. See the CPSC notice for details.",
      publishedAt: normalizeDate(pubDate),
      sourceUrl: link,
    });
  }
  return out;
}

function extractBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1] ?? "");
  return out;
}

function extractTag(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = re.exec(block);
  return m ? (m[1] ?? null) : null;
}

function stripCdata(s: string | null): string | null {
  if (!s) return null;
  const m = /<!\[CDATA\[([\s\S]*?)\]\]>/.exec(s);
  return (m ? m[1]! : s).trim();
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function normalizeDate(s: string): string {
  if (!s) return new Date().toISOString();
  const d = new Date(s);
  if (isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

function deriveId(link: string, title: string): string {
  try {
    const u = new URL(link);
    const last = u.pathname.replace(/\/$/, "").split("/").pop();
    if (last) return last;
  } catch {
    // ignore
  }
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80);
}

/** Parse "[Brand] Recalls [Product] Due To [Hazard]" */
export function parseCpscTitle(title: string): {
  brand: string;
  productNames: string[];
  hazard: string;
} {
  const t = title.trim();
  // Regex captures: (brand) Recalls (product) Due To (hazard) | Risk of (hazard)
  const re = /^(.*?)\s+Recalls?\s+(.*?)\s+(?:Due\s+to|Because\s+of|Over|Following|Due\s+to\s+Risk\s+of|Due\s+to\s+Reports\s+of)\s+(.+?)(?:\s+Hazard)?\s*$/i;
  const m = re.exec(t);
  if (m) {
    const brand = (m[1] ?? "").trim();
    const productsBlob = (m[2] ?? "").trim();
    const hazard = (m[3] ?? "").trim();
    return {
      brand,
      productNames: splitProducts(productsBlob),
      hazard,
    };
  }
  // Fallback: first capitalized word-block = brand
  const brandMatch = /^([A-Z][\w&'-]*(?:\s+[A-Z][\w&'-]*)*)/.exec(t);
  const brand = brandMatch ? brandMatch[1]!.trim() : "";
  return {
    brand,
    productNames: [t.replace(brand, "").trim()].filter(Boolean),
    hazard: "",
  };
}

function splitProducts(blob: string): string[] {
  if (!blob) return [];
  return blob
    .split(/[;,]| and /i)
    .map((s) => s.trim())
    .filter((s) => s.length > 2)
    .slice(0, 8);
}

function extractRemedy(description: string): string | null {
  const stripped = stripTags(description);
  // CPSC descriptions commonly include "Remedy:" or "Consumers should"
  const m = /(remedy:?|consumers should)\s+([^.]{10,200}\.)/i.exec(stripped);
  return m ? m[0].trim() : null;
}
