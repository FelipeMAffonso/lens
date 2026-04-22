# S2-W13 — Vendor-vs-independent source weighting

**Goal:** a user-tunable slider that tells Lens how much to trust manufacturer claims versus independent reviews. Persisted via F2 preferences, applied by a pure reranker that downstream verification + ranking stages can compose with.

**Why the block exists:**

Consumers split on this axis. Some trust OEM spec sheets (they measure it in a lab); others trust independent reviews (they test it with real workflows). Lens has no opinion — we expose the dial and let each user set it. Load-bearing for VISION_COMPLETE.md §12 "user-editable preferences" + GAP_ANALYSIS.md §4 "no user-tunable ranking dials".

The F2 preferences table already carries `source_weighting_json` (added in migration `0005_core_tables`). This block fills that column with a typed shape + the reranker that reads it.

## The shape

```ts
interface SourceWeighting {
  vendor: number;        // 0..1
  independent: number;   // 0..1
  // Invariant: vendor + independent = 1 (normalized on write).
}
```

Defaults are `{vendor: 0.5, independent: 0.5}` — agnostic until the user dials. Values outside [0,1] or sums far from 1 are normalized on PUT; the response echoes the normalized row so the client UI snaps its slider.

## Contract

### Request

- `PUT /source-weighting` — body `{category?, vendor, independent}`. When `category` omitted, persists under the sentinel slug `"_global"` so it applies when no per-category row exists.
- `GET /source-weighting[?category=<slug>]` — returns the persisted weighting, falling back to `_global`, finally to the default `{vendor: 0.5, independent: 0.5}`.

### Reranker

Pure function in `workers/api/src/source-weighting/apply.ts`:

```ts
applyWeighting({
  baseUtility,            // 0..1
  vendorSignal,           // 0..1 or null
  independentSignal,      // 0..1 or null
  weighting,              // SourceWeighting
}): {
  finalUtility: number,
  contributions: {
    vendor: number,         // signed contribution to final
    independent: number,
  },
}
```

When both signals present, the composite boost is:

```
boost = weighting.vendor * (vendorSignal - 0.5) * BOOST_RANGE
      + weighting.independent * (independentSignal - 0.5) * BOOST_RANGE
finalUtility = clamp01(baseUtility + boost)
```

`BOOST_RANGE = 0.3` — signals at 0 or 1 shift utility by at most ±0.15 per side, combined ±0.3. When one side's signal is missing, its weight is redistributed to the present side (so a `vendor=0.7` user reading a page with only an independent signal still gets the full boost range from that side).

## Implementation checklist

1. `workers/api/src/source-weighting/types.ts` — Zod + TS.
2. `workers/api/src/source-weighting/normalize.ts` — force `vendor + independent = 1`, clamp each to [0,1].
3. `workers/api/src/source-weighting/apply.ts` — the reranker.
4. `workers/api/src/source-weighting/handler.ts` — GET + PUT glue; reuses F2 `upsertPreference` / `findPreference` with the sentinel `"_global"` category when omitted.
5. `workers/api/src/index.ts` — wire routes.
6. Tests per module.
7. Deploy + smoke.

## Acceptance criteria

- `PUT /source-weighting {vendor: 0.7, independent: 0.3}` persists + echoes normalized.
- `PUT` with `{vendor: 2, independent: 0}` normalizes to `{vendor: 1, independent: 0}`.
- `GET /source-weighting` without a category returns the `_global` row.
- `GET /source-weighting?category=laptops` falls back to `_global` when per-category absent.
- `applyWeighting({baseUtility: 0.7, vendorSignal: 1, independentSignal: 0, weighting: {vendor:1, independent:0}})` → `finalUtility = clamp01(0.7 + 1*(1-0.5)*0.3) = 0.85`.
- Typecheck + all tests green.
- Deployed; smoke PUT then GET round-trip.

## Apple-product bar

- **Never a placeholder (§10):** on first call, `GET` returns the 50/50 default rather than 404 or empty. UI always renders a live slider.
- **Honest loading (§9):** `PUT` response includes `normalized: true|false` so UI can flash a toast if the user-entered values were snapped.
- **Silent until signal (§2):** zero side-effects on GET; only PUT writes D1.

## Files touched

- `workers/api/src/source-weighting/types.ts` (new)
- `workers/api/src/source-weighting/normalize.ts` (new)
- `workers/api/src/source-weighting/apply.ts` (new)
- `workers/api/src/source-weighting/handler.ts` (new)
- `workers/api/src/source-weighting/*.test.ts` (new)
- `workers/api/src/index.ts` (modified — route)
