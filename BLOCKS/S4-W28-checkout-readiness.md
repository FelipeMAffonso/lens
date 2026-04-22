# S4-W28 — Checkout-readiness summary

**Goal:** a single composite endpoint the extension calls at the final checkout step that folds every S4-* signal into a unified **proceed / hesitate / rethink** verdict + rationale bullet list. This is the one badge Sarah sees when she's about to click "Place order" — the summary of everything Lens has observed on the shopping flow.

**Why the block exists:**

All seven S4-* workflows individually surface a badge or API output. Sarah sees a lot of per-signal noise. `VISION_COMPLETE.md` §6 Marriott worked example hinges on the fourth step: "Draft FTC complaint | Proceed anyway | Download itemized receipt" — that UI assumes a single, confident verdict at the top of the dialog. This block is that verdict.

Design: **pure aggregator**. The extension has already collected each signal on the page (price history via S4-W21, total cost via S4-W24, dark patterns via S4-W22, breach history via S4-W26, affiliate taint from S3-W16, compat from S4-W23). This endpoint composes them deterministically into a single rollup — no re-fetching, no fan-out, no LLM. Sarah's computer has already done the work.

## Contract

### Request

```
POST /checkout/summary
{
  host: string,
  productName?: string,
  sticker?: number,
  signals: {
    priceHistory?:  { verdict: SaleVerdict, discountClaimed?: number, discountActual?: number },
    totalCost?:     { upfront: number, year1: number, year3: number },
    passiveScan?:   { confirmedCount: number, topPattern?: string, ran?: "opus" | "heuristic-only" },
    breachHistory?: { score: number, band: BreachBand, hasSsnExposure?: boolean },
    compat?:        { overall: CompatOverall, blockerCount?: number },
    provenance?:    { affiliateIndicatorCount: number, worstClaimFoundVia?: ClaimFoundVia, minScore?: number },
  }
}
```

### Response

```ts
{
  verdict: "proceed" | "hesitate" | "rethink";
  score: number;           // 0..100 composite (higher = less concern)
  rationale: Array<{
    signal: string;        // "priceHistory" | "totalCost" | ...
    severity: "info" | "warn" | "blocker";
    message: string;
  }>;
  recommendation: string;  // 1-sentence plain English
  signalCount: number;
  generatedAt: string;
}
```

### Rollup formula

Start from baseline **100**. Each signal either subtracts (concern) or adds (reassurance):

- **priceHistory**:
  - `fake-sale` → −25, severity blocker, "Page claims X% off; real drop is Y%."
  - `modest-dip` → −0, severity info.
  - `genuine-sale` → +5, severity info.
  - `insufficient-data` → 0.
- **totalCost**:
  - year1 / upfront > 3 → −20, severity blocker, "Operating cost over 1 year is Nx the sticker."
  - 1.5 < ratio ≤ 3 → −10, severity warn.
  - ratio ≤ 1.5 → 0.
- **passiveScan**:
  - confirmedCount ≥ 1 → −10 × confirmedCount (cap −30), severity warn/blocker.
- **breachHistory**:
  - band: critical → −30 blocker, high → −15 warn, moderate → −5 info, low/none → 0.
  - hasSsnExposure + band≥moderate → extra −10.
- **compat**:
  - overall: incompatible → −40 blocker; partial → −10 warn; no-rule-matched → 0; compatible → +5 info.
- **provenance**:
  - affiliateIndicatorCount ≥ 2 → −10 warn.
  - worstClaimFoundVia === "none" + provenance present → −15 warn.
  - minScore < 0.5 + present → −10 warn.

Verdict banding by final score:
- `≥ 70` → **proceed**
- `40 ≤ s < 70` → **hesitate**
- `< 40` → **rethink**

Blocker dominance rule: any `blocker` severity in rationale forces verdict ≥ **hesitate** (never **proceed**).

## Implementation checklist

1. `workers/api/src/checkout-summary/types.ts` — Zod + TS.
2. `workers/api/src/checkout-summary/compose.ts` — pure aggregator.
3. `workers/api/src/checkout-summary/handler.ts` — HTTP glue.
4. Wire `POST /checkout/summary` in `index.ts`.
5. Tests — signal-by-signal + composite + verdict-band + blocker-dominance.
6. Deploy + smoke.

## Acceptance criteria

- Marriott-style input (passive-scan confirmed 1, breach "low", total-cost year1 mostly sticker) → `hesitate`.
- Clean input (genuine sale + compatible + no patterns + low breach) → `proceed`.
- Critical breach + incompatible + fake-sale → `rethink`.
- Empty signals → `proceed` at score 100 with rationale "no concerns detected".
- Typecheck + all tests green.
- Deployed; smoke curl returns structured payload.

## Apple-product bar

- **Never a placeholder (§10):** `rationale` always a list (may be empty with a "no concerns" bullet), `recommendation` always a complete sentence.
- **Honest loading (§9):** `signalCount` surfaces so UI can say "verdict based on 4 signals observed on this page."
- **Silent until signal (§2):** the endpoint IS the signal-to-user surface; should be called only from the checkout page.

## Files touched

- `workers/api/src/checkout-summary/types.ts` (new)
- `workers/api/src/checkout-summary/compose.ts` (new)
- `workers/api/src/checkout-summary/handler.ts` (new)
- `workers/api/src/checkout-summary/*.test.ts` (new)
- `workers/api/src/index.ts` (modified — route)
