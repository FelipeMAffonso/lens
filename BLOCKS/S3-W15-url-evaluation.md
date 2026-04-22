# S3-W15 — Single-URL evaluation: per-host DOM parsers

**Status at block start:** 🟡 partial. `extract.ts#extractFromUrl` fetches a URL, strips HTML→text with a cheap regex, and hands 20kB to Opus 4.7 for semantic interpretation. Works but:
- Truncation routinely drops the real product block on long product pages.
- The LLM has to infer brand/price from visible marketing copy that mixes related products.
- Rankings reflect Opus's guess rather than a deterministic extraction, so the same URL can yield slightly different audits across runs.

This block replaces the strip-and-pray path with a structured product extractor that understands the modern retail stack (JSON-LD + OpenGraph + microdata + per-host selectors).

## Why it matters

AMBIENT_MODEL.md §2 "passive-mode" posture + VISION_COMPLETE.md §6 hidden-costs flow both hinge on reliable product identity. If Lens can't pick up the correct ASIN on Amazon or the correct SKU on Best Buy, every downstream workflow (price-history, counterfeit, recall-match, welfare-delta) is compromised.

This is also a prerequisite for S4-W23 compatibility + S4-W24 true-total-cost + S6-W34 price-drop refund — they all start from "I own this product" or "I'm looking at this product" where the identity comes from a URL.

## Design

### 1. Universal extractors (highest priority, work everywhere)

- **JSON-LD Product** (`parsers/jsonld.ts`). Every modern retailer emits `<script type="application/ld+json">` with a schema.org `Product` object. Parse every ld+json block, find any `Product` (including nested, including `@graph` arrays), extract `name`, `brand` (string or `{name}`), `offers.price` / `offers.priceCurrency`, `image`, `aggregateRating`, `sku`, `mpn`, `gtin*`.
- **OpenGraph tags** (`parsers/opengraph.ts`). `<meta property="og:title">`, `og:price:amount`, `og:price:currency`, `og:brand`, `og:image`, plus `product:*` Facebook tags.
- **Microdata** (`parsers/microdata.ts`). Legacy `<div itemscope itemtype="https://schema.org/Product">` with `itemprop` children.

### 2. Per-host selector boosts (confidence-weighted)

When the universal path is thin (no price, no brand), fall through to a host-specific parser that uses known CSS selectors / regex:

| Host | File | Key selectors |
|---|---|---|
| Amazon | `parsers/hosts/amazon.ts` | `#productTitle` → name. `#bylineInfo` / `#brand` → brand. `.a-price-whole` + `.a-price-fraction` OR `#priceblock_ourprice` → price. `#availability` → stock. `#feature-bullets li` → key specs. ASIN regex on URL + `data-asin`. |
| Best Buy | `parsers/hosts/bestbuy.ts` | `.heading-5.v-fw-regular` → name. `.priceView-hero-price span` → price. `.product-data-value.v-bold` → SKU. |
| Walmart | `parsers/hosts/walmart.ts` | `main h1` → name. `span[itemprop=price]` → price. `[data-seller-id]` → seller. |
| Target | `parsers/hosts/target.ts` | `h1[data-test=product-title]` → name. `[data-test=product-price]` → price. TCIN regex. |
| Home Depot | `parsers/hosts/homedepot.ts` | `h1.product-details__title` → name. `.price__numbers` → price. Model-number from URL + header. |
| Shopify (generic) | `parsers/hosts/shopify.ts` | Detect via `<meta name="generator" content="Shopify">`. Use `.product-single__title` / `.product__title` + `.price__regular` patterns. |

### 3. Orchestrator (`parsers/parse.ts`)

```
parseProduct(html, url): ProductParse {
  const host = matchHost(url);
  const hostParse = host ? hosts[host].parse(html, url) : {};
  const jsonLd = extractJsonLd(html);
  const og = extractOpenGraph(html);
  const micro = extractMicrodata(html);
  return mergeWithPriority(hostParse, jsonLd, og, micro, { host, url });
}
```

Merge priority (left = winner on conflict): host > jsonLd > microdata > opengraph. Every field is tagged with `source: "host" | "json-ld" | "microdata" | "opengraph" | "heuristic"` so downstream stages can weight extraction confidence.

### 4. Wire into extract

`extract.ts#extractFromUrl`:

```
const parsed = parseProduct(html, url);
if (parsed.name && parsed.price) {
  // Build deterministic AIRecommendation from parsed fields — skip Opus round-trip.
  return buildFromParsed(parsed, userIntent);
}
// Fallback: current Opus-on-text path with parsed fields as hints.
```

When the deterministic path fires, the audit completes without an Opus call on extraction — faster + cheaper + reproducible.

## Implementation checklist

1. `workers/api/src/parsers/types.ts` — `ProductParse` interface + `ParseSource` enum.
2. `workers/api/src/parsers/jsonld.ts` — `extractJsonLd(html): ProductParse | null`.
3. `workers/api/src/parsers/opengraph.ts` — `extractOpenGraph(html): ProductParse | null`.
4. `workers/api/src/parsers/microdata.ts` — `extractMicrodata(html): ProductParse | null`.
5. `workers/api/src/parsers/hosts/{amazon,bestbuy,walmart,target,homedepot,shopify}.ts` — each exports `parse(html, url): ProductParse | null`.
6. `workers/api/src/parsers/hosts/registry.ts` — host regex → parser.
7. `workers/api/src/parsers/parse.ts` — orchestrator `parseProduct(html, url)`.
8. Update `workers/api/src/extract.ts#extractFromUrl` to use the new parser.
9. Fixtures under `workers/api/src/parsers/fixtures/` — one HTML snippet per host (copy-paste trimmed versions of real product pages).
10. Tests — one per module + one per host.
11. Typecheck + test.
12. Deploy + smoke against a real Amazon URL.
13. Commit + push + CHECKLIST.

## Acceptance criteria

- 6 per-host parsers + 3 universal parsers + orchestrator shipped.
- Fixture tests: for each of the 6 hosts, a real-looking HTML fixture extracts `name + brand + price + currency` correctly.
- Orchestrator merge priority proved by test (host overrides jsonld overrides og).
- `extractFromUrl` falls back cleanly when parser returns empty.
- Typecheck clean. All new tests green.
- Deployed smoke: `POST /audit {kind:"url", url:"https://www.amazon.com/dp/B07DKZ9GHB"}` returns a deterministic pickedProduct name.

## Files touched

- `workers/api/src/parsers/types.ts` (new)
- `workers/api/src/parsers/jsonld.ts` (new)
- `workers/api/src/parsers/opengraph.ts` (new)
- `workers/api/src/parsers/microdata.ts` (new)
- `workers/api/src/parsers/hosts/{amazon,bestbuy,walmart,target,homedepot,shopify}.ts` (new)
- `workers/api/src/parsers/hosts/registry.ts` (new)
- `workers/api/src/parsers/parse.ts` (new)
- `workers/api/src/parsers/**/*.test.ts` (new)
- `workers/api/src/parsers/fixtures/*.html` (new)
- `workers/api/src/extract.ts` (modified)
