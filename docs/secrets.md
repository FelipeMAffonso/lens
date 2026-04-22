# Secrets + env parity — the canonical reference

Lens ships across three Cloudflare Workers + one Vite web app + a Chrome MV3 extension. Each surface has its own env envelope. This document is the single source of truth for every secret Lens reads, where it's read, how it fails when unset, and the exact command to provision it.

For local development, every worker has a `.dev.vars.example` committed next to its `wrangler.toml`. Copy to `.dev.vars` (gitignored), fill in values, and `wrangler dev` picks them up automatically. For production, use `npx wrangler secret put <NAME>` from inside the worker's directory.

## Contents

1. [workers/api](#workersapi)
2. [workers/cross-model](#workerscross-model)
3. [workers/mcp](#workersmcp)
4. [apps/web](#appsweb)
5. [apps/extension](#appsextension)
6. [GitHub Actions](#github-actions)
7. [Local boot in 90 seconds](#local-boot-in-90-seconds)

---

## workers/api

The primary Worker. Source-of-truth for auth, workflow engine, packs, voice transcription, Gmail OAuth scaffolding, rate limiting, ticker aggregation, recall watcher, webhook handler, MCP upstream.

### Secrets (use `npx wrangler secret put <NAME>` inside `workers/api/`)

| Name | Required? | Purpose | Read by | Fallback when unset |
|---|---|---|---|---|
| `ANTHROPIC_API_KEY` | **yes** | Opus 4.7 calls — extract, verify, Stage-2 dark-pattern confirmation, cross-model synthesis. | `src/anthropic.ts` | no fallback; calls throw. |
| `JWT_SECRET` | yes (for auth) | HS256 session signing for magic-link flow. 64 random bytes base64-encoded. | `src/auth/session.ts` via `magic-link.ts`, `middleware.ts` | `/auth/request` and `/auth/verify` return 503. |
| `RESEND_API_KEY` | recommended | Outbound magic-link email + weekly digest. | `src/auth/magic-link.ts` | Worker console-logs the URL (dev convenience; never do this in prod). |
| `OPENAI_API_KEY` | optional | GPT-4o in cross-model fanout. | `src/crossModel.ts` | provider skipped. |
| `GOOGLE_API_KEY` | optional | Gemini-2.5-flash in cross-model fanout. | `src/crossModel.ts` | provider skipped. |
| `OPENROUTER_API_KEY` | optional | Llama-3.3-70B in cross-model fanout. | `src/crossModel.ts` | provider skipped. |
| `GMAIL_OAUTH_CLIENT_ID` | optional | F12 Gmail OAuth scope — receipts + subscription discovery. | `src/email/oauth.ts`, `src/email/handler.ts` | `/oauth/gmail/request` and `/oauth/gmail/callback` return 503. |
| `GMAIL_OAUTH_CLIENT_SECRET` | optional | Paired with `GMAIL_OAUTH_CLIENT_ID`. | `src/email/oauth.ts` | 503 (see above). |
| `DEEPGRAM_API_KEY` | optional | F11 server-side voice transcription via Deepgram Nova-3. | `src/voice/transcribe.ts` | `/voice/transcribe` returns a stub transcript so the UI remains functional in demos. |

Generate `JWT_SECRET` with:
```bash
openssl rand -base64 64
```

Then set it in prod:
```bash
cd workers/api
npx wrangler secret put JWT_SECRET < <(openssl rand -base64 64)
```

Bulk-set during first deploy:
```bash
cd workers/api
for NAME in ANTHROPIC_API_KEY JWT_SECRET RESEND_API_KEY \
            OPENAI_API_KEY GOOGLE_API_KEY OPENROUTER_API_KEY \
            GMAIL_OAUTH_CLIENT_ID GMAIL_OAUTH_CLIENT_SECRET \
            DEEPGRAM_API_KEY; do
  npx wrangler secret put "$NAME"
done
```

### Vars (in `wrangler.toml`, overridable via `.dev.vars`)

| Name | Default | Meaning |
|---|---|---|
| `LENS_SEARCH_MODE` | `"fixture"` | `"fixture"` uses the hand-crafted catalog (fast, deterministic); `"real"` hits Opus 4.7's live `web_search_20260209`. |
| `MAGIC_LINK_BASE_URL` | `"https://lens-b1h.pages.dev"` | Origin of the sign-in callback page emailed to users. |
| `RESEND_FROM_EMAIL` | `"Lens <no-reply@lens.example>"` | From-address on outbound Lens email. Replace with a verified sender in your Resend account. |
| `GMAIL_OAUTH_REDIRECT_URI` | (none) | Exact redirect URI registered with Google. Defaults to the production API path if unset. |
| `CROSS_MODEL_AGENT_URL` | (none) | URL of the deployed `workers/cross-model` worker. When set, fanout calls it over HTTP instead of running inline. |
| `LENS_COOKIE_DOMAIN` | (none) | Parent domain for the session cookie (e.g., `.webmarinelli.workers.dev`). Leave empty in local dev; essential in prod when web app and API are on different subdomains. |

### Bindings (declared in `wrangler.toml`, not env)

| Binding | Kind | Use |
|---|---|---|
| `LENS_D1` | D1 database | Every persisted row: users, sessions, audits, purchases, workflow runs, ticker events, oauth_tokens. |
| `LENS_KV` | KV namespace | Webhook idempotency + cron distributed lock. |
| `LENS_R2` | R2 bucket | Blob storage for uploaded screenshots, receipt images, pack evidence. |
| `RATE_LIMIT_DO` | Durable Object | F18 token-bucket counter per user/IP/route. |

---

## workers/cross-model

Small worker that fans out to 3 non-Anthropic providers and asks Opus 4.7 to synthesize the disagreement.

### Secrets (`wrangler secret put <NAME>` inside `workers/cross-model/`)

| Name | Required? | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | **yes** | Opus 4.7 synthesis step. |
| `OPENAI_API_KEY` | optional | GPT-4o fanout. |
| `GOOGLE_API_KEY` | optional | Gemini-2.5-flash fanout. |
| `OPENROUTER_API_KEY` | optional | Llama-3.3-70B fanout. |

No vars, no bindings.

---

## workers/mcp

Third worker exposing Lens as an MCP (Model Context Protocol) server. Every tool is a thin wrapper around the primary API worker — no model keys live here.

### Vars

| Name | Default | Meaning |
|---|---|---|
| `LENS_API_URL` | `"https://lens-api.webmarinelli.workers.dev"` | Upstream API origin. Override when pointing MCP at a local `wrangler dev` session of `workers/api`. |

No secrets, no bindings.

---

## apps/web

Vite SPA. Only one env var, and only `VITE_`-prefixed variables reach the browser.

| Name | Default | Meaning |
|---|---|---|
| `VITE_LENS_API_URL` | `"https://lens-api.webmarinelli.workers.dev"` | API origin the web app targets. Override for local or preview deploys. Put in `apps/web/.env.local`. |

---

## apps/extension

The Chrome MV3 extension reads zero build-time secrets. The bundled `content.js`, `background.js`, and `sidebar/*` all talk to a baked-in production API origin. There is nothing for a contributor to configure — unless you need to repoint the extension at a local API worker, in which case the build script accepts `LENS_API_URL=http://127.0.0.1:8787 npm run build` and bakes that origin into the bundle.

---

## GitHub Actions

Repository secrets (set in Settings → Secrets and variables → Actions → New repository secret):

| Name | Consumed by | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | `.github/workflows/pack-maintenance.yml` | Weekly LLM-judge validation and regulation-watcher jobs. Each job is guarded with `if: env.ANTHROPIC_API_KEY != ''`, so an absent secret is a soft no-op (the job logs "skipped" instead of failing). |

The `ci.yml` workflow (typecheck + vitest) needs zero secrets. Every unit test runs on local fixtures.

---

## Local boot in 90 seconds

```bash
git clone https://github.com/FelipeMAffonso/lens.git
cd lens
npm install --no-audit --no-fund
node scripts/bundle-packs.mjs

# Copy every env template.
cp workers/api/.dev.vars.example workers/api/.dev.vars
cp workers/cross-model/.dev.vars.example workers/cross-model/.dev.vars
cp workers/mcp/.dev.vars.example workers/mcp/.dev.vars
cp apps/web/.env.example apps/web/.env.local

# Fill in at minimum ANTHROPIC_API_KEY in workers/api/.dev.vars.

# Boot the workers (each in its own terminal).
cd workers/api        && npx wrangler dev    # :8787
cd workers/cross-model && npx wrangler dev   # :8788
cd workers/mcp        && npx wrangler dev    # :8789

# Boot the web app.
cd apps/web && npm run dev                   # :5173
```

That's it. Magic links land in the worker's stdout (because `RESEND_API_KEY` is empty), sessions sign with your local `JWT_SECRET`, and the fixture catalog keeps audit flows deterministic without a `LENS_SEARCH_MODE=real` round-trip.

For production, repeat the `wrangler secret put <NAME>` loop once per worker, verify with `npx wrangler secret list` inside each worker directory, then `npx wrangler deploy`.

---

## Anti-drift guarantee

`workers/api/src/env.test.ts` statically asserts that every `env.<NAME>` and `c.env.<NAME>` reference in the API worker source is documented in one of: this worker's `.dev.vars.example`, its `wrangler.toml` `[vars]`, or its bindings. Adding a new env reference without updating the template fails CI.
