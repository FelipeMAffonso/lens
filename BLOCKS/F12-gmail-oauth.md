# F12 — Email inbox ingestion (Gmail OAuth)

**Status:** in progress. Infrastructure ships; live polling gated on user-provided OAuth client credentials.

## Why
Per AMBIENT_MODEL.md §4 + VISION_COMPLETE.md §3, the "background mode" spine depends on Lens knowing what the user bought. The user types one URL into Lens; Lens's recall-watcher + price-drop-watcher + subscription-audit workflows need the purchase history to fire against. Gmail OAuth is the lowest-friction path — users forward no receipts, they just connect once and Lens sees new receipts automatically.

## Scope
- `workers/api/migrations/0003_email.sql`: `oauth_tokens` + `purchases` tables.
- `workers/api/src/email/oauth.ts`: OAuth 2.0 flow — authorize URL, callback handler, refresh-token handling. Scope `gmail.readonly` + `gmail.send` (for intervention-letter outbound).
- `workers/api/src/email/tokens.ts`: D1 CRUD for oauth_tokens (user_id, provider, access_token, refresh_token, expires_at).
- `workers/api/src/email/gmail.ts`: Gmail API client (list + get messages, filter by subject-line heuristics, decode MIME parts).
- `workers/api/src/email/parser.ts`: Opus 4.7 receipt parser — extract product, retailer, price, order id, date from HTML or image receipts.
- `workers/api/src/workflow/specs/email-poll.ts`: cron-targeted workflow (`*/15 * * * *`).
- `workers/api/src/purchases/repo.ts`: purchases CRUD.
- Endpoints: `GET /oauth/gmail/authorize` (redirect), `GET /oauth/gmail/callback`, `GET /purchases` (list user's).
- `apps/web/src/email/connect.ts`: "Connect Gmail" button + state management.
- Tests: 10+ (OAuth URL generation, callback token exchange, parser happy path, poller dedup).

## OAuth secrets needed (from user, one-time)
- `GMAIL_OAUTH_CLIENT_ID`
- `GMAIL_OAUTH_CLIENT_SECRET`
- `GMAIL_OAUTH_REDIRECT_URI` (should be `https://lens-api.webmarinelli.workers.dev/oauth/gmail/callback`)

## Data model
```sql
CREATE TABLE oauth_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL,           -- 'gmail', 'plaid', future
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  scopes TEXT,
  expires_at TEXT,
  last_refreshed_at TEXT,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  UNIQUE(user_id, provider)
);

CREATE TABLE purchases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  source TEXT NOT NULL,              -- 'gmail' | 'manual' | 'plaid' | 'extension'
  source_ref TEXT,                   -- Gmail message id / Plaid txn id
  retailer TEXT,
  order_id TEXT,
  product_name TEXT NOT NULL,
  brand TEXT,
  category TEXT,
  price REAL,
  currency TEXT DEFAULT 'USD',
  purchased_at TEXT NOT NULL,
  raw_payload_json TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, source, source_ref)
);
```

## Poller logic
1. Load all users with `oauth_tokens.provider='gmail'` + not revoked.
2. For each: call Gmail `users.messages.list?q=from:(amazon OR bestbuy OR target OR walmart OR apple OR ebay) newer_than:24h`.
3. For each new messageId not in `purchases.source_ref`: fetch full message, pass to Opus 4.7 parser → store purchase row.
4. Dedupe via `UNIQUE(user_id, source, source_ref)`.

## Acceptance (this block)
- [ ] Migration 0003 applied (creates both tables).
- [ ] OAuth authorize + callback endpoints return correct redirect + exchange tokens.
- [ ] Token refresh works when access_token expired.
- [ ] Receipt parser produces valid purchase rows on fixture inputs (Amazon, Best Buy, Target HTML receipts).
- [ ] email.poll workflow registered; fires via the existing `*/15 * * * *` cron.
- [ ] GET /purchases returns signed-in user's purchases.
- [ ] Tests: 10+ pass.
- [ ] Live smoke: when GMAIL_OAUTH_CLIENT_ID unset, /oauth/gmail/authorize returns `{ error: "oauth_unconfigured" }` rather than crashing.

## Non-goals this block
- Real Gmail poll against a live inbox (needs user-provided OAuth secret).
- Inbound receipt forwarder (`lens+receipts@...`) — lands in a follow-up block.
- Plaid bank link (F13 stretch).
