# F1 — Auth: magic-link email + anonymous device identity

**Status:** pending.
**Prerequisites:** F19 (secrets), F20 (testing infra).
**Estimated time:** 4-6 hours.
**Blocks:** all D1-persistent workflows (S6-W33 recall watcher, S6-W32 server welfare-delta, CJ-W47 household, F12 Gmail OAuth, etc.).

## Why this block exists

Every ambient / scheduled / historian workflow in the roadmap requires an anchor: *who is this data about*. Without identity, Lens cannot:
- Notify the right user when a recall fires.
- Aggregate audits across devices (phone → laptop).
- Let a household share a preference profile with per-person overrides.
- Run the disagreement ticker (need consented users, k-anonymity buckets).
- Expose a Lens Score API keyed by publisher.

The existing app is identity-free on purpose (privacy posture). We keep that posture — **anonymous by default** — and add a **lightweight magic-link path** for users who want cross-device sync. No passwords, no OAuth clutter.

## Design principles

1. **Two tiers, both first-class.** `anonUserId` (opaque, device-local, minted on first visit) and `userId` (email-attested, server-persisted). Every API route accepts both.
2. **Upgrade without loss.** When an anon user signs in, their local history + preferences migrate to the server under `userId` with `anonUserId` retained as a reference.
3. **Privacy-first copy.** "Sign in to sync across devices" never "Sign up for Lens." No email marketing opt-in; one email = one magic link.
4. **No passwords ever.** Magic link, plus optional WebAuthn passkey (stretch).
5. **Session cookie is an `HttpOnly` JWT.** Scope: `.webmarinelli.workers.dev` + `.pages.dev`. 30-day rolling expiration.
6. **CSRF via `SameSite=Lax`.** No additional token because we have no mutating GET.
7. **Rate limit** magic-link requests to 5 per email per 10 minutes via F18's Durable Object counter.

## File inventory

### Files to create

| Path | Purpose |
|---|---|
| `workers/api/src/auth/session.ts` | JWT sign/verify, cookie helpers |
| `workers/api/src/auth/magic-link.ts` | `/auth/request`, `/auth/verify` handlers |
| `workers/api/src/auth/anon.ts` | anonymous ID minting + header parsing |
| `workers/api/src/auth/middleware.ts` | Hono middleware that resolves `c.var.userId` or `c.var.anonUserId` |
| `workers/api/src/auth/migrate.ts` | anon → user migration on first sign-in |
| `workers/api/src/auth/resend.ts` | Resend API client (or SMTP fallback) |
| `packages/shared/src/auth.ts` | `User`, `Session`, `AuthContext` types |
| `apps/web/src/auth/SessionProvider.tsx` | React context with `useSession()` hook |
| `apps/web/src/auth/SignInModal.tsx` | email input → "check your inbox" state |
| `apps/web/src/auth/CallbackPage.tsx` | `/auth/callback?token=...` route that posts token and redirects |
| `apps/web/tests/e2e/auth-flow.spec.ts` | Playwright end-to-end test |
| `workers/api/src/auth/session.test.ts` | Vitest unit tests for JWT |

### Files to modify

| Path | Change |
|---|---|
| `workers/api/src/index.ts` | Register `/auth/*` routes + wire middleware on all `/audit*`, `/packs*` mutating routes |
| `workers/api/wrangler.toml` | Add `JWT_SECRET` to secrets list; bind `LENS_D1`, `LENS_KV` |
| `packages/shared/src/schemas.ts` | Add `EmailSchema`, `SignInRequestSchema`, `VerifyTokenSchema` |
| `apps/web/src/main.ts` | Wrap root in `<SessionProvider>`; add header "Sign in to sync" button |
| `apps/web/index.html` | Add `<div id="auth-modal-root">` |

## Data model (D1)

```sql
-- From workers/api/migrations/0001_init.sql (created in F2, referenced here):
CREATE TABLE users (
  id TEXT PRIMARY KEY,                -- ulid
  email TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL,           -- ISO-8601
  last_seen_at TEXT NOT NULL,
  anon_ref TEXT,                      -- original anonUserId at sign-up time
  display_name TEXT,
  tier TEXT NOT NULL DEFAULT 'free'   -- free | pro (stretch)
);
CREATE INDEX users_email ON users(email);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,                -- ulid; maps to JWT jti
  user_id TEXT NOT NULL REFERENCES users(id),
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  user_agent TEXT,
  ip_hash TEXT                        -- sha256(IP); not the raw IP
);
CREATE INDEX sessions_user ON sessions(user_id);

-- Magic-link tokens: short-lived, single-use
CREATE TABLE magic_tokens (
  token_hash TEXT PRIMARY KEY,        -- sha256(rawToken)
  email TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,           -- 15 min
  used_at TEXT,
  requesting_anon_id TEXT
);
CREATE INDEX magic_tokens_email ON magic_tokens(email);
```

## Endpoint contract

### `POST /auth/request`

Request:
```json
{ "email": "user@example.com", "anonUserId": "anon_abc123" }
```
Response:
```json
{ "ok": true, "message": "Check your inbox." }
```
On failure (invalid email, rate-limited): 400 / 429 with `{ "error": "code", "message": "..." }`.

Behavior:
1. Validate email via `EmailSchema`.
2. Rate-limit check: ≤ 5 requests per email per 10 min (DO counter, block at 6).
3. Generate 32-byte token (crypto.getRandomValues). `rawToken = base32(bytes)`. `tokenHash = sha256(rawToken)`.
4. Insert into `magic_tokens` with 15-min expiration.
5. Send email via Resend (or SMTP fallback) with link `https://lens-b1h.pages.dev/auth/callback?t=<rawToken>`.
6. Return 200 immediately regardless of whether email existed (email enumeration protection).

### `POST /auth/verify`

Request (from `CallbackPage`):
```json
{ "token": "<rawToken>", "anonUserId": "anon_abc123" }
```
Response:
```json
{ "ok": true, "user": { "id": "usr_01...", "email": "user@example.com" } }
```
Plus `Set-Cookie: lens_session=<JWT>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000; Domain=.webmarinelli.workers.dev`.

Behavior:
1. `hash = sha256(token)`. Look up in `magic_tokens`. If not found, expired, or used → 400 `invalid_token`.
2. Mark `used_at = now`.
3. Find or create `users` row by email. Record `anon_ref = anonUserId`.
4. Insert `sessions` row with 30-day expiration.
5. Sign JWT `{ sub: userId, jti: sessionId, iat, exp }`.
6. Call `migrateAnonToUser(anonUserId, userId)` → moves audits, preferences, history (see F2).
7. Return + Set-Cookie.

### `GET /auth/whoami`

Response (signed in):
```json
{ "userId": "usr_01...", "email": "user@example.com", "anonUserId": "anon_abc123" }
```
Response (anon only):
```json
{ "userId": null, "email": null, "anonUserId": "anon_abc123" }
```

### `POST /auth/signout`

Clears cookie, revokes session (marks `revoked_at`).

## Middleware resolution order

```ts
app.use("*", async (c, next) => {
  const jwt = getCookie(c, "lens_session");
  if (jwt) {
    const claims = await verifyJwt(jwt, c.env.JWT_SECRET);
    if (claims && !(await isRevoked(claims.jti, c.env.LENS_D1))) {
      c.set("userId", claims.sub);
    }
  }
  // Always set anonUserId (from header or mint new)
  const anonFromHeader = c.req.header("x-lens-anon-id");
  if (anonFromHeader && isValidAnonId(anonFromHeader)) {
    c.set("anonUserId", anonFromHeader);
  } else {
    c.set("anonUserId", mintAnonId());  // new anon — client stores it in localStorage
    c.header("x-lens-anon-id-new", c.get("anonUserId"));
  }
  await next();
});
```

Every subsequent route reads either `c.var.userId` (preferred) or `c.var.anonUserId` (fallback) to key data.

## JWT config

- Alg: HS256 (symmetric, single-worker simplicity; switch to RS256 only if we federate).
- Secret: `JWT_SECRET` from `wrangler secret put`. 64 random bytes base64'd.
- Payload: `{ sub: userId, jti: sessionId, iat, exp, kind: "session" }`.
- Expiration: `iat + 30 days`; refresh on any API call that lands within 7 days of expiry.
- Verification: check signature, `exp > now`, `jti` not in revocation list (D1 `sessions.revoked_at IS NULL`).

## Resend email template

```
Subject: Sign in to Lens

Click this link to sign in. It expires in 15 minutes.

<link>

If you didn't request this, ignore this email — nothing happens without clicking.
— Lens, the consumer's independent shopping agent
```

Send from `no-reply@webmarinelli.com` (stretch: set up DKIM/SPF/DMARC).

## Frontend flow

`apps/web/src/auth/SessionProvider.tsx`:
```ts
const ctx = createContext<AuthContext>({ user: null, anonUserId: null, signIn: () => {}, signOut: () => {} });
export const useSession = () => useContext(ctx);
```

On mount:
1. Read `lens.anon.v1` from localStorage. If missing, `fetch(/auth/whoami)` to mint one; save.
2. `fetch(/auth/whoami, { credentials: "include" })` → populate `user` if signed in.
3. Re-run on focus.

Sign-in modal (`SignInModal.tsx`):
1. State: `idle | sending | sent | error`.
2. On submit: `POST /auth/request` with email + anon id.
3. Show "Check your inbox." Never reveal whether the email existed.

Callback page (`/auth/callback?t=<token>`):
1. Read `t` from URL.
2. `POST /auth/verify` with token + anon id.
3. On success: replace URL (remove token), redirect to `/` or original `return_to`.
4. On failure: show retry UI.

## Tests

### Unit (`workers/api/src/auth/session.test.ts`)
- `signJwt` + `verifyJwt` roundtrip.
- Expired JWT → `verifyJwt` returns null.
- Revoked `jti` → resolution fails even if signature valid.
- Invalid signature → rejected.
- `mintAnonId()` produces 128-bit base32 IDs; collision rate below 1-in-2^32 for 10k runs.

### Integration (`workers/api/src/auth/magic-link.test.ts`)
- Happy path: request → inspect D1 token row → verify → session created → cookie returned.
- Invalid email → 400.
- 6th request in 10 min → 429.
- Expired token → 400.
- Used-once token → second verify returns 400.
- `/auth/whoami` before sign-in → anon-only.
- `/auth/whoami` after sign-in → user + anon.
- `/auth/signout` → subsequent whoami returns anon-only.

### E2E (`apps/web/tests/e2e/auth-flow.spec.ts`, Playwright)
- Open `/`, click Sign In, enter email.
- Mock Resend inbox (local SMTP catcher or Playwright intercept).
- Click link in mocked email.
- Arrive at `/auth/callback`, verify cookie, redirect to `/`.
- Header shows email.
- Refresh → still signed in.
- Sign out → back to anon.

## Acceptance criteria

- [ ] User opens site with no cookies → `whoami` returns anon-only with `anonUserId` populated.
- [ ] User clicks Sign In → modal → email sent.
- [ ] Mocked inbox catches email with link containing `?t=<hex>`.
- [ ] Clicking link lands on callback, cookie set, redirected to `/`.
- [ ] Nav bar shows email.
- [ ] `/auth/whoami` returns `{ userId, email, anonUserId }`.
- [ ] Refresh keeps session (JWT cookie, not in localStorage).
- [ ] Sign out revokes session, whoami returns anon-only.
- [ ] Rate limit hits at 6th request per email per 10 min.
- [ ] Anon history (5 seeded localStorage audits) migrates to server; `/audit/history` returns them after sign-in.
- [ ] All unit + integration tests pass. Coverage ≥ 85% for `auth/*`.
- [ ] Playwright e2e green.
- [ ] `npm run typecheck` green.
- [ ] `GAP_ANALYSIS.md` H3 "identity" gap crossed off.

## Implementation checklist (sequential)

1. [ ] Create `workers/api/migrations/0001_auth.sql` with `users`, `sessions`, `magic_tokens` tables. Apply via `wrangler d1 execute LENS_D1 --file=migrations/0001_auth.sql`.
2. [ ] Add `JWT_SECRET` + `RESEND_API_KEY` to `.dev.vars.example`; set real values via `wrangler secret put`.
3. [ ] Implement `workers/api/src/auth/session.ts` (sign/verify JWT using Web Crypto).
4. [ ] Implement `workers/api/src/auth/anon.ts` (mint + validate + header parsing).
5. [ ] Implement `workers/api/src/auth/resend.ts` (Resend API client; stub in test).
6. [ ] Implement `workers/api/src/auth/magic-link.ts` — `/auth/request`, `/auth/verify`, `/auth/signout`, `/auth/whoami` handlers.
7. [ ] Implement `workers/api/src/auth/middleware.ts` + wire into Hono app in `workers/api/src/index.ts`.
8. [ ] Write unit tests for `session.ts` and `anon.ts`.
9. [ ] Write integration tests for `/auth/*` routes (miniflare or wrangler dev).
10. [ ] Implement `packages/shared/src/auth.ts` types + export via `index.ts`.
11. [ ] Implement `apps/web/src/auth/SessionProvider.tsx`.
12. [ ] Implement `apps/web/src/auth/SignInModal.tsx`.
13. [ ] Implement `apps/web/src/auth/CallbackPage.tsx` + add route in `main.ts` (simple hash/search router since current app has no router — use `window.location.pathname`).
14. [ ] Update `main.ts` to wrap rendering in `SessionProvider` (or equivalent vanilla pattern; current app is vanilla TS — use a thin session module).
15. [ ] Write Playwright e2e.
16. [ ] `wrangler deploy` (api) + `wrangler pages deploy` (web).
17. [ ] Live smoke test: real email address (personal), real verification.
18. [ ] Check ✅ in CHECKLIST.md; commit with `lens(F1): auth magic-link + anon tiers`.

## Rollback plan

If the block destabilizes existing endpoints:
1. Revert `workers/api/src/index.ts` middleware line to no-op.
2. Keep the auth routes shipped but not required.
3. Frontend continues in anon-only mode.

## Notes

- Do NOT persist raw magic-link tokens. Only sha256 hashes.
- Do NOT log email addresses in structured logs. Log `email_hash` if needed.
- Do NOT add Google/Apple social login in this block. Magic link only — scope creep kills us.
- Passkey (WebAuthn) is a stretch; file it under F1-stretch.
