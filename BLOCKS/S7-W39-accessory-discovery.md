# S7-W39 — Accessory discovery

**Depends on:** F2 ✅ (purchases repo), S4-W23 ✅ (compat-check library — reused for the gate).

**Goal:** Given a product the user owns (or a free-form product context), return a ranked list of compatible accessories weighted by the user's criteria. The dry version is "show me what I can buy for my espresso machine"; the honest version is "show me what fits my machine, ranked by what I actually care about, with no affiliate contamination".

Per `BLOCK_PLAN.md`:

> `accessory.discover`. Given owned product + user criteria → compatible accessory ranking.
> Surfaces: web route per-product.
> Acceptance: 5 owned products → relevant accessory lists.

## Why the block exists

Once a user owns a product, the long tail of commerce around that product (tampers, knock-boxes, replacement filters, laptop hubs, ear cushions, vacuum brushes) is the most aggressively affiliate-contaminated corner of retail. Search results are dominated by ShareASale partner boxes. Lens's pitch on this corner is simple: no brand gets preferred placement for money. Results are filtered by what is physically + software compatible, then ranked by a transparent utility function over the user's criteria.

## Architecture

Pure deterministic module: load purchase row → pick the category fixture → apply compat gate → rank remaining candidates via user-weighted utility. No LLM. No network (current scope is the fixture layer; live-search hook reserved for future live-mode).

### Shape

```
POST /accessories/discover
{
  "purchaseId": "01J…",    // optional; auth-gated lookup
  "productContext": {         // optional fallback when no purchaseId
    "category": "espresso-machines",
    "brand": "Breville",
    "productName": "Breville Bambino Plus"
  },
  "criteria": {               // optional; otherwise a neutral utility
    "price": 0.3,
    "quality": 0.5,
    "longevity": 0.2
  },
  "limit": 5                  // default 5, cap 20
}
```

Response:

```json
{
  "ok": true,
  "source": "fixture",
  "productContext": { "category": "espresso-machines", "brand": "Breville", "productName": "Breville Bambino Plus" },
  "candidates": [
    {
      "name": "54mm Calibrated Tamper",
      "category": "accessory/tamper",
      "brand": "Normcore",
      "price": 39.99,
      "url": null,
      "compat": { "compatible": true, "rule": "54mm-portafilter-family" },
      "utility": 0.78,
      "contributions": { "price": 0.21, "quality": 0.42, "longevity": 0.15 },
      "why": "Fits the 54mm portafilter family used by Breville Bambino Plus; steel build is rated for hundreds of thousands of tamps."
    }
  ],
  "incompatible": [ /* accessories that failed the gate */ ],
  "generatedAt": "..."
}
```

### Category-scoped fixture catalog

4 categories × ~6 accessories = ~24 fixture entries, enough to satisfy the "5 owned products → relevant accessory lists" acceptance criterion plus headroom:

- **espresso-machines**: 54mm tamper, portafilter mat, milk pitcher (12oz + 20oz), knock box, descaling kit, water filter cartridge.
- **laptops**: USB-C hub, laptop stand, external SSD (NVMe enclosure), laptop sleeve, laptop cooling pad, HDMI cable.
- **headphones**: replacement ear cushions, hard travel case, 3.5mm cable (braided), aux → USB-C adapter, cleaning kit.
- **coffee-makers**: descaler tablets, water filter cartridge, replacement carafe, paper filter pack, measuring scoop.

Each fixture carries: `name`, `brand`, `price`, `specs` (for utility math), `compatibleWith: { brands?, productTokens?, portafilterSize? }`, `category`.

### Compat gate

Per-accessory rules mirror S4-W23 shape but simpler (accessories don't carry heavy version math):

- If `compatibleWith.brands` present → purchase brand must match case-insensitively OR be in the list. If the purchase brand is unknown, the accessory passes with a caveat.
- If `compatibleWith.portafilterSize` present → the purchase must be in the known 54mm-family list OR 58mm-family (derived from brand — Breville Bambino, Bambino Plus = 54mm; Breville Barista Express/Touch = 54mm; Rancilio = 58mm; La Marzocco = 58mm; etc.).
- If `compatibleWith.productTokens` present → at least one token overlap with the purchase product name.

### Ranking (pure utility)

Given criteria weights `W = {c1: w1, …}` (normalized to sum 1 inside the function) and per-accessory specs in `[0,1]` (normalized with min/max across the compat-passing set):

```
Uⱼ = Σᵢ wᵢ · sᵢⱼ
```

Where `sᵢⱼ` is accessory j's score on criterion i. Every contribution is returned in `contributions` so the UI can show the usual "why" breakdown.

Default criteria when the request omits them: `{ quality: 0.5, price: 0.3, longevity: 0.2 }`.

### Endpoints

```
POST /accessories/discover  (auth optional — required only when purchaseId is supplied)
```

### Apple-bar rules

| § | Rule | How S7-W39 meets it |
|---|---|---|
| 2 intelligent | compat gate is first, ranking is second | never surfaces a mismatched accessory as "compatible" — mismatched rows are surfaced separately under `incompatible` with the specific rule that failed |
| 10 never a placeholder | no-match still returns a real state | empty `candidates` with `{source: "fixture", reason: "no accessory fixtures for this category"}` |
| no affiliate links | every accessory URL is null or canonical | **no `ref=`, `tag=`, `utm_`, or redirect-wrapper** |

### Test acceptance

- 5 purchases across 5 different categories (espresso / laptop / headphones / coffee-maker / smart-hub) return relevant accessory candidates.
- Non-matching category returns empty candidates + clear reason.
- Cross-user 403 when purchaseId belongs to someone else.
- The ranker ordering flips when the user's criteria change (e.g. price-heavy vs quality-heavy).
- `incompatible` bucket correctly lists accessories that fail the compat gate with a human-readable rule name.

## Files touched

- `workers/api/src/accessories/types.ts`
- `workers/api/src/accessories/fixtures.ts`
- `workers/api/src/accessories/compat.ts`
- `workers/api/src/accessories/rank.ts`
- `workers/api/src/accessories/handler.ts`
- `workers/api/src/accessories/*.test.ts`
- `workers/api/src/index.ts` (route wire)
- `CHECKLIST.md`

## Implementation checklist

1. Write types.ts (ComparisonRequest, AccessoryCandidate, DiscoverResponse).
2. Write fixtures.ts — 4 categories × 5-7 accessories with specs + compat rules.
3. Write compat.ts — per-accessory gate with `compatibleWith` semantics.
4. Write rank.ts — utility math, default criteria fallback, contribution breakdown.
5. Write handler.ts — POST /accessories/discover with auth-when-purchaseId + 403/404 guards.
6. Write tests: category lookup, compat gate, utility math, handler HTTP paths.
7. Wire route in index.ts.
8. Typecheck + vitest.
9. Deploy.
10. Smoke (public body — POST with productContext-only returns accessories).
11. Commit `lens(S7-W39): …` + CHECKLIST ✅ + push.
