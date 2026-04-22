// S6-W33 — NHTSA (vehicle + car seat) recall API parser.
// Reference: https://api.nhtsa.gov/recalls/ (JSON).

import type { NormalizedRecall } from "./types.js";

const NHTSA_API_URL =
  "https://api.nhtsa.gov/recalls/recallsByVehicle?make=ALL&year=0";
// The real-use query per VIN is GET /recalls/recallsByVin/:vin. For the
// ambient watcher we fetch a broader set of recent recalls via a separate
// CSV feed; for the hackathon, we expose parseNhtsaJson so fixtures seed it.

export async function fetchNhtsaRecalls(
  _env: { fetch?: typeof fetch } = {},
): Promise<NormalizedRecall[]> {
  // Real feed crawl is rate-limited + paginated. For the demo, a seeded
  // fixture is injected via setNhtsaFixture(); otherwise returns [].
  return fixture ?? [];
}

let fixture: NormalizedRecall[] | null = null;
export function setNhtsaFixture(r: NormalizedRecall[] | null): void {
  fixture = r;
}

export interface NhtsaJsonResult {
  Count?: number;
  results?: Array<{
    Manufacturer?: string;
    NHTSACampaignNumber?: string;
    ReportReceivedDate?: string;
    Component?: string;
    Summary?: string;
    Consequence?: string;
    Remedy?: string;
    ModelYear?: string;
    Make?: string;
    Model?: string;
  }>;
}

export function parseNhtsaJson(data: NhtsaJsonResult): NormalizedRecall[] {
  const rows = data.results ?? [];
  const out: NormalizedRecall[] = [];
  for (const r of rows) {
    if (!r.NHTSACampaignNumber) continue;
    const productName = [r.ModelYear, r.Make, r.Model].filter(Boolean).join(" ");
    const brand = r.Make ?? r.Manufacturer ?? "";
    const title = `${brand} ${productName} recall: ${r.Component ?? "component"}`.trim();
    out.push({
      source: "nhtsa",
      recallId: `nhtsa:${r.NHTSACampaignNumber}`,
      title,
      description: r.Summary ?? "",
      brand,
      productNames: [productName].filter(Boolean),
      hazard: r.Consequence ?? "",
      remedyText: r.Remedy ?? "Contact the manufacturer for an inspection or repair.",
      publishedAt: normalizeDate(r.ReportReceivedDate ?? ""),
      sourceUrl: `https://www.nhtsa.gov/recalls?nhtsaId=${encodeURIComponent(r.NHTSACampaignNumber)}`,
    });
  }
  return out;
}

function normalizeDate(s: string): string {
  if (!s) return new Date().toISOString();
  const d = new Date(s);
  if (isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}
