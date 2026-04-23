// IMPROVEMENT_PLAN_V2 A-S25 — GS1 country-of-origin enricher.
//
// GTIN/EAN barcodes encode the country of the company's GS1 registration
// prefix. This is NOT strictly country of manufacture, but it's the best
// public signal of "who's behind the barcode" — e.g. a product with GS1
// prefix 690-699 was registered by a China-HQ'd company. The full table is
// GS1's published Global Company Prefix Range list.
//
// This ingester doesn't HIT an external API. It scans existing sku_catalog
// rows with non-null gtin/ean, looks up the prefix in a bundled table,
// and writes an enrichment row into sku_source_link with source='gs1-origin'
// containing `country_code` and `country_name` in specs_json.
//
// User framing (2026-04-22): origin transparency, not criticism. When a
// product brands itself as USA but registers under a China prefix, we
// surface the fact — the user can decide what to make of it.

import type { DatasetIngester, IngestionContext, IngestionReport } from "../framework.js";

const SOURCE_ID = "gs1-origin";
const BATCH_SIZE = 200;

// GS1 prefix → {country, code}. Source: https://www.gs1.org/standards/id-keys/company-prefix
// Condensed to major ranges. Expandable over time.
const PREFIX_RANGES: Array<{ from: number; to: number; country: string; code: string }> = [
  { from: 0, to: 19, country: "United States & Canada", code: "US/CA" },
  { from: 30, to: 39, country: "United States", code: "US" },
  { from: 60, to: 139, country: "United States & Canada", code: "US/CA" },
  { from: 200, to: 299, country: "Restricted circulation (in-store)", code: "--" },
  { from: 300, to: 379, country: "France", code: "FR" },
  { from: 380, to: 380, country: "Bulgaria", code: "BG" },
  { from: 383, to: 383, country: "Slovenia", code: "SI" },
  { from: 385, to: 385, country: "Croatia", code: "HR" },
  { from: 387, to: 387, country: "Bosnia and Herzegovina", code: "BA" },
  { from: 389, to: 389, country: "Montenegro", code: "ME" },
  { from: 390, to: 390, country: "Kosovo", code: "XK" },
  { from: 400, to: 440, country: "Germany", code: "DE" },
  { from: 450, to: 459, country: "Japan", code: "JP" },
  { from: 460, to: 469, country: "Russia", code: "RU" },
  { from: 470, to: 470, country: "Kyrgyzstan", code: "KG" },
  { from: 471, to: 471, country: "Taiwan", code: "TW" },
  { from: 474, to: 474, country: "Estonia", code: "EE" },
  { from: 475, to: 475, country: "Latvia", code: "LV" },
  { from: 476, to: 476, country: "Azerbaijan", code: "AZ" },
  { from: 477, to: 477, country: "Lithuania", code: "LT" },
  { from: 478, to: 478, country: "Uzbekistan", code: "UZ" },
  { from: 479, to: 479, country: "Sri Lanka", code: "LK" },
  { from: 480, to: 480, country: "Philippines", code: "PH" },
  { from: 481, to: 481, country: "Belarus", code: "BY" },
  { from: 482, to: 482, country: "Ukraine", code: "UA" },
  { from: 483, to: 483, country: "Turkmenistan", code: "TM" },
  { from: 484, to: 484, country: "Moldova", code: "MD" },
  { from: 485, to: 485, country: "Armenia", code: "AM" },
  { from: 486, to: 486, country: "Georgia", code: "GE" },
  { from: 487, to: 487, country: "Kazakhstan", code: "KZ" },
  { from: 488, to: 488, country: "Tajikistan", code: "TJ" },
  { from: 489, to: 489, country: "Hong Kong", code: "HK" },
  { from: 490, to: 499, country: "Japan", code: "JP" },
  { from: 500, to: 509, country: "United Kingdom", code: "GB" },
  { from: 520, to: 521, country: "Greece", code: "GR" },
  { from: 528, to: 528, country: "Lebanon", code: "LB" },
  { from: 529, to: 529, country: "Cyprus", code: "CY" },
  { from: 530, to: 530, country: "Albania", code: "AL" },
  { from: 531, to: 531, country: "North Macedonia", code: "MK" },
  { from: 535, to: 535, country: "Malta", code: "MT" },
  { from: 539, to: 539, country: "Ireland", code: "IE" },
  { from: 540, to: 549, country: "Belgium & Luxembourg", code: "BE/LU" },
  { from: 560, to: 560, country: "Portugal", code: "PT" },
  { from: 569, to: 569, country: "Iceland", code: "IS" },
  { from: 570, to: 579, country: "Denmark, Faroe Islands & Greenland", code: "DK" },
  { from: 590, to: 590, country: "Poland", code: "PL" },
  { from: 594, to: 594, country: "Romania", code: "RO" },
  { from: 599, to: 599, country: "Hungary", code: "HU" },
  { from: 600, to: 601, country: "South Africa", code: "ZA" },
  { from: 603, to: 603, country: "Ghana", code: "GH" },
  { from: 604, to: 604, country: "Senegal", code: "SN" },
  { from: 606, to: 606, country: "Uzbekistan", code: "UZ" },
  { from: 608, to: 608, country: "Bahrain", code: "BH" },
  { from: 609, to: 609, country: "Mauritius", code: "MU" },
  { from: 611, to: 611, country: "Morocco", code: "MA" },
  { from: 613, to: 613, country: "Algeria", code: "DZ" },
  { from: 615, to: 615, country: "Nigeria", code: "NG" },
  { from: 616, to: 616, country: "Kenya", code: "KE" },
  { from: 618, to: 618, country: "Côte d'Ivoire", code: "CI" },
  { from: 619, to: 619, country: "Tunisia", code: "TN" },
  { from: 620, to: 620, country: "Tanzania", code: "TZ" },
  { from: 621, to: 621, country: "Syria", code: "SY" },
  { from: 622, to: 622, country: "Egypt", code: "EG" },
  { from: 623, to: 623, country: "Brunei", code: "BN" },
  { from: 624, to: 624, country: "Libya", code: "LY" },
  { from: 625, to: 625, country: "Jordan", code: "JO" },
  { from: 626, to: 626, country: "Iran", code: "IR" },
  { from: 627, to: 627, country: "Kuwait", code: "KW" },
  { from: 628, to: 628, country: "Saudi Arabia", code: "SA" },
  { from: 629, to: 629, country: "United Arab Emirates", code: "AE" },
  { from: 630, to: 630, country: "Qatar", code: "QA" },
  { from: 640, to: 649, country: "Finland", code: "FI" },
  { from: 690, to: 699, country: "China", code: "CN" },
  { from: 700, to: 709, country: "Norway", code: "NO" },
  { from: 729, to: 729, country: "Israel", code: "IL" },
  { from: 730, to: 739, country: "Sweden", code: "SE" },
  { from: 740, to: 740, country: "Guatemala", code: "GT" },
  { from: 741, to: 741, country: "El Salvador", code: "SV" },
  { from: 742, to: 742, country: "Honduras", code: "HN" },
  { from: 743, to: 743, country: "Nicaragua", code: "NI" },
  { from: 744, to: 744, country: "Costa Rica", code: "CR" },
  { from: 745, to: 745, country: "Panama", code: "PA" },
  { from: 746, to: 746, country: "Dominican Republic", code: "DO" },
  { from: 750, to: 750, country: "Mexico", code: "MX" },
  { from: 754, to: 755, country: "Canada", code: "CA" },
  { from: 759, to: 759, country: "Venezuela", code: "VE" },
  { from: 760, to: 769, country: "Switzerland & Liechtenstein", code: "CH/LI" },
  { from: 770, to: 771, country: "Colombia", code: "CO" },
  { from: 773, to: 773, country: "Uruguay", code: "UY" },
  { from: 775, to: 775, country: "Peru", code: "PE" },
  { from: 777, to: 777, country: "Bolivia", code: "BO" },
  { from: 778, to: 779, country: "Argentina", code: "AR" },
  { from: 780, to: 780, country: "Chile", code: "CL" },
  { from: 784, to: 784, country: "Paraguay", code: "PY" },
  { from: 786, to: 786, country: "Ecuador", code: "EC" },
  { from: 789, to: 790, country: "Brazil", code: "BR" },
  { from: 800, to: 839, country: "Italy, San Marino & Vatican City", code: "IT" },
  { from: 840, to: 849, country: "Spain & Andorra", code: "ES" },
  { from: 850, to: 850, country: "Cuba", code: "CU" },
  { from: 858, to: 858, country: "Slovakia", code: "SK" },
  { from: 859, to: 859, country: "Czech Republic", code: "CZ" },
  { from: 860, to: 860, country: "Serbia", code: "RS" },
  { from: 865, to: 865, country: "Mongolia", code: "MN" },
  { from: 867, to: 867, country: "North Korea", code: "KP" },
  { from: 868, to: 869, country: "Turkey", code: "TR" },
  { from: 870, to: 879, country: "Netherlands", code: "NL" },
  { from: 880, to: 881, country: "South Korea", code: "KR" },
  { from: 883, to: 883, country: "Myanmar", code: "MM" },
  { from: 884, to: 884, country: "Cambodia", code: "KH" },
  { from: 885, to: 885, country: "Thailand", code: "TH" },
  { from: 888, to: 888, country: "Singapore", code: "SG" },
  { from: 890, to: 890, country: "India", code: "IN" },
  { from: 893, to: 893, country: "Vietnam", code: "VN" },
  { from: 896, to: 896, country: "Pakistan", code: "PK" },
  { from: 899, to: 899, country: "Indonesia", code: "ID" },
  { from: 900, to: 919, country: "Austria", code: "AT" },
  { from: 930, to: 939, country: "Australia", code: "AU" },
  { from: 940, to: 949, country: "New Zealand", code: "NZ" },
  { from: 950, to: 950, country: "GS1 Global Office (special applications)", code: "--" },
  { from: 955, to: 955, country: "Malaysia", code: "MY" },
  { from: 958, to: 958, country: "Macau", code: "MO" },
  { from: 977, to: 977, country: "Serial publications (ISSN)", code: "--" },
  { from: 978, to: 979, country: "Bookland (ISBN)", code: "--" },
  { from: 980, to: 980, country: "Refund receipts", code: "--" },
  { from: 981, to: 984, country: "GS1 coupon identification", code: "--" },
  { from: 990, to: 999, country: "GS1 coupon identification", code: "--" },
];

function lookupPrefix(gtin: string): { country: string; code: string } | null {
  const digits = gtin.replace(/\D/g, "");
  if (digits.length < 8) return null;
  // For EAN-13 / GTIN-13 we read the first 3 digits.
  const prefix = parseInt(digits.slice(0, 3), 10);
  if (isNaN(prefix)) return null;
  for (const r of PREFIX_RANGES) {
    if (prefix >= r.from && prefix <= r.to) return { country: r.country, code: r.code };
  }
  return null;
}

export const gs1OriginIngester: DatasetIngester = {
  id: SOURCE_ID,
  maxDurationMs: 90_000,
  async run(ctx: IngestionContext): Promise<IngestionReport> {
    const counters: IngestionReport = { rowsSeen: 0, rowsUpserted: 0, rowsSkipped: 0, errors: [], log: "" };
    const logLines: string[] = [];

    // Pull SKUs with a gtin or ean that haven't been enriched yet.
    const { results } = await ctx.env.LENS_D1!.prepare(
      `SELECT sc.id, COALESCE(sc.ean, sc.gtin, sc.upc) AS barcode
         FROM sku_catalog sc
         LEFT JOIN sku_source_link ssl ON ssl.sku_id = sc.id AND ssl.source_id = 'gs1-origin'
        WHERE COALESCE(sc.ean, sc.gtin, sc.upc) IS NOT NULL
          AND LENGTH(COALESCE(sc.ean, sc.gtin, sc.upc)) >= 8
          AND ssl.sku_id IS NULL
        LIMIT ?`,
    ).bind(BATCH_SIZE).all<{ id: string; barcode: string }>();
    const targets = results ?? [];
    counters.rowsSeen = targets.length;
    logLines.push(`targets: ${targets.length}`);

    const BATCH = 20;
    for (let i = 0; i < targets.length; i += BATCH) {
      if (ctx.signal.aborted) break;
      const stmts: unknown[] = [];
      for (const t of targets.slice(i, i + BATCH)) {
        const origin = lookupPrefix(t.barcode);
        if (!origin) {
          counters.rowsSkipped++;
          continue;
        }
        const specsJson = JSON.stringify({
          country_code: origin.code,
          country_name: origin.country,
          source_method: "gs1-prefix-lookup",
          barcode_prefix: t.barcode.replace(/\D/g, "").slice(0, 3),
        });
        stmts.push(
          ctx.env.LENS_D1!.prepare(
            `INSERT INTO sku_source_link (sku_id, source_id, external_id, external_url, specs_json, observed_at, confidence, active)
             VALUES (?, ?, ?, ?, ?, datetime('now'), 0.7, 1)
             ON CONFLICT(sku_id, source_id, external_id) DO UPDATE SET
               specs_json = excluded.specs_json,
               observed_at = datetime('now'),
               active = 1`,
          ).bind(
            t.id,
            SOURCE_ID,
            `gs1:${t.barcode.slice(0, 3)}`,
            "https://www.gs1.org/standards/id-keys/company-prefix",
            specsJson,
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
    }
    counters.log = logLines.join("\n");
    return counters;
  },
};