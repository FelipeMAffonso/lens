// S4-W24 — deliberately-approximate US state sales tax table.
//
// This is a baseline, not a full muni-level system. Every response that uses
// it tags the number with source="state"|"zip"|"fallback" + a caveat.
// Reference: most state rates are from the state DOR's public general-rate
// page as of early 2026. Local additions not modeled.

interface StateTax {
  state: string;
  rate: number;
  note?: string;
}

const STATE_RATES: Record<string, StateTax> = {
  AL: { state: "AL", rate: 0.04 },
  AK: { state: "AK", rate: 0, note: "no state sales tax" },
  AZ: { state: "AZ", rate: 0.056 },
  AR: { state: "AR", rate: 0.065 },
  CA: { state: "CA", rate: 0.0725 },
  CO: { state: "CO", rate: 0.029 },
  CT: { state: "CT", rate: 0.0635 },
  DE: { state: "DE", rate: 0, note: "no state sales tax" },
  FL: { state: "FL", rate: 0.06 },
  GA: { state: "GA", rate: 0.04 },
  HI: { state: "HI", rate: 0.04 },
  ID: { state: "ID", rate: 0.06 },
  IL: { state: "IL", rate: 0.0625 },
  IN: { state: "IN", rate: 0.07 },
  IA: { state: "IA", rate: 0.06 },
  KS: { state: "KS", rate: 0.065 },
  KY: { state: "KY", rate: 0.06 },
  LA: { state: "LA", rate: 0.0445 },
  ME: { state: "ME", rate: 0.055 },
  MD: { state: "MD", rate: 0.06 },
  MA: { state: "MA", rate: 0.0625 },
  MI: { state: "MI", rate: 0.06 },
  MN: { state: "MN", rate: 0.06875 },
  MS: { state: "MS", rate: 0.07 },
  MO: { state: "MO", rate: 0.04225 },
  MT: { state: "MT", rate: 0, note: "no state sales tax" },
  NE: { state: "NE", rate: 0.055 },
  NV: { state: "NV", rate: 0.0685 },
  NH: { state: "NH", rate: 0, note: "no state sales tax" },
  NJ: { state: "NJ", rate: 0.06625 },
  NM: { state: "NM", rate: 0.05125 },
  NY: { state: "NY", rate: 0.04 },
  NC: { state: "NC", rate: 0.0475 },
  ND: { state: "ND", rate: 0.05 },
  OH: { state: "OH", rate: 0.0575 },
  OK: { state: "OK", rate: 0.045 },
  OR: { state: "OR", rate: 0, note: "no state sales tax" },
  PA: { state: "PA", rate: 0.06 },
  RI: { state: "RI", rate: 0.07 },
  SC: { state: "SC", rate: 0.06 },
  SD: { state: "SD", rate: 0.042 },
  TN: { state: "TN", rate: 0.07 },
  TX: { state: "TX", rate: 0.0625 },
  UT: { state: "UT", rate: 0.0485 },
  VT: { state: "VT", rate: 0.06 },
  VA: { state: "VA", rate: 0.053 },
  WA: { state: "WA", rate: 0.065 },
  WV: { state: "WV", rate: 0.06 },
  WI: { state: "WI", rate: 0.05 },
  WY: { state: "WY", rate: 0.04 },
  DC: { state: "DC", rate: 0.06 },
};

/**
 * Minimal first-digit zip → state bucket.
 * Source: USPS zip-code prefix mapping (approximated — some states share a
 * first digit, so we pick the most populous). For precision users should
 * supply a full ZIP and we extend this with a two- or three-digit table.
 */
function stateFromZip(zip: string): string | null {
  const z = zip.slice(0, 3);
  const n = parseInt(z, 10);
  if (Number.isNaN(n)) return null;
  // USPS first-3-digit bucket → state. Northeast corridor refined:
  //   010-027 MA · 028-029 RI · 030-038 NH · 039-049 ME · 050-059 VT
  //   060-069 CT · 070-089 NJ · 100-149 NY · 150-196 PA · 197-199 DE
  const ranges: Array<[number, number, string]> = [
    [10, 28, "MA"],
    [28, 30, "RI"],
    [30, 39, "NH"],
    [39, 50, "ME"],
    [50, 60, "VT"],
    [60, 70, "CT"],
    [70, 90, "NJ"],
    [100, 150, "NY"],
    [150, 197, "PA"],
    [197, 200, "DE"],
    [200, 215, "DC"],
    [215, 270, "MD"],
    [270, 290, "NC"],
    [290, 300, "SC"],
    [300, 320, "GA"],
    [320, 350, "FL"],
    [350, 370, "AL"],
    [370, 386, "TN"],
    [386, 400, "MS"],
    [400, 430, "KY"],
    [430, 460, "OH"],
    [460, 480, "IN"],
    [480, 500, "MI"],
    [500, 530, "IA"],
    [530, 550, "WI"],
    [550, 568, "MN"],
    [570, 580, "SD"],
    [580, 590, "ND"],
    [590, 600, "MT"],
    [600, 630, "IL"],
    [630, 660, "MO"],
    [660, 680, "KS"],
    [680, 700, "NE"],
    [700, 720, "LA"],
    [720, 730, "AR"],
    [730, 750, "OK"],
    [750, 800, "TX"],
    [800, 820, "CO"],
    [820, 840, "WY"],
    [840, 850, "UT"],
    [850, 870, "AZ"],
    [870, 885, "NM"],
    [889, 900, "NV"],
    [900, 962, "CA"],
    [962, 970, "HI"],
    [970, 980, "OR"],
    [980, 995, "WA"],
    [995, 1000, "AK"],
  ];
  for (const [lo, hi, state] of ranges) {
    if (n >= lo && n < hi) return state;
  }
  return null;
}

export interface TaxResolve {
  rate: number;
  jurisdiction: string;
  source: "zip" | "state" | "country" | "fallback";
  note?: string;
}

export function resolveTax(opts: { zip?: string; country: string }): TaxResolve {
  const country = opts.country.toUpperCase();
  if (country === "US" && opts.zip) {
    const state = stateFromZip(opts.zip);
    if (state) {
      const row = STATE_RATES[state];
      if (row) {
        const resolved: TaxResolve = { rate: row.rate, jurisdiction: row.state, source: "zip" };
        if (row.note) resolved.note = row.note;
        return resolved;
      }
    }
  }
  if (country === "US") {
    // default baseline — use the median state rate ~6%.
    return {
      rate: 0.06,
      jurisdiction: "US",
      source: "fallback",
      note: "no ZIP provided; using US median ~6% as a rough baseline",
    };
  }
  // Non-US: return 0 by default (VAT handling out of scope for v1).
  return {
    rate: 0,
    jurisdiction: country,
    source: "country",
    note: "non-US jurisdictions: VAT not modeled in v1",
  };
}

export function lookupStateRate(state: string): StateTax | null {
  return STATE_RATES[state.toUpperCase()] ?? null;
}
