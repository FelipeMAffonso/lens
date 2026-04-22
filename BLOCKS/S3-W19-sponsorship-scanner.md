# S3-W19 — Sponsorship scanner

**Goal:** for any review-article / YouTube video URL, detect whether the author has a financial relationship with the product they're reviewing, and separate **disclosed** affiliations from **undisclosed** ones. Closes Stage-3 evaluation track at 7 of 7.

**Why the block exists:**

AI shopping assistants frequently cite "Wirecutter's best X" or "the top YouTuber reviewer" without flagging that those reviews may be paid content. The FTC requires disclosure (16 CFR Part 255), but enforcement is thin — most sponsored content on YouTube + affiliate-link articles don't clearly disclose. S3-W16 already detects affiliate markers; this block layers a **disclosure-presence check** on top and surfaces the undisclosed-partnership case as its own blocker-level signal.

Reuses S3-W16's `affiliate.ts` detection wholesale. This block's net-new surface is the **disclosure detector** + the **undisclosed-partnership inference** (affiliate signals present AND disclosure absent).

## Contract

### Request

```
POST /sponsorship/scan
{
  url: string,
  articleContext?: string,   // optional: extension-supplied excerpt
}
```

### Response

```ts
{
  url: string;
  canonicalUrl: string;
  host: string;
  fetched: boolean;
  http?: number;
  affiliateIndicators: AffiliateIndicator[];   // reuses S3-W16 AffiliateIndicator
  disclosures: Array<{
    kind: "ftc-affiliate" | "sponsored-post" | "paid-partnership" | "in-partnership-with";
    detail: string;
    snippet: string;
  }>;
  verdict: "clear" | "disclosed-partnership" | "undisclosed-partnership";
  rationale: string;
  source: "fetched" | "context-only";
  generatedAt: string;
}
```

### Verdict logic

| affiliateIndicators | disclosures | verdict |
|---|---|---|
| empty | empty | `clear` — no financial markers detected |
| ≥1 | ≥1 | `disclosed-partnership` — author has affiliation and says so |
| ≥1 | empty | `undisclosed-partnership` — affiliate signals present but no disclosure |
| empty | ≥1 | `disclosed-partnership` — author discloses something even if no affiliate link on this page |

### Disclosure patterns

Six regex families, each tied to a `kind`:
- `ftc-affiliate`: "as an Amazon Associate", "affiliate links", "we may earn a commission"
- `sponsored-post`: "sponsored by", "sponsored post", "sponsored content", "#sponsored"
- `paid-partnership`: "paid partnership", "#ad", "#paidad"
- `in-partnership-with`: "in partnership with", "partnered with" (company)

Each match surfaces with a 60-char context snippet.

## Implementation checklist

1. `workers/api/src/sponsorship/types.ts` — Zod + TS.
2. `workers/api/src/sponsorship/disclosure.ts` — regex suite + extractor.
3. `workers/api/src/sponsorship/assess.ts` — verdict rollup over disclosures + reused S3-W16 affiliate detection.
4. `workers/api/src/sponsorship/handler.ts` — HTTP glue (fetch → htmlToText → detectAffiliateFromUrl/Html → detect disclosures → rollup).
5. Tests per module.
6. Wire `POST /sponsorship/scan` in index.ts.
7. Deploy + smoke.

## Acceptance criteria

- `disclosure.ts` detects ≥ 5 of 6 canonical phrasings.
- `verdict` produces `undisclosed-partnership` when URL has Amazon-tag query param AND no disclosure text on page.
- `verdict` produces `disclosed-partnership` when page has affiliate markers AND discloses them.
- `verdict` produces `clear` for a plain review page with neither.
- Typecheck + all tests green.
- Deployed; smoke curl returns shaped payload.

## Apple-product bar

- **Never a placeholder (§10):** disclosures array is empty (not omitted), rationale always one sentence.
- **Honest loading (§9):** `source: "fetched" | "context-only"` so UI can label when the scan ran off DOM text vs fetched HTML.
- **Silent until signal (§2):** no LLM call, no fan-out.

## Files touched

- `workers/api/src/sponsorship/types.ts` (new)
- `workers/api/src/sponsorship/disclosure.ts` (new)
- `workers/api/src/sponsorship/assess.ts` (new)
- `workers/api/src/sponsorship/handler.ts` (new)
- `workers/api/src/sponsorship/*.test.ts` (new)
- `workers/api/src/index.ts` (modified — route)
