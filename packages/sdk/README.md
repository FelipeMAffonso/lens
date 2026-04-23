# @lens/sdk

Typed JS/TS wrapper for the [Lens](https://lens-b1h.pages.dev) welfare-audit API. Zero runtime dependencies (uses `globalThis.fetch`). MIT-licensed.

Lens is the consumer's independent shopping agent — every response derives from ≥2 public sources with confidence + timestamp. No affiliate links, no ranking bias. Built for the "Built with Opus 4.7" Claude Code hackathon (2026-04-26).

## Install

```bash
npm install @lens/sdk
# or
bun add @lens/sdk
```

## Quick start

```ts
import { LensClient } from "@lens/sdk";

const lens = new LensClient(); // defaults to https://lens-api.webmarinelli.workers.dev

// 1. Audit an AI shopping recommendation
const result = await lens.audit({
  kind: "text",
  source: "chatgpt",
  raw: "For an espresso machine under $400 I recommend the De'Longhi Stilosa…",
  userPrompt: "espresso machine under $400, pressure + build matter most",
});

// 2. Fuzzy-search the 27-source triangulated catalog
const hits = await lens.sku.search("Breville Bambino");
console.log(hits.skus[0].name, hits.skus[0].priceMedianCents);

// 3. Side-by-side compare 2-6 SKUs
const compare = await lens.sku.compare(["wd:Q123", "wd:Q456"]);

// 4. Live data-spine metrics (for your dashboard)
const stats = await lens.architectureStats();
console.log(`${stats.sources_healthy}/${stats.sources_configured} sources healthy`);
```

## Constructor options

```ts
new LensClient({
  baseUrl: "https://lens-api.webmarinelli.workers.dev",  // or your self-hosted worker
  fetch: customFetch,           // inject your own for tests / Deno / Bun
  sessionCookie: "lens_session=…", // for authenticated routes (digest preferences)
  headers: { "x-app": "my-app" },  // merged into every request
});
```

## Namespaces

| Namespace | Method | Endpoint |
|-----------|--------|----------|
| (top-level) | `audit(input)` | `POST /audit` |
| (top-level) | `architectureStats()` | `GET /architecture/stats` |
| (top-level) | `architectureSources()` | `GET /architecture/sources` |
| (top-level) | `health()` | `GET /health` |
| (top-level) | `ticker()` | `GET /ticker` |
| (top-level) | `embedScore(url)` | `GET /embed/score?url=…` |
| (top-level) | `visualAudit(body)` | `POST /visual-audit` |
| `sku` | `search(qOrParams)` | `GET /sku/search` |
| `sku` | `get(id)` | `GET /sku/:id` |
| `sku` | `compare(ids)` | `GET /compare?skus=…` |
| `triggers` | `definitions()` | `GET /triggers/definitions` |
| `triggers` | `report(body)` | `POST /triggers/report` |
| `triggers` | `aggregate()` | `GET /triggers/aggregate` |
| `shoppingSession` | `start(body?)` | `POST /shopping-session/start` |
| `shoppingSession` | `capture(body)` | `POST /shopping-session/capture` |
| `shoppingSession` | `summary(id)` | `GET /shopping-session/:id/summary` |
| `push` | `vapidPublicKey()` | `GET /push/vapid-public-key` |
| `push` | `subscribe(body)` | `POST /push/subscribe` |
| `push` | `unsubscribe(body)` | `POST /push/unsubscribe` |
| `digest` | `getPreferences()` | `GET /digest/preferences` |
| `digest` | `setPreferences(prefs)` | `PUT /digest/preferences` |

Full schema with request / response shapes lives at [`/openapi.json`](https://lens-api.webmarinelli.workers.dev/openapi.json) and an interactive viewer at [`/docs`](https://lens-api.webmarinelli.workers.dev/docs).

## Error handling

HTTP errors throw `LensError` which carries the status + parsed body:

```ts
import { LensError } from "@lens/sdk";

try {
  await lens.sku.get("does-not-exist");
} catch (err) {
  if (err instanceof LensError) {
    console.error(`status=${err.status}`, err.body);
  }
}
```

## License

MIT. No affiliate links. No ranking bias. Source on [GitHub](https://github.com/FelipeMAffonso/lens).
