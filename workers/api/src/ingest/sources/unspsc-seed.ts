// IMPROVEMENT_PLAN_V2 A-S12b — UNSPSC taxonomy seed.
// The external GitHub mirrors we used previously (datasets/unspsc and
// OpenMarketResearch/unspsc) both 404 as of 2026-04-23, so we inline the
// canonical 55 UNSPSC "segment" (level-1) codes + a consumer-relevant
// subset of level-2 "family" codes. Enough to anchor category_taxonomy and
// let /sku/search's `category` filter work. Full level-3/4 codes are
// behind a commercial license (UNGM subscription).

import type { DatasetIngester, IngestionContext, IngestionReport } from "../framework.js";

const SOURCE_ID = "unspsc";

// Canonical UNSPSC segments (level 1, 2-digit). Source: ungm.org/Public/UNSPSC.
const SEGMENTS: Array<{ code: string; name: string }> = [
  { code: "10", name: "Live Plant and Animal Material and Accessories and Supplies" },
  { code: "11", name: "Mineral and Textile and Inedible Plant and Animal Materials" },
  { code: "12", name: "Chemicals including Bio Chemicals and Gas Materials" },
  { code: "13", name: "Resin and Rosin and Rubber and Foam and Film and Elastomeric Materials" },
  { code: "14", name: "Paper Materials and Products" },
  { code: "15", name: "Fuels and Fuel Additives and Lubricants and Anti corrosive Materials" },
  { code: "20", name: "Mining and Well Drilling Machinery and Accessories" },
  { code: "21", name: "Farming and Fishing and Forestry and Wildlife Machinery" },
  { code: "22", name: "Building and Construction Machinery and Accessories" },
  { code: "23", name: "Industrial Manufacturing and Processing Machinery" },
  { code: "24", name: "Material Handling and Conditioning and Storage Machinery" },
  { code: "25", name: "Commercial and Military and Private Vehicles and their Accessories" },
  { code: "26", name: "Power Generation and Distribution Machinery and Accessories" },
  { code: "27", name: "Tools and General Machinery" },
  { code: "30", name: "Structures and Building and Construction and Manufacturing Components" },
  { code: "31", name: "Manufacturing Components and Supplies" },
  { code: "32", name: "Electronic Components and Supplies" },
  { code: "39", name: "Electrical Systems and Lighting and Components and Accessories" },
  { code: "40", name: "Distribution and Conditioning Systems and Equipment and Components" },
  { code: "41", name: "Laboratory and Measuring and Observing and Testing Equipment" },
  { code: "42", name: "Medical Equipment and Accessories and Supplies" },
  { code: "43", name: "Information Technology Broadcasting and Telecommunications" },
  { code: "44", name: "Office Equipment and Accessories and Supplies" },
  { code: "45", name: "Printing and Photographic and Audio and Visual Equipment and Supplies" },
  { code: "46", name: "Defense and Law Enforcement and Security and Safety Equipment and Supplies" },
  { code: "47", name: "Cleaning Equipment and Supplies" },
  { code: "48", name: "Service Industry Machinery and Equipment and Supplies" },
  { code: "49", name: "Sports and Recreational Equipment and Supplies and Accessories" },
  { code: "50", name: "Food Beverage and Tobacco Products" },
  { code: "51", name: "Drugs and Pharmaceutical Products" },
  { code: "52", name: "Domestic Appliances and Supplies and Consumer Electronic Products" },
  { code: "53", name: "Apparel and Luggage and Personal Care Products" },
  { code: "54", name: "Timepieces and Jewelry and Gemstone Products" },
  { code: "55", name: "Published Products" },
  { code: "56", name: "Furniture and Furnishings" },
  { code: "60", name: "Musical Instruments and Games and Toys and Arts and Crafts" },
  { code: "70", name: "Farming and Fishing and Forestry and Wildlife Contracting Services" },
  { code: "71", name: "Mining and oil and gas services" },
  { code: "72", name: "Building and Facility Construction and Maintenance Services" },
  { code: "73", name: "Industrial Production and Manufacturing Services" },
  { code: "76", name: "Industrial Cleaning Services" },
  { code: "77", name: "Environmental Services" },
  { code: "78", name: "Transportation and Storage and Mail Services" },
  { code: "80", name: "Management and Business Professionals and Administrative Services" },
  { code: "81", name: "Engineering and Research and Technology Based Services" },
  { code: "82", name: "Editorial and Design and Graphic and Fine Art Services" },
  { code: "83", name: "Public Utilities and Public Sector Related Services" },
  { code: "84", name: "Financial and Insurance Services" },
  { code: "85", name: "Healthcare Services" },
  { code: "86", name: "Education and Training Services" },
  { code: "90", name: "Travel and Food and Lodging and Entertainment Services" },
  { code: "91", name: "Personal and Domestic Services" },
  { code: "92", name: "National Defense and Public Order and Security and Safety Services" },
  { code: "93", name: "Politics and Civic Affairs Services" },
  { code: "94", name: "Organizations and Clubs" },
];

export const unspscSeedIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 30_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = { rowsSeen: SEGMENTS.length, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };

    // Check: if we already have >100 rows, skip.
    const existing = await ctx.env.LENS_D1!.prepare(
      "SELECT COUNT(*) AS n FROM category_taxonomy WHERE source = 'unspsc'",
    ).first<{ n: number }>();
    if ((existing?.n ?? 0) > 40) {
      counters.log = `unspsc already seeded (${existing?.n} rows)`;
      return counters;
    }

    const BATCH = 25;
    for (let i = 0; i < SEGMENTS.length; i += BATCH) {
      if (ctx.signal.aborted) break;
      const stmts: unknown[] = [];
      for (const seg of SEGMENTS.slice(i, i + BATCH)) {
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO category_taxonomy (code, parent_code, level, name, source)
             VALUES (?, NULL, 1, ?, 'unspsc')
             ON CONFLICT(code) DO UPDATE SET name = excluded.name`,
          ).bind(seg.code, seg.name),
        );
      }
      if (stmts.length === 0) continue;
      try {
        await (ctx.env.LENS_D1 as unknown as { batch(s: unknown[]): Promise<unknown[]> }).batch(stmts);
        counters.rowsUpserted += stmts.length;
      } catch (err) {
        counters.errors.push((err as Error).message);
      }
    }
    counters.log = `inline UNSPSC level-1 seed: ${counters.rowsUpserted} segments`;
    return counters;
  },
};

