# F19 — Secrets + env parity sweep

**Goal:** a fresh clone boots without hidden environment tribal knowledge. Every secret referenced anywhere in the codebase is documented in a `.dev.vars.example` (per worker) and an `.env.example` (per frontend), with a single canonical `docs/secrets.md` enumerating the exact `wrangler secret put` incantation per secret per worker + the GitHub Actions secrets a maintainer must mirror.

**Why the block exists:**

Earlier F1/F11/F12/F18 shipped with their individual secrets wired into `workers/api/.dev.vars.example`, but the two sibling workers (`workers/cross-model` and `workers/mcp`) never received their own templates, and `apps/web` never got an `.env.example` for its `VITE_LENS_API_URL` override. The README's install section stops at `npm install` + `wrangler deploy`, which silently fails the moment an unset secret is referenced (magic-link minting without `JWT_SECRET`, voice dictation without `DEEPGRAM_API_KEY`, cross-site cookies without `LENS_COOKIE_DOMAIN`). A contributor — or a hackathon judge — cloning this repo cold must be able to reproduce production parity by copying four files and running four `wrangler secret put` commands.

This block sweeps the entire env surface into a single documented contract.

## What references env right now (grounded inventory)

Enumerated via `grep '(env|c\.env)\.[A-Z_]+'` across `workers/**/*.ts`:

### `workers/api` (primary)

**Hard secrets (fail the feature silently when unset):**

| Secret | First use | Feature | Fallback |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | `workers/api/src/anthropic.ts` | every Opus 4.7 call | none (required) |
| `JWT_SECRET` | `workers/api/src/auth/session.ts` | F1 magic-link sessions | 503 from `/auth/request` |
| `RESEND_API_KEY` | `workers/api/src/auth/magic-link.ts` | outbound magic-link mail | console.log the link (dev) |
| `OPENAI_API_KEY` | `workers/api/src/crossModel.ts` | GPT-4o in fanout | skip model |
| `GOOGLE_API_KEY` | `workers/api/src/crossModel.ts` | Gemini in fanout | skip model |
| `OPENROUTER_API_KEY` | `workers/api/src/crossModel.ts` | Llama in fanout | skip model |
| `GMAIL_OAUTH_CLIENT_ID` | `workers/api/src/email/{oauth,handler}.ts` | F12 Gmail OAuth | 503 from `/oauth/gmail/*` |
| `GMAIL_OAUTH_CLIENT_SECRET` | `workers/api/src/email/oauth.ts` | F12 token exchange | 503 |
| `DEEPGRAM_API_KEY` | `workers/api/src/voice/transcribe.ts` | F11 server transcription | stub transcript |

**Soft env (`[vars]` in `wrangler.toml`, overridable via `.dev.vars` in local):**

| Var | Default | Meaning |
|---|---|---|
| `LENS_SEARCH_MODE` | `"fixture"` | "real" enables live Opus `web_search_20260209` |
| `MAGIC_LINK_BASE_URL` | `"https://lens-b1h.pages.dev"` | sign-in callback origin for emailed links |
| `RESEND_FROM_EMAIL` | `"Lens <no-reply@lens.example>"` | from-address for magic links |
| `GMAIL_OAUTH_REDIRECT_URI` | none | `/oauth/gmail/callback` on the deployed API origin |
| `CROSS_MODEL_AGENT_URL` | none | preferred: route fanout to `workers/cross-model`; fallback: direct calls |
| `LENS_COOKIE_DOMAIN` | none | set to `.webmarinelli.workers.dev` (or custom) in prod so `*.pages.dev` + `*.workers.dev` share the session cookie |

**Bindings (wrangler.toml, not env):** `LENS_D1`, `LENS_KV`, `LENS_R2`, `RATE_LIMIT_DO`.

### `workers/cross-model`

Secrets: `ANTHROPIC_API_KEY` (Opus synthesis), `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `OPENROUTER_API_KEY`. No bindings, no vars.

### `workers/mcp`

Vars only: `LENS_API_URL` (defaults to production URL in `wrangler.toml`). No secrets. MCP tools authenticate to the API worker over HTTPS; signed-in scope flows through the upstream cookie if the MCP client is configured with one.

### `apps/web`

Vite build reads one env: `VITE_LENS_API_URL`. Only needed for local dev or preview deployments that want to target a non-production API origin.

### GitHub Actions

Repository secrets used by `.github/workflows/pack-maintenance.yml`: `ANTHROPIC_API_KEY` (LLM-judge + regulation-watcher jobs, both gated by `if: env.ANTHROPIC_API_KEY != ''`). CI workflow (`ci.yml`) needs no secrets — it runs typecheck + `vitest` only.

## Implementation checklist

1. **`workers/api/.dev.vars.example`** — add `DEEPGRAM_API_KEY`, `LENS_COOKIE_DOMAIN`, annotate each block with the feature it unlocks.
2. **`workers/cross-model/.dev.vars.example`** — create; list the four model keys with a note that the worker gracefully skips a provider whose key is missing.
3. **`workers/mcp/.dev.vars.example`** — create; document the single `LENS_API_URL` override used only for local dev against a locally-running `workers/api`.
4. **`apps/web/.env.example`** — create; document `VITE_LENS_API_URL`.
5. **`docs/secrets.md`** — comprehensive canonical reference. One section per worker + one for GitHub Actions. Each secret row includes: purpose, whether it's required vs optional, fallback behavior, exact `wrangler secret put` command, and a link to the source file that reads it.
6. **`README.md`** — expand the "Install" section to include a "Secrets setup" step that points at `docs/secrets.md`. Add a "Local dev" section that walks through the 4-file copy ritual.
7. **Test:** add `workers/api/src/env.test.ts` that statically asserts every string literal matching `c.env.<NAME>` or `env.<NAME>` in source code is either (a) documented in `.dev.vars.example`, (b) declared in `wrangler.toml` `[vars]`, or (c) a binding (D1/KV/R2/DO). This is the structural guarantee that keeps this block from rotting.

## Acceptance criteria

- Four `.dev.vars.example` / `.env.example` files exist, each documenting every env name its worker/app references.
- `docs/secrets.md` exists, is linked from the README, and contains a `wrangler secret put <NAME>` command for every required secret.
- The `env.test.ts` test passes: no env reference in source is undocumented.
- Typecheck + vitest green.
- A contributor following only `docs/secrets.md` + `.dev.vars.example` can reach `wrangler dev` without needing to grep the source.

## Apple-product bar application

§10 of `LOOP_DISCIPLINE.md` "Never a placeholder": the env template must be real defaults (`LENS_SEARCH_MODE=fixture`, real URLs), not `TODO`. Every field has either a placeholder that makes it obvious the secret is missing (`sk-ant-...`) or a real default that works out of the box (`MAGIC_LINK_BASE_URL`). The README sets expectation: "boot in 3 commands, sign in in 2."

## Files touched

- `workers/api/.dev.vars.example` (modified)
- `workers/cross-model/.dev.vars.example` (new)
- `workers/mcp/.dev.vars.example` (new)
- `apps/web/.env.example` (new)
- `docs/secrets.md` (new)
- `README.md` (modified — Install section)
- `workers/api/src/env.test.ts` (new — the drift-prevention test)
