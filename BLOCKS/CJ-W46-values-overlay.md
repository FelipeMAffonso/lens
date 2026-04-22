# CJ-W46 — Values overlay reranker

**Goal:** let users add ethical / political / sustainability criteria on top of the deterministic utility function. "Rank by spec — but deprioritize products from surveilled ecosystems, favor B-Corps, prefer union-made, subtract for poor repairability."

**Why the block exists:**

`BLOCK_PLAN.md` CJ-W46: "Optional criteria: country-of-origin, union-made, carbon footprint, animal welfare, B-Corp, small-business." These are real consumer preferences that the standard `U = Σ wᵢ · sᵢ` spec-utility function can't express — they live orthogonal to the product category. A user shopping for laptops who cares about union-made wants that signal across every candidate, not buried in the per-category weights.

This block gives Lens a first-class "values layer" that composes with the existing ranking math, ships as a pure add-on (no regression when overlay is empty), and persists via the F2 `preferences.values_overlay_json` column.

## The values taxonomy (7 canonical keys)

| Key | Description | Direction |
|---|---|---|
| `country-of-origin` | Product manufactured in the user's preferred country/region. | `higher_is_better` when match |
| `union-made` | Manufacturer recognizes a union / UAW-certified / AFL-CIO. | `higher_is_better` |
| `carbon-footprint` | Per-unit lifetime CO2e (lower preferred). | `lower_is_better` |
| `animal-welfare` | Vegan / cruelty-free / Leaping Bunny certified. | `higher_is_better` |
| `b-corp` | B Lab certification. | `higher_is_better` |
| `small-business` | <500 employees / independent. | `higher_is_better` |
| `repairability` | iFixit score OR manufacturer parts availability. | `higher_is_better` |

Every key is optional. An empty overlay is a no-op reranker.

## Data model

```ts
interface ValuesOverlayEntry {
  key: ValueKey;
  weight: number;        // 0..1, how much this value matters to the user
  preference?: string;   // for country-of-origin: "US" | "EU" | ...
}

type ValuesOverlay = ValuesOverlayEntry[];
```

For each candidate product, `getValueSignals(candidate)` returns `{key → score in [-1, 1]}`. Sources:
1. **Category-pack signals** (new optional field `valuesSignals` on each `representativeSku`).
2. **Brand allowlists** — small, community-maintained JSON bundle (B-Corp certified brands, known union-made makers, USA-labor-identified brands). Expandable.
3. **Heuristic fallback** — product-name tokens (`Made in USA`, `Vegan`, etc.).

## Algorithm

```
score_with_values(candidate, base_utility, overlay) =
  base_utility + Σ_k( overlay[k].weight * signals[candidate][k] )
```

All signals are in [-1, 1]. All weights in [0, 1]. The overlay's contribution is additive, NOT multiplicative, so disabling the overlay (weights all 0) leaves base_utility untouched. Output is 2-decimal rounded.

## Endpoints

- **`POST /values-overlay/rerank`** — body `{candidates, overlay}` → `{ranked, contributions}`. Stateless. Used by the extension sidebar + the web ranking UI for live re-rank.
- **`PUT /values-overlay`** — body `{category, overlay}` → persists into the user's preference row via the F2 `upsertPreference` repo.
- **`GET /values-overlay?category=<slug>`** — returns the persisted overlay for the signed-in principal.

## Implementation checklist

1. `packages/shared/src/values.ts` — types + Zod schemas + canonical key list.
2. `workers/api/src/values/signals.ts` — `getValueSignals(candidate, valueKeys)` → `{key → score}` using brand allowlist + heuristics.
3. `workers/api/src/values/brands.ts` — allowlist data (B-Corp, union-made, USA-made).
4. `workers/api/src/values/rerank.ts` — pure function `applyOverlay(candidates, overlay)`.
5. `workers/api/src/values/handler.ts` — HTTP glue.
6. Wire `POST /values-overlay/rerank` + `PUT /values-overlay` + `GET /values-overlay` in index.ts.
7. Tests: types (schema) + signals (brand + heuristic) + rerank (algorithm) + handler (HTTP).
8. Deploy + smoke test.
9. Commit + push + CHECKLIST ✅.

## Acceptance criteria

- 7-key taxonomy exported from `@lens/shared`.
- `applyOverlay` with empty overlay returns candidates unchanged (round-trip identity).
- `applyOverlay` with a B-Corp-weighted overlay re-orders candidates such that B-Corp candidates move up.
- Brand allowlist matches known B-Corp brands (Patagonia, Allbirds, Seventh Generation).
- USA-made allowlist matches known union brands (Ford US plants, Jeep).
- PUT persists to the F2 `preferences` row; GET reads it back.
- POST /values-overlay/rerank smoke test: two fake candidates → rerank favors the tagged one.
- Typecheck + all new tests green.

## Apple-product bar

- **Never a placeholder (§10):** when no signals hit a candidate, the signal is 0, not null — ranking stays defined.
- **Honest loading (§9):** response includes `contributions: {candidateId → {key → contribution}}` so the UI can render "why #1 beat #2" deltas.
- **Silent until signal (§5):** empty overlay is a true no-op — zero server cycles wasted when feature disabled.

## Files touched

- `packages/shared/src/values.ts` (new)
- `packages/shared/src/index.ts` (modified — re-export)
- `workers/api/src/values/brands.ts` (new)
- `workers/api/src/values/signals.ts` (new)
- `workers/api/src/values/rerank.ts` (new)
- `workers/api/src/values/handler.ts` (new)
- `workers/api/src/values/*.test.ts` (new, 4 files)
- `workers/api/src/index.ts` (modified — routes + env)
