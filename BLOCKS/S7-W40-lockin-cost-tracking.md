# S7-W40 — Lock-in cost tracking

**Depends on:** F2 ✅ (purchases table). Optional: the `values-overlay` (CJ-W46) reads the same data surface.

**Goal:** Given a list of purchases (or a single product), compute the running lock-in cost per ecosystem — the dollar + non-dollar value the user has accumulated in platform-specific accessories, subscriptions, media, and credits that would be forfeited if they switched. Users get to see their exposure to ecosystem captivity alongside the welfare-delta retention signal.

Per `BLOCK_PLAN.md`:

> `lockin.track`. Aggregates per-ecosystem purchases (Apple App Store, Amazon Prime content, Tesla Supercharging credits) into a running switching-cost figure.
> Surfaces: dashboard card.
> Acceptance: seeded purchase history → correct ecosystem totals.

## Why the block exists

Right-to-Repair research and DOJ antitrust actions repeatedly flag ecosystem lock-in (walled gardens) as a structural consumer harm — once you're in, the cost to leave is invisible until you add it up. Lens's job is to surface the number: "you are $2,843 deep in Apple's ecosystem" makes the welfare-delta comparison honest next time you consider a platform switch.

## Architecture

Pure deterministic module. No LLM. No external API.

```
POST /lockin/compute
  body: {
    purchases: Array<{
      productName: string;
      brand?: string;
      category?: string;
      amountUsd: number;
      purchasedAt?: string; // ISO date
    }>
  }
  →
  {
    source: "fixture";
    ecosystems: Array<{
      slug: string;               // "apple" | "amazon-prime" | ...
      label: string;              // "Apple ecosystem"
      matchedPurchases: number;   // how many rows matched this ecosystem
      gross: number;              // sum of amountUsd across matches
      estimatedSwitchingCost: number;   // gross * lockInMultiplier (see below)
      nonDollarLockIn: string[]; // "App Library", "iMessage network", etc.
      exitFriction: "low" | "medium" | "high" | "critical";
      citations: Array<{ label: string; url: string }>;
    }>;
    totalGross: number;
    totalSwitchingCost: number;
    generatedAt: string;
  }
```

### Ecosystem fixtures

Each ecosystem carries:
- `matchers`: { brands?, productTokens?, categoryTokens? } — substring match (≥3 chars) against any purchase field.
- `lockInMultiplier`: factor applied to gross spend to estimate switching cost (app-library effect > 1 for platforms with deep third-party dependence; ~1 for single-product). Empirically grounded per public sources below.
- `nonDollarLockIn`: list of specific non-transferable assets ("15 years of iMessage threads", "Kindle library of 142 books").
- `exitFriction`: heuristic band.
- `citations`: canonical sources (DOJ cases, iFixit, industry research).

20 ecosystems covered:
- `apple` (iOS/macOS) — lockInMultiplier 1.8
- `google` (Android, Pixel, Nest, Chromecast, Stadia) — 1.4
- `amazon-prime` (Prime Video, Kindle, Echo, Ring, Luna) — 1.6
- `microsoft` (Xbox, Surface, 365) — 1.3
- `tesla` (Supercharger credits, FSD transfer) — 1.7
- `ios-app-store` (paid apps + in-app) — 1.0 (lost on switch)
- `google-play` (paid apps) — 1.0
- `kindle-books` — 1.0 (can't move to Kobo/Nook)
- `apple-books` — 1.0
- `peloton` — 1.5
- `nintendo` (eShop digital games) — 1.0
- `playstation` (PSN digital) — 1.0
- `xbox-live` (digital games, Game Pass library) — 1.2
- `hp-instant-ink` — 2.1 (DRM-locked cartridges + sub)
- `keurig` (K-Cup entanglement) — 1.2
- `nespresso` — 1.3
- `adobe-creative-cloud` — 1.4
- `spotify` (playlists, library) — 1.2
- `ring` (camera subscription required) — 1.8
- `tesla-fsd` (non-transferable full-self-driving) — 1.0

### Exit-friction band

```
multiplier ≥ 1.7 → "critical"
multiplier ≥ 1.4 → "high"
multiplier ≥ 1.2 → "medium"
else             → "low"
```

### Matching logic

Per purchase, walk ecosystems. A purchase matches when any of:
1. `brand` equals an ecosystem brand (case-insensitive).
2. `productName` includes any productToken (≥3 chars).
3. `category` equals any categoryToken (exact, case-insensitive).

A single purchase can match **multiple** ecosystems (e.g. "Apple Music subscription" matches both `apple` and the generic `apple-music` if we add one). Per-ecosystem totals are independent; the `totalGross` is sum of ecosystem-gross values with dedup on (purchaseIndex, ecosystemSlug).

### Apple-product-bar rules

| § | Rule | How S7-W40 meets it |
|---|---|---|
| 2 intelligent | ecosystem totals are surfaced with a specific non-dollar "what you'd lose" list | Non-dollar lock-in array |
| 10 never a placeholder | empty-purchases returns `ecosystems: []`, `totalGross: 0`, with explicit reason | Explicit reason field when no matches |
| no affiliate links | only canonical citations (DOJ, iFixit) | URLs scrubbed on return |

## Files touched

- `workers/api/src/lockin/types.ts` (new — Zod request/response)
- `workers/api/src/lockin/fixtures.ts` (new — 20 ecosystems)
- `workers/api/src/lockin/compute.ts` (new — pure matcher + accumulator)
- `workers/api/src/lockin/handler.ts` (new — POST /lockin/compute)
- `workers/api/src/lockin/*.test.ts` (new — ≥ 20 tests)
- `workers/api/src/index.ts` (wire route)
- `workers/api/src/ratelimit/middleware.ts` (+ route if needed — pure CPU, same guard as /repairability)
- `CHECKLIST.md` (mark ✅)

## Acceptance criteria

- 20 ecosystem fixtures with realistic lockInMultipliers.
- POST with `purchases: [{productName:"iPhone 15 Pro", brand:"Apple", amountUsd:999}, {productName:"Apple Music", amountUsd:109.99}]` returns `ecosystems[slug==apple].gross >= 999` and `estimatedSwitchingCost` > gross.
- POST with empty purchases returns `ecosystems:[]` + `totalGross:0`.
- Multi-matches work: a single Apple-branded purchase counts in `apple` ecosystem without double-counting in unrelated ecosystems.
- All citation URLs scrubbed of affiliate params.
- Rate-limited under the existing "repairability" policy extended to cover /lockin (or new policy).
- ≥ 20 unit tests.
- Typecheck + vitest green.
- Deployed + live smoke.
- Opus 4.7 judge pass + P0/P1 applied.

## Implementation checklist

1. types.ts (Zod request/response).
2. fixtures.ts — 20 ecosystems with matchers + multipliers + nonDollarLockIn + citations.
3. compute.ts — pure function: (purchases) → ecosystems[] + totals.
4. handler.ts — POST /lockin/compute with Zod + URL scrub.
5. compute.test.ts + handler.test.ts.
6. Wire route in index.ts + rate-limit entry.
7. Typecheck + vitest.
8. Deploy.
9. Smoke (POST with 3 seed purchases).
10. Opus judge pass (mandatory).
11. Apply P0/P1 in-block.
12. Commit `lens(S7-W40): ...` + push.
13. CHECKLIST ✅ + progress-log.
