# Dev quickstart

Three terminals, one for each runtime.

## 1. API Worker (localhost:8787)

```bash
cd workers/api
cp .dev.vars.example .dev.vars          # then fill in ANTHROPIC_API_KEY
npx wrangler dev
```

## 2. Web dashboard (localhost:5173)

```bash
cd apps/web
VITE_LENS_API_URL=http://localhost:8787 npm run dev
```

## 3. Chrome extension

Load-unpacked from `apps/extension/` in chrome://extensions (Developer mode on). No build step for the MVP.

## Testing a fixture against the Worker

With both the Worker and web dashboard running:

```bash
curl -s -X POST http://localhost:8787/audit \
  -H 'content-type: application/json' \
  --data @fixtures/scenarios/01_espresso_chatgpt.json \
  | jq '{specOptimal: .specOptimal.name, claims: .claims, crossModel: [.crossModel[] | {provider, model, pickedProduct: .pickedProduct.name, agreesWithLens}]}'
```

## First deployment

```bash
cd workers/api
npx wrangler secret put ANTHROPIC_API_KEY
# paste the key when prompted
npx wrangler deploy
```

Optional cross-model keys (skip for Day 1; set for Day 3 once the Managed Agent is live):

```bash
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put GOOGLE_API_KEY
npx wrangler secret put OPENROUTER_API_KEY
```
