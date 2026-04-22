// S6-W33 — FDA (drug + food + device) recall parser.
// Reference: openFDA /food/enforcement + /drug/enforcement + /device/enforcement.

import type { NormalizedRecall } from "./types.js";

export async function fetchFdaRecalls(): Promise<NormalizedRecall[]> {
  // Real crawl paginates across 3 openFDA endpoints; seeded fixture for the demo.
  return fixture ?? [];
}

let fixture: NormalizedRecall[] | null = null;
export function setFdaFixture(r: NormalizedRecall[] | null): void {
  fixture = r;
}

export interface FdaOpenResult {
  results?: Array<{
    product_description?: string;
    recalling_firm?: string;
    recall_number?: string;
    reason_for_recall?: string;
    recall_initiation_date?: string;
    voluntary_mandated?: string;
    product_type?: string;
    state?: string;
    event_id?: string;
  }>;
}

export function parseFdaOpen(
  data: FdaOpenResult,
  category: "food" | "drug" | "device",
): NormalizedRecall[] {
  const rows = data.results ?? [];
  const out: NormalizedRecall[] = [];
  for (const r of rows) {
    if (!r.recall_number) continue;
    out.push({
      source: "fda",
      recallId: `fda-${category}:${r.recall_number}`,
      title: `${r.recalling_firm ?? "FDA"} recall: ${(r.product_description ?? "").slice(0, 120)}`,
      description: r.reason_for_recall ?? "",
      brand: r.recalling_firm ?? "",
      productNames: [r.product_description ?? ""].filter(Boolean),
      hazard: r.reason_for_recall ?? "",
      remedyText: "Discontinue use and contact the firm for a refund or replacement. See FDA recall notice for detail.",
      publishedAt: normalizeDate(r.recall_initiation_date ?? ""),
      sourceUrl: r.recall_number
        ? `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfRES/res.cfm?id=${encodeURIComponent(r.recall_number)}`
        : "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts",
    });
  }
  return out;
}

function normalizeDate(s: string): string {
  if (!s) return new Date().toISOString();
  // openFDA dates are "YYYYMMDD" strings
  if (/^\d{8}$/.test(s)) {
    const y = s.slice(0, 4);
    const m = s.slice(4, 6);
    const d = s.slice(6, 8);
    return `${y}-${m}-${d}T00:00:00Z`;
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}
