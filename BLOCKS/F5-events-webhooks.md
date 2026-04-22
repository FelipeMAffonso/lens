# F5 — Event bus + webhook surface

**Status:** in progress. F3 already shipped `workflow/events.ts` with 12 typed events.

## Scope (minimum viable additions)
- **Formalize** the in-process bus (F3) into a public API used by cross-module subscribers.
- **`POST /webhook/:id`** — external services trigger Lens workflows. Idempotent via KV (prevents duplicate ingests).
- **`GET /webhooks`** — introspection.
- **Event persistence** to KV with short TTL so late subscribers can catch recent events.

## Files
- `workers/api/src/webhooks/registry.ts` — `WebhookHandler` map.
- `workers/api/src/webhooks/handler.ts` — Hono handler `POST /webhook/:id` with idempotency + dispatcher.
- `workers/api/src/webhooks/idempotency.ts` — KV idempotency key helpers.
- `workers/api/src/webhooks/registry.test.ts`
- `workers/api/src/webhooks/idempotency.test.ts`
- `workers/api/src/index.ts` — wire `/webhook/:id` + `GET /webhooks`.

## Acceptance
- [ ] 4 webhook types registered (recall-notify, price-changed, review-flagged, pack-update).
- [ ] Idempotency key dedups within 24h window via KV.
- [ ] Webhook → workflow engine run chained.
- [ ] Tests: idempotency (6), registry (3), handler (3) → +12 tests.
- [ ] Live smoke.
