# S1-W9 — Comparative framing help

**Depends on:** F3 workflow engine (reused), the S4-W25 privacy-audit pattern for Opus-or-fallback shape.

**Goal:** "Mirrorless vs DSLR for a beginner" → return a structured trade-space table the user can scan: criteria axes, per-option assessment, persona-tailored verdict, honest caveats. Not a search result. Not a ranking. A framework for the user to make the decision themselves.

Per `BLOCK_PLAN.md`:

> `compare.framings`. "Mirrorless vs DSLR for a beginner" → Opus 4.7 produces trade-space table.
> Surfaces: web route.
> Acceptance: 6 comparison scenarios return structured trade-space.

## Why the block exists

The vision is "independent agent at every touchpoint". Most commerce decisions are **category-shape** decisions before they become product-shape decisions. A user deciding "do I want mirrorless or DSLR" is not asking Lens to pick a camera — they're asking Lens to structure the trade-off so they can pick. Lens is the counter-party to the influencer stack that pushes a particular category for commission reasons. A structured trade-space table is a deliberate inversion: every axis named, every trade spelled out, no one sponsored.

## Architecture

Three sources in precedence order:

1. **Stock fixture** — 6 hand-curated comparison pairs covering canonical categories (camera-system, computing-form, powertrain, reading-device, OS ecosystem, keyboard-switch). Fast, deterministic, offline. Matched by token overlap.
2. **Opus 4.7** — when no fixture matches and `ANTHROPIC_API_KEY` is set, Opus produces a trade-space table via a structured JSON prompt. Mirrors the S4-W25 privacy-audit pattern: robust JSON parse + fallback.
3. **None** — when Opus is unavailable *and* no fixture matches, return `{source: "none", framing: null}` with a clear reason. Never silent.

### Contract

```
POST /compare/framings
{
  "optionA": "mirrorless camera",
  "optionB": "dslr",
  "persona": "beginner",     // optional; defaults to "general"
  "context": "hiking trips"  // optional one-line context
}
```

Response:

```json
{
  "ok": true,
  "source": "fixture",
  "framing": {
    "optionA": "mirrorless camera",
    "optionB": "dslr",
    "persona": "beginner",
    "axes": [
      {
        "key": "learning_curve",
        "label": "Learning curve",
        "aAssessment": "Modern EVFs show exposure preview; fewer physical dials.",
        "bAssessment": "Optical viewfinder with no preview; more hands-on controls.",
        "leans": "A"
      },
      …
    ],
    "verdict": {
      "leaning": "A",
      "summary": "Mirrorless is the better starting point for most beginners: shorter learning curve, smaller body, and the lens ecosystem has caught up.",
      "caveats": [
        "DSLRs still win for battery life and action/sports autofocus budget.",
        "A used DSLR + kit lens can be cheaper by $200-$400 for the same image quality tier."
      ]
    }
  },
  "generatedAt": "2026-04-22T05:00:00Z"
}
```

### The 6 stock fixtures

| # | Option A | Option B | Persona | Axes covered |
|---|----------|----------|---------|--------------|
| 1 | mirrorless camera | dslr | beginner / enthusiast / pro | learning-curve, body-size, viewfinder, lens-ecosystem, battery, autofocus-action, video, resale |
| 2 | ipad | laptop | student / creative / casual | text-input, form-factor, ios-ecosystem, desktop-software, battery, longevity, portability, price |
| 3 | electric vehicle | hybrid | commuter / road-tripper / eco-minded | range, refueling-network, home-charging, upfront-cost, maintenance, noise, incentives, used-market |
| 4 | ereader | tablet | reader / traveler | eye-strain, battery, weight, library, glare, distraction, price |
| 5 | android | ios | switcher / developer / casual | device-diversity, app-quality, privacy-controls, sideloading, integration, longevity, ecosystem-lock, resale |
| 6 | mechanical keyboard | membrane keyboard | typist / office / gamer | typing-feel, noise, longevity, portability, price, customization, repairability |

### Fixture matcher

Normalize `optionA` + `optionB` via lowercase + stripped punctuation → token sets. For each fixture, compute `containment(fixtureTokens, queryTokens)` *in both directions*. A fixture matches when containment ≥ 0.5 in either direction, and the optionA↔optionB mapping can swap (query-A matches fixture-B). Persona is also matched against the fixture's persona list with fuzzy fallback to "general".

### Opus 4.7 prompt (when no fixture matches)

Structured JSON prompt: instruct Opus to output a JSON object with `{axes: [...], verdict: {...}}`. Mirrors S4-W25 robust-parse (markdown fence tolerance + surrounding-prose tolerance). Temperature 0 for determinism.

**No product names, no brands, no affiliates.** The output is pure categorical framing.

## Files touched

- `workers/api/src/compare/types.ts` (new)
- `workers/api/src/compare/fixtures.ts` (new) — 6 stock pairs
- `workers/api/src/compare/matcher.ts` (new)
- `workers/api/src/compare/prompt.ts` (new) — Opus system+user prompt
- `workers/api/src/compare/verify.ts` (new) — JSON parser with tolerance
- `workers/api/src/compare/handler.ts` (new) — POST /compare/framings
- `workers/api/src/compare/*.test.ts` (new)
- `workers/api/src/index.ts` (modified — wire route)
- `CHECKLIST.md` (modified)

## Apple-product bar

| § | Rule | How S1-W9 meets it |
|---|---|---|
| 2 intelligent | every axis carries the reason both sides "win" | `aAssessment` + `bAssessment` are phrases, not one-word tags |
| 9 honest loading | response narrates the source | `source: "fixture" | "opus" | "none"` |
| 10 never a placeholder | `"none"` returns a real reason string | never a silent empty table |
| no affiliate links | N/A — block doesn't emit product URLs | — |

## Acceptance criteria

- 6 stock fixtures matching the categories above.
- Token-containment matcher fires correctly on rephrased queries ("DSLR camera" / "full-frame dslr" / "mirrorless" all match fixture 1).
- Opus-path kicks in when fixture misses + API key present; returns parseable JSON → structured trade-space.
- When both miss (no API key + no fixture), response is `{source: "none", framing: null, reason: "no fixture match for this comparison, and no LLM configured"}`.
- POST /compare/framings 400 on invalid body, 200 on all three sources.
- Typecheck + tests green; route live.

## Implementation checklist

1. Write types.ts (ComparisonRequest, Axis, Framing, ResponseShape).
2. Write fixtures.ts with 6 pairs × ~7 axes each.
3. Write matcher.ts with bidirectional containment + fixture selection + persona fallback.
4. Write prompt.ts (system prompt + user prompt for Opus).
5. Write verify.ts (robust JSON parse).
6. Write handler.ts — precedence fixture → opus → none.
7. Write tests.
8. Wire route in index.ts.
9. Typecheck + full suite.
10. Deploy.
11. Smoke (unauth-able route or no auth required — S1-W9 is a public-info endpoint).
12. Commit + CHECKLIST ✅ + push.
