# @lens/cli

Command-line wrapper over [`@lens/sdk`](https://github.com/FelipeMAffonso/lens/tree/main/packages/sdk) for auditing AI shopping answers and introspecting the Lens data spine from a terminal.

## Install + run

```bash
npx @lens/cli stats
npx @lens/cli search "Breville Bambino"
npx @lens/cli sku wd:Q123
npx @lens/cli trigger cisa-kev
pbpaste | npx @lens/cli audit-text    # audit clipboard on macOS
npx @lens/cli audit-url https://amazon.com/dp/B0CBPBKK1L
```

## Commands

| Command | What it does |
|---------|--------------|
| `stats` | Live data-spine metrics (skus, brands, sources_healthy/configured). |
| `sources` | Full 29-source registry with per-source status + cadence. |
| `next-due` | Preview what the 15-min cron dispatcher picks on its next tick. |
| `trigger <id>` | Manually kick an ingester (e.g. `cisa-kev`, `fda-510k`). Idempotent. |
| `search <query>` | FTS5 fuzzy catalog search. |
| `sku <id>` | Single SKU detail with triangulated price + sources + recalls. |
| `compare <a,b,c>` | Side-by-side comparison of 2-6 SKUs. |
| `audit-text` | Audit a pasted AI recommendation from stdin. |
| `audit-url <url>` | Audit a retailer URL. |
| `ticker` | k-anonymous disagreement aggregates (k≥5). |
| `health` | Liveness + bindings. |

## Configuration

```bash
export LENS_API_URL=https://lens-api.webmarinelli.workers.dev   # default
# or point at your self-hosted Worker
```

## License

MIT.
