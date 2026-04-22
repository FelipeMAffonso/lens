# S7-W41 — Repairability tracking

**Depends on:** F2 ✅ (purchases table available for product lookups by owned purchases; optional).

**Goal:** Given a product (by name, category, brand), return a repairability score (1–10 scale matching iFixit's convention), a band (easy/medium/hard/unrepairable/no-info), the top failure modes, and whether replacement parts are commercially available from the manufacturer + third-party. Enables the user to factor repairability into their audit criteria via CJ-W46 values overlay.

Per `BLOCK_PLAN.md`:

> `repair.lookup`. iFixit API + manufacturer parts availability.
> Acceptance: 10 products correctly scored.

## Why the block exists

Right-to-Repair research (cited in `docs/CONSUMER_WORKFLOWS.md` §H13) is one of the most robustly documented consumer harms: planned obsolescence, glued batteries, proprietary screws, discontinued parts programs. Lens's job is to make this invisible harm visible before the purchase — every product page on Amazon/Best Buy can carry a small Lens badge showing "Repairability: 4/10 (hard) — battery glued, no manufacturer parts program", so the user factors repair cost + lifespan into total-cost decisions alongside price + performance.

## Architecture

Pure deterministic module with an optional live client. Three inputs → one response:

```
POST /repairability/lookup
  body: {
    productName: string,
    brand?: string,
    category?: string,
    productId?: string  // ASIN, SKU, manufacturer model number
  }
  →
  {
    source: "fixture" | "ifixit" | "hybrid" | "none",
    productName, brand, category,
    score: number,          // 1..10
    band: "easy" | "medium" | "hard" | "unrepairable" | "no-info",
    commonFailures: string[],
    partsAvailability: {
      manufacturer: "available" | "discontinued" | "unknown",
      thirdParty: "available" | "limited" | "unavailable" | "unknown"
    },
    citations: Array<{ label: string; url: string; source: "ifixit" | "reddit" | "manufacturer" | "press" }>,
    generatedAt: string
  }
```

Three paths:

1. **Fixture (deterministic, offline)** — 40 hand-curated entries covering the most-shopped connected devices (iPhones, Pixels, Galaxies, MacBooks, ThinkPads, Framework laptops, Sony/Bose headphones, AirPods, Switch, Steam Deck, Meta Quest, Ring cameras, Nest thermostats, Roomba, Breville, De'Longhi, Traeger, Peloton, etc.). Each entry carries real iFixit repairability scores published in the last 3 years + 2–4 common failure modes + parts availability + 1–3 canonical citations.
2. **iFixit live (optional)** — when `IFIXIT_API_KEY` is present, client hits `https://www.ifixit.com/api/2.0/search` + `/wikis/{guideid}` to pull live scores. Cache 24h in KV by (brand|product) key.
3. **No match** — returns `source: "none"` with explicit reason. Never fabricates.

### Fixture schema

```ts
interface RepairabilityFixture {
  matchers: { brands?: string[]; productTokens?: string[]; productId?: string };
  score: number;                         // 1..10
  band: "easy" | "medium" | "hard" | "unrepairable";
  commonFailures: string[];
  partsAvailability: {
    manufacturer: "available" | "discontinued" | "unknown";
    thirdParty: "available" | "limited" | "unavailable" | "unknown";
  };
  citations: Array<{ label: string; url: string; source: "ifixit" | "reddit" | "manufacturer" | "press" }>;
}
```

Matcher logic:
- `productId` exact match wins if present.
- Otherwise `brand` must match (case-insensitive) AND at least one `productToken` must be contained in the query's `productName`.
- Token matching is case-insensitive, length ≥ 3 to avoid "a" matching everything.
- Ties broken by longest-token-match.

### Band thresholds

```
score ≥ 8: easy
score ≥ 6: medium
score ≥ 4: hard
score <  4: unrepairable
no match:  no-info
```

(Matches iFixit's own rubric — 10 = everything user-replaceable, 1 = sealed glass brick.)

### Apple-product-bar rules

| § | Rule | How S7-W41 meets it |
|---|---|---|
| 2 intelligent | Name + band + the top 2 failure modes + parts verdict land in one scan | Response designed for a compact badge UI |
| 10 never a placeholder | `no-info` returns a clear reason string, not empty | Explicit `reason` field when source="none" |
| no affiliate links | Only canonical iFixit URLs | URL scrubber applied defensively at return |
| honest loading | fixture path < 5ms; iFixit path cached | 24h KV cache |

## Files touched

- `workers/api/src/repairability/types.ts` (new — Zod request/response)
- `workers/api/src/repairability/fixtures.ts` (new — 40-entry dataset)
- `workers/api/src/repairability/score.ts` (new — pure matcher + band)
- `workers/api/src/repairability/ifixit.ts` (new — optional live client, gated on IFIXIT_API_KEY)
- `workers/api/src/repairability/handler.ts` (new — POST /repairability/lookup)
- `workers/api/src/repairability/*.test.ts` (new — score math, matcher, band thresholds, fixture sanity, handler surface, URL scrub)
- `workers/api/src/index.ts` (wire route)
- `docs/secrets.md` (document IFIXIT_API_KEY)
- `CHECKLIST.md` (mark ✅)

## Acceptance criteria

- 40-entry fixture covering the top connected-device categories + all 5 hackathon-scoped categories (espresso, laptops, headphones, coffee makers, robot vacuums).
- POST with `productName: "iPhone 15 Pro"` returns score + band "hard" (per iFixit's published score of 4/10).
- POST with `productName: "Framework Laptop 13"` returns score + band "easy" (iFixit 10/10).
- POST with unknown product (e.g., "NonExistent Widget") returns `source: "none"` + reason.
- Cross-user noise: endpoint is public (no auth gating; repairability data is a public good per VISION_COMPLETE §12 "other users' data — k-anonymity on every aggregate").
- IFIXIT_API_KEY unset → fixture-only path. When set, live hits with KV cache.
- Every citation URL stripped through `scrubTrackingParams()` before return.
- ≥ 20 unit tests.
- Typecheck + vitest green.
- Deployed. Live smoke confirms 3 random fixture hits + 1 miss.
- Opus 4.7 judge pass per LOOP_DISCIPLINE.
- P0+P1 applied in-block.
- Commit `lens(S7-W41): ...` + push.

## Implementation checklist

1. Write types.ts (Zod schema for request + response).
2. Write fixtures.ts — 40 entries, real iFixit scores from the 2024-2026 range.
3. Write score.ts — pure matcher + band mapper.
4. Write ifixit.ts — stub live client (gated on IFIXIT_API_KEY); no live call when absent.
5. Write handler.ts — POST /repairability/lookup with Zod validation + URL scrubber on citations.
6. Tests — score.test.ts (matcher logic + ties), handler.test.ts (400/200 paths, fixture hit/miss).
7. Wire route in index.ts.
8. Typecheck + vitest.
9. Deploy.
10. Smoke (3 hits + 1 miss against live).
11. Fire Opus 4.7 judge (mandatory).
12. Apply P0+P1 in-block.
13. Commit `lens(S7-W41): ...` + push.
14. CHECKLIST ✅ + progress-log.
