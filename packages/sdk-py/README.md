# lens-sdk (Python)

Typed Python client for the [Lens](https://lens-b1h.pages.dev) welfare-audit API. One runtime dependency (`requests`). MIT-licensed.

Lens is the consumer's independent shopping agent. Every response derives from ≥2 public sources with confidence + timestamp. No affiliate links, no ranking bias. Built for the "Built with Opus 4.7" Claude Code hackathon (2026-04-26).

## Install

```bash
pip install lens-sdk
```

## Quick start

```python
from lens_sdk import LensClient

lens = LensClient()  # defaults to https://lens-api.webmarinelli.workers.dev

# 1. Audit an AI shopping recommendation
result = lens.audit(
    kind="text",
    source="chatgpt",
    raw="For an espresso machine under $400 I recommend the De'Longhi Stilosa...",
    user_prompt="espresso machine under $400, pressure + build matter most",
)

# 2. Fuzzy-search the 28-source triangulated catalog
hits = lens.sku_search("Breville Bambino")
print(hits["skus"][0]["name"], hits["skus"][0].get("priceMedianCents"))

# 3. Side-by-side compare 2-6 SKUs
compare = lens.sku_compare(["wd:Q123", "wd:Q456"])

# 4. Live data-spine metrics
stats = lens.architecture_stats()
print(f"{stats['sources_healthy']}/{stats['sources_configured']} sources healthy")
```

## Constructor

```python
LensClient(
    base_url="https://lens-api.webmarinelli.workers.dev",   # or your self-hosted worker
    session_cookie="lens_session=...",                      # for digest prefs
    session=requests.Session(),                             # inject for pooling / retries
    headers={"x-app": "my-notebook"},
    timeout=30.0,
)
```

## Error handling

HTTP errors raise `LensError` with the status code and parsed body:

```python
from lens_sdk import LensClient, LensError

lens = LensClient()
try:
    lens.sku_get("does-not-exist")
except LensError as e:
    print(f"status={e.status} body={e.body}")
```

## Full API

| Method | Endpoint |
|--------|----------|
| `health()` | `GET /health` |
| `architecture_stats()` | `GET /architecture/stats` |
| `architecture_sources()` | `GET /architecture/sources` |
| `ticker()` | `GET /ticker` |
| `audit(kind, ...)` | `POST /audit` |
| `sku_search(q, ...)` | `GET /sku/search` |
| `sku_get(id)` | `GET /sku/:id` |
| `sku_compare(ids)` | `GET /compare?skus=...` |
| `triggers_definitions()` | `GET /triggers/definitions` |
| `triggers_report(...)` | `POST /triggers/report` |
| `triggers_aggregate()` | `GET /triggers/aggregate` |
| `shopping_session_start(...)` | `POST /shopping-session/start` |
| `shopping_session_capture(...)` | `POST /shopping-session/capture` |
| `shopping_session_summary(id)` | `GET /shopping-session/:id/summary` |
| `visual_audit(...)` | `POST /visual-audit` |
| `push_vapid_public_key()` | `GET /push/vapid-public-key` |
| `push_subscribe(...)` | `POST /push/subscribe` |
| `push_unsubscribe(...)` | `POST /push/unsubscribe` |
| `digest_get_preferences()` | `GET /digest/preferences` |
| `digest_set_preferences(prefs)` | `PUT /digest/preferences` |
| `embed_score(url)` | `GET /embed/score?url=...` |

Interactive schema reference: [`/openapi.json`](https://lens-api.webmarinelli.workers.dev/openapi.json) · Docs viewer: [`/docs`](https://lens-api.webmarinelli.workers.dev/docs).

## License

MIT. Source: [github.com/FelipeMAffonso/lens](https://github.com/FelipeMAffonso/lens).
