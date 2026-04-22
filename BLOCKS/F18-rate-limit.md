# F18 — Rate limiting (Durable Object token bucket)

**Status:** in progress.

## Why
Every LLM-backed endpoint (`/audit`, `/audit/stream`, `/score`, `/review-scan`, `/voice/transcribe`, `/passive-scan`) spends Anthropic credits. Without rate limiting, an anonymous client can drain the API key. Cloudflare Workers ship Durable Objects as the idiomatic primitive for per-key token-bucket counters with atomic increments.

## Scope
- `workers/api/src/ratelimit/counter-do.ts` — `RateLimitCounter` Durable Object class. Exposes `POST /check` that atomically increments a bucket + returns `{ok, remaining, resetAt}`.
- `workers/api/src/ratelimit/middleware.ts` — Hono middleware that looks up `userId ?? anonUserId`, picks a bucket (per-route), calls the DO, returns 429 when exhausted.
- `workers/api/src/ratelimit/config.ts` — per-route policy (limits per tier).
- `wrangler.toml` — DO binding + migration.
- Tests: 6+.

## Policy (v1)
| Route | Anon tier | Signed-in tier | Window |
|---|---|---|---|
| `/audit` (+stream) | 30 / day | 500 / day | rolling 24h |
| `/score` | 200 / day | 2000 / day | rolling 24h |
| `/voice/transcribe` | 20 / day | 200 / day | rolling 24h |
| `/review-scan` | 100 / hour | 1000 / hour | rolling 1h |
| `/auth/request` | 5 / 10m per email | — | rolling 10m |

## Acceptance
- [ ] DO class deployed with migration.
- [ ] Middleware returns 429 + `Retry-After` header when exhausted.
- [ ] 429 response includes `{error, remaining, resetAt}`.
- [ ] 6+ tests.
- [ ] Live smoke.
