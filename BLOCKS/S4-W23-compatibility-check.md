# S4-W23 — Compatibility check

**Goal:** given the user's owned-equipment list + a proposed purchase, emit a deterministic compatibility verdict with per-rule explanations. "That M.2 2280 NVMe SSD will not fit your 2015 MacBook Pro (proprietary connector)." "The USB-C dock you're looking at maxes out at 60W PD — your XPS 15 needs 90W."

**Why the block exists:**

The "will this actually work with what I already own?" question is load-bearing for three Sarah moments in VISION_COMPLETE.md §3:
- shopping for an accessory at Amazon/Best Buy → inline compatibility badge
- auditing a ChatGPT recommendation for a laptop peripheral → verdict card
- price-refund drafting (S6-W34) → the draft should not recommend an incompatible replacement

The rule set is opinionated and will always be incomplete — that is fine. Every rule ships with provenance in code comments, and unmatched pairs return a clearly-labeled `"no-rule-matched"` verdict rather than a spurious `"compatible"` default.

## Contract

### Request

```
POST /compat/check
{
  target:  { category, specs: {...}, brand?, name? },
  equipment: Array<{ category, specs: {...}, brand?, name? }>
}
```

Both target and equipment items are flat `{category, specs}` shapes — callers can (but don't have to) fill specs directly, or pass `{category: "laptops", name: "2015 MacBook Pro"}` and let the rule library fill specs from known-brand profiles.

### Response

```ts
{
  overall: "compatible" | "partial" | "incompatible" | "no-rule-matched";
  rationale: string;          // one-paragraph plain-English summary
  rules: Array<{
    id: string;                // stable rule identifier
    verdict: "pass" | "fail" | "warn" | "not-applicable";
    explanation: string;
    equipmentIndex?: number;   // which equipment item triggered, if any
    severity: "blocker" | "info";
  }>;
  missingSpecs: string[];      // specs we needed but didn't have
  generatedAt: string;
}
```

Verdict rollup:
- `incompatible` — any rule fires `fail` with `severity: "blocker"`.
- `partial` — any `fail: info` OR any `warn`.
- `compatible` — at least one `pass` and no `fail` / `warn`.
- `no-rule-matched` — no rule applied to the (target, equipment) pair.

### Rule library (`compat/rules.ts`)

Every rule is a pure function `(target, equipment) => RuleResult | null`. Shipping set:

| # | Category pair | Rule |
|---|---|---|
| 1 | `ssd` + `laptops` | 2015 MBP (pre-2016) → proprietary blade; M.2 SSDs fail. |
| 2 | `ssd` + `laptops` | Generic SATA vs NVMe vs M.2 slot matching. |
| 3 | `monitor-cable` + `laptops` | USB-C monitor needing ≥ 4K@60Hz requires DP Alt-Mode (fail on base-model MacBook Air 2017). |
| 4 | `charger` + `laptops` | Charger PD watt rating ≥ target laptop's stated requirement (90W dock ≠ 140W MBP). |
| 5 | `charger` + `phones` | USB-C PD phone → any USB-C PD brick ≥ 20W (pass); Lightning iPhone → needs Lightning cable or MFi USB-C. |
| 6 | `airpods` + `phones` | AirPods Pro (2019+) need Bluetooth 5.0+ source. Older Android often fine; sub-Bluetooth-4 hardware warns. |
| 7 | `hdmi-cable` + `tvs` | HDMI 2.1 required for 4K@120Hz. HDMI 2.0 cable + 2.1 TV → warn (only 4K@60Hz usable). |
| 8 | `printer-ink` + `printers` | Ink cartridge model ID must match printer's accepted list. |
| 9 | `camera-lens` + `cameras` | Mount must match (EF vs RF vs E-mount vs L-mount vs MFT). |
| 10 | `smartphone-case` + `phones` | Case model ID (e.g. "iPhone 15 Pro Max") must match exactly. |

For cases the rule library doesn't cover: return `overall: "no-rule-matched"` and note the fact in `rationale`.

### Known-device profiles (`compat/profiles.ts`)

A small profile table: name → specs. Used when callers supply `{name: "2015 MacBook Pro"}` without explicit specs.

```
"2015 MacBook Pro 13 Retina"  → { year: 2015, form: "retina-pre-2016", storage: "proprietary", ports: ["thunderbolt-2", "usb-a"] }
"iPhone 15 Pro Max"           → { year: 2023, charging: "usb-c-pd", usbC: true, caseFamily: "iphone-15-pro-max" }
"Dell XPS 15"                 → { year: 2023, chargingW: 130 }
...
```

## Implementation checklist

1. `workers/api/src/compat/types.ts` — Zod schemas + TS types.
2. `workers/api/src/compat/profiles.ts` — known-device profile table + `enrichFromName`.
3. `workers/api/src/compat/rules.ts` — 10 rules as pure functions + `runAllRules`.
4. `workers/api/src/compat/check.ts` — orchestrator combining profile enrichment + rule application + verdict rollup.
5. `workers/api/src/compat/handler.ts` — HTTP glue.
6. Tests per module (≥ 30 new).
7. Wire `POST /compat/check` in index.ts.
8. Deploy + smoke.

## Acceptance criteria

- 10 rules shipping, each with a code-comment provenance note.
- `POST /compat/check` returns 200 on valid input, 400 on invalid.
- `target: {name: "M.2 2280 NVMe SSD", category: "ssd"}` + `equipment: [{name: "2015 MacBook Pro 13 Retina"}]` → `overall: "incompatible"`.
- Unknown target + unknown equipment → `no-rule-matched` (not a false `compatible`).
- Typecheck + tests green.
- Deployed; smoke returns structured response.

## Apple-product bar

- **Never a placeholder (§10):** unknown pair returns `no-rule-matched` with an explanatory rationale, never a silent pass.
- **Honest loading (§9):** `rules[].verdict` always set (never undefined) so UI can render a per-rule checklist.
- **Explain on hover (§5):** every rule's `explanation` is 1-2 sentences the badge tooltip can display verbatim.

## Files touched

- `workers/api/src/compat/types.ts` (new)
- `workers/api/src/compat/profiles.ts` (new)
- `workers/api/src/compat/rules.ts` (new)
- `workers/api/src/compat/check.ts` (new)
- `workers/api/src/compat/handler.ts` (new)
- `workers/api/src/compat/*.test.ts` (new)
- `workers/api/src/index.ts` (modified — route)
