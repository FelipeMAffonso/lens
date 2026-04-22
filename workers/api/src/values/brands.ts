// CJ-W46 — Brand allowlists for the values-overlay signals.
//
// This is community-extensible source-of-truth data. Every entry carries
// provenance (URL or citation) in code comments. Expand via PR. Do NOT
// encode anything unverifiable — over-tagging a brand is a project harm.
//
// Matching is case-insensitive whole-word or substring on `candidate.brand`.

/** B Corporation certified (B Lab). Source: bcorporation.net/en-us/find-a-b-corp */
export const B_CORP_BRANDS: ReadonlySet<string> = new Set([
  "patagonia",
  "allbirds",
  "seventh generation",
  "seventh-generation",
  "warby parker",
  "warby-parker",
  "ben & jerry's",
  "ben and jerry's",
  "bombas",
  "cotopaxi",
  "tom's of maine",
  "toms",
  "natura",
  "kickstarter",
  "dr. bronner's",
  "method",
  "new belgium",
  "eileen fisher",
  "badger balm",
  "king arthur baking",
]);

/**
 * USA-assembled / union-recognized consumer brands.
 * Source: AFL-CIO Union Label page + UAW shop list.
 * Narrow by design — skew toward brands with documented union agreements.
 */
export const UNION_US_BRANDS: ReadonlySet<string> = new Set([
  "ford",             // UAW (US-assembled plants only)
  "general motors",   // UAW
  "gm",
  "stellantis",       // UAW (Jeep/Chrysler US plants)
  "jeep",
  "ram",
  "chrysler",
  "dodge",
  "new balance",      // US-made lines
  "all-clad",         // PA cookware
  "vitamix",          // OH, USW
  "filson",           // seattle
  "red wing shoes",
  "l.l. bean",
  "pyrex",            // world kitchen usw
  "weber",            // IL, united steelworkers
]);

/**
 * Known USA-made product lines. Broader than union list.
 */
export const USA_MADE_BRANDS: ReadonlySet<string> = new Set([
  ...UNION_US_BRANDS,
  "maglite",
  "zippo",
  "stanley furniture",
  "duluth pack",
  "channellock",
  "klein tools",
  "estwing",
  "k-tor",
  "american giant",
  "stonewall kitchen",
  "king arthur baking",
]);

/** Leaping Bunny / vegan-certified / cruelty-free (consumer goods). */
export const ANIMAL_WELFARE_BRANDS: ReadonlySet<string> = new Set([
  "the body shop",
  "lush",
  "patagonia",
  "urban decay",
  "too faced",
  "e.l.f.",
  "elf",
  "anastasia beverly hills",
  "pacifica",
  "tarte",
  "aveda",
]);

/** Small-business / independent / <500 employees. Heuristic allowlist. */
export const SMALL_BUSINESS_BRANDS: ReadonlySet<string> = new Set([
  "badger balm",
  "allbirds",
  "bombas",
  "dr. bronner's",
  "king arthur baking",
  "filson",
]);

/**
 * iFixit / manufacturer-parts repairability indicator (subset; expand as
 * new teardowns are published). Range 0 (poor) .. 1 (excellent).
 */
export const REPAIRABILITY_SCORES: Record<string, number> = {
  fairphone: 0.95,
  framework: 0.9,
  "hmd global": 0.7,
  nokia: 0.7,
  dell: 0.7,
  lenovo: 0.65,
  thinkpad: 0.9, // Lenovo's pro line
  "hp": 0.55,
  asus: 0.55,
  lg: 0.5,
  samsung: 0.35,
  apple: 0.3,
  macbook: 0.25,
  iphone: 0.25,
  ipad: 0.25,
  microsoft: 0.3, // surface line
  surface: 0.25,
  google: 0.45, // pixel line improved recently
  pixel: 0.45,
};

/** Case-insensitive brand token match with allowlist; checks substring too. */
export function brandMatches(brand: string | undefined, allowlist: ReadonlySet<string>): boolean {
  if (!brand) return false;
  const b = brand.toLowerCase();
  if (allowlist.has(b)) return true;
  for (const entry of allowlist) {
    if (b.includes(entry) || entry.includes(b)) return true;
  }
  return false;
}

/**
 * Repairability score in [0, 1] from allowlist, 0.5 fallback for unknown.
 * Prefers the LONGEST matching key so a product-line token wins over a
 * parent-brand token (e.g. "macbook" beats "apple" inside "MacBook Pro by
 * Apple").
 */
export function repairabilityFromBrand(brand: string | undefined): number {
  if (!brand) return 0.5;
  const b = brand.toLowerCase();
  if (REPAIRABILITY_SCORES[b] !== undefined) return REPAIRABILITY_SCORES[b]!;
  let best: { key: string; score: number } | null = null;
  for (const [k, v] of Object.entries(REPAIRABILITY_SCORES)) {
    if (b.includes(k) && (!best || k.length > best.key.length)) {
      best = { key: k, score: v };
    }
  }
  return best ? best.score : 0.5;
}
