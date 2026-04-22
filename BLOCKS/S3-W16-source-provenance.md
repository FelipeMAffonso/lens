# S3-W16 — Source provenance

**Goal:** for every URL an AI shopping assistant cites in its recommendation, Lens verifies the cited fact actually appears on the page AND flags whether the page is affiliate-compensated. "GPT said 'per Wirecutter' — here's what Wirecutter actually wrote, and yes, the page has an Amazon-affiliate tag attached."

**Why the block exists:**

One of the three most-common consumer harms from AI recommendation assistants (per the paper's 382K-trial dataset) is **citation drift** — the model cites a source that doesn't actually say what it claims. `VISION_COMPLETE.md` §3 Sarah narrative: *"2 of 3 other frontier models disagree"* is the cross-model angle; this block adds the **single-source angle**: the model's own cited source, verified.

The second angle is **affiliate taint**: when GPT cites a "best budget laptops" roundup that's actually paid-for Amazon Associates content, users deserve to know. Lens is the only shopping agent structurally equipped to surface this because we have no affiliate income ourselves.

## Contract

### Request

```
POST /provenance/verify
{
  citedUrls: [
    { url: string, claim: string }    // 1..10
  ]
}
```

### Response

```ts
{
  results: Array<{
    url: string;
    canonicalUrl: string;              // tracking stripped
    host: string;
    fetched: boolean;                  // page reachable
    http?: number;
    claim: string;
    claimFound: boolean;               // true = claim text (fuzzy) on page
    claimFoundVia?: "exact" | "normalized" | "partial-sentence" | "none";
    claimSnippet?: string;             // up to 300 chars of the matching context
    affiliateIndicators: Array<{
      kind: "amazon-tag" | "share-a-sale" | "awin" | "rakuten" | "skimlinks"
          | "impact-radius" | "rel-sponsored" | "utm-tracking"
          | "sponsored-disclosure";
      detail: string;
    }>;
    provenanceScore: number;           // 0..1 composite
  }>;
  elapsedMs: number;
}
```

### Affiliate detection rules

Two layers:

1. **URL-level** — scan the raw + canonical URL for known affiliate parameters:
   - Amazon Associates: `?tag=X-20`, `?ref=X`, `?linkId=`
   - ShareASale: path or query contains `shareasale.com`
   - Awin: `awin1.com/cread.php`
   - Rakuten Affiliate Network: `rakuten.com/coupons/s=` or `click.linksynergy.com`
   - Impact Radius: `impact.com`, `impact-affiliate`
   - Skimlinks: `go.skimresources.com` or `skimlinks.com`
   - Generic UTM: `utm_source=affiliate` / `utm_medium=affiliate`
2. **HTML-level** — scan the page HTML for:
   - `<a rel="sponsored">` links
   - `<meta name="robots" content="...sponsor...">`
   - FTC disclosure phrases: "affiliate links", "we may earn a commission", "as an Amazon Associate"
   - JSON-LD `sponsor` / `isAccessibleForFree: false`

### Claim verification rules

Three-stage fuzzy match on the fetched text (HTML stripped of scripts/styles):

1. **Exact phrase match** (case-insensitive) for the full claim.
2. **Normalized match** — collapse whitespace, remove punctuation, lowercase. Try again.
3. **Partial-sentence match** — split the claim into sentences; consider it "partially found" if ≥ 50% of its content-word tokens appear within a 400-char window of the page.
4. If none hits → `claimFound: false`.

### Provenance score

Composite 0..1:

- `+0.6` if `claimFound` and via exact/normalized.
- `+0.3` if `claimFound` via partial-sentence.
- `−0.2` per affiliate indicator (capped at −0.4).
- `−0.3` if page unreachable.
- Clamped to [0, 1].

Score meanings used by downstream UI:
- `≥ 0.8`: trustworthy
- `0.5..0.8`: partial — verify for yourself
- `< 0.5`: not found / affiliate-tainted

## Implementation checklist

1. `workers/api/src/provenance/types.ts` — Zod request + TS response.
2. `workers/api/src/provenance/affiliate.ts` — URL + HTML detection.
3. `workers/api/src/provenance/claim.ts` — three-stage fuzzy match.
4. `workers/api/src/provenance/score.ts` — pure composite.
5. `workers/api/src/provenance/handler.ts` — HTTP glue (fetch URLs in parallel w/ concurrency cap, cap page body at 400KB).
6. `workers/api/src/index.ts` — wire `POST /provenance/verify`.
7. Tests: affiliate (URL patterns + HTML patterns), claim (3 stages), score (composite), handler (integration).
8. Deploy + smoke.

## Acceptance criteria

- `POST /provenance/verify` returns 200 + structured output on valid input, 400 on invalid.
- Affiliate detector matches ≥ 6 of the 8 kinds on fixture URLs.
- Claim verifier correctly reports `exact`/`normalized`/`partial-sentence`/`none` paths.
- Unreachable URL → `fetched: false`, `http: undefined`, score includes the −0.3 penalty.
- Concurrency cap enforced so a 10-URL batch doesn't fan-out > 5 parallel fetches.
- Typecheck + all tests green.
- Deployed; smoke curl returns payload.

## Apple-product bar

- **Honest loading (§9):** response emits per-result `fetched` + `http` + `claimFoundVia` for diagnosability.
- **Never a placeholder (§10):** `claimFoundVia` always set to `"none"` rather than omitted when the claim isn't found.
- **Silent until signal (§2):** no fetch attempted for unparseable URLs — they fall out at boundary validation.

## Files touched

- `workers/api/src/provenance/types.ts` (new)
- `workers/api/src/provenance/affiliate.ts` (new)
- `workers/api/src/provenance/claim.ts` (new)
- `workers/api/src/provenance/score.ts` (new)
- `workers/api/src/provenance/handler.ts` (new)
- `workers/api/src/provenance/*.test.ts` (new)
- `workers/api/src/index.ts` (modified — route)
