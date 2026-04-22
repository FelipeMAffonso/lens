# S4-W26 — Seller breach history

**Goal:** given a retailer / seller domain, return the set of known data breaches affecting that organization + a composite breach-history score. Surfaces on the extension's checkout inline badge so users see "⚠ Target has had 2 breaches in the last 10 years — the most recent exposed 40M card records."

**Why the block exists:**

Per GAP_ANALYSIS.md §4, none of Lens's surfaces currently tell the user whether the retailer they're about to hand a credit card to has a history of leaks. Breach data is open-source (HIBP for free tier, state-AG breach-notification databases, verified press records); the Lens surface is to aggregate + contextualize it.

## Contract

### Request

- `GET /breach-history?host=<dns-host>` — public, unauth (consumer should be able to check any site before committing).

### Response

```ts
{
  host: string;            // canonicalized (lowercase, no www.)
  breaches: Array<{
    id: string;
    date: string;          // YYYY-MM-DD
    recordsExposed: number;
    dataTypes: string[];   // "email", "password", "ssn", "card", "address", ...
    severity: "low" | "moderate" | "high" | "critical";
    source: string;        // "HIBP" | "state-AG:CA" | "press:wired.com/..."
    summary: string;
  }>;
  aggregate: {
    count5yr: number;
    count10yr: number;
    totalRecordsExposed: number;
    mostRecentDate: string | null;
    yearsSinceMostRecent: number | null;
    hasSsnExposure: boolean;
    hasCardExposure: boolean;
    hasPasswordExposure: boolean;
  };
  score: number;            // 0..100, higher = more concern
  band: "none" | "low" | "moderate" | "high" | "critical";
  source: "fixture" | "hibp" | "mixed";
  generatedAt: string;
}
```

### Score formula

Transparent + deterministic:

```
score = 0
for breach in breaches (within last 10yr):
  score += severity_weight(severity) * recency_multiplier(yearsSinceBreach)
aggregate bonuses:
  + 15 if hasSsnExposure AND most recent < 5yr
  + 10 if hasCardExposure AND most recent < 5yr
  +  5 if hasPasswordExposure AND most recent < 5yr
clamp to [0, 100]
```

Weights:
- critical = 25, high = 15, moderate = 8, low = 3
- recency: 1.0 within 2 years, 0.7 within 5 years, 0.4 within 10 years, 0 beyond

Bands:
- `0-4` → none (no meaningful breach history)
- `5-19` → low
- `20-39` → moderate
- `40-69` → high
- `70-100` → critical

### Data source

v1 ships a fixture dataset in `fixtures.ts` covering the 15 most-notable consumer-retail breaches of the last 10 years (Target 2013, Home Depot 2014, Equifax 2017, Yahoo 2013-14, Marriott 2018, Capital One 2019, T-Mobile 2021+2023, LastPass 2022, Facebook 2019, Okta 2022, Uber 2016, Dropbox 2012, Adobe 2013, Anthem 2015). Every entry carries a `source: "fixture"` tag and a pointer to the original press report in code comments.

When `HIBP_API_KEY` is set, the worker calls HIBP's `/breachedaccount/domain/{host}` endpoint and merges that dataset with the fixture set (dedup on breach id).

### Surfaces

- Extension checkout inline badge — calls `/breach-history?host=<current-host>` on checkout-page load, renders the band + counts.
- Dashboard settings → "your purchases" — per-retailer breach summary.

## Implementation checklist

1. `workers/api/src/breach/types.ts` — Zod + TS.
2. `workers/api/src/breach/fixtures.ts` — 15-breach fixture database.
3. `workers/api/src/breach/score.ts` — pure score + band.
4. `workers/api/src/breach/hibp.ts` — HIBP client scaffold (fail-closed when no key).
5. `workers/api/src/breach/handler.ts` — GET glue + KV 24h cache.
6. Wire `GET /breach-history` in index.ts.
7. Tests per module.
8. Deploy + smoke.

## Acceptance criteria

- `GET /breach-history?host=target.com` returns Target's 2013 40M-record breach with severity critical and appropriate score.
- `GET /breach-history?host=no-breaches.example` returns `{breaches: [], score: 0, band: "none"}`.
- Score + band are deterministic for a given fixture set.
- Typecheck + all new tests green.
- Deployed live; smoke curl returns payload.

## Apple-product bar

- **Never a placeholder (§10):** breaches array is empty (not omitted), score is 0, band is "none" when no data — all fields always present so UI can render without null-checks.
- **Honest loading (§9):** `source: "fixture" | "hibp" | "mixed"` so UI can label "Lens fixture (last updated YYYY-MM-DD)" when HIBP isn't configured.
- **Silent until signal (§2):** no fan-out, no async external calls unless HIBP key + host actually match.

## Files touched

- `workers/api/src/breach/types.ts` (new)
- `workers/api/src/breach/fixtures.ts` (new)
- `workers/api/src/breach/score.ts` (new)
- `workers/api/src/breach/hibp.ts` (new)
- `workers/api/src/breach/handler.ts` (new)
- `workers/api/src/breach/*.test.ts` (new)
- `workers/api/src/index.ts` (modified — route + HIBP_API_KEY env)
- `workers/api/.dev.vars.example` (modified — HIBP_API_KEY)
- `docs/secrets.md` (modified)
