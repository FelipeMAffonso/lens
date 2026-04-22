# F15 — Public Lens Score API

**Status:** in progress.

## Scope
- `GET /score?url=&category=&criteria=` — returns a Lens utility score `{score, breakdown, packVersion, category}` for an arbitrary product URL + user criteria, cached per (url, criteria-hash) in KV for 1h.
- `GET /embed.js` — CDN-hosted JS snippet that publishers drop in. Reads `data-url` + `data-criteria` attributes, calls the score API, renders inline.
- Tests: 3+ for the score handler (valid / missing / cached).

## Files
- `workers/api/src/public/score.ts`
- `workers/api/src/public/score.test.ts`
- `workers/api/src/index.ts` — wire `GET /score` + `GET /embed.js`

## Acceptance
- [ ] GET /score?url=&category=espresso-machines returns a valid {score, breakdown, packVersion}.
- [ ] GET /embed.js returns a small (<5kb) JS snippet.
- [ ] 3+ tests.
- [ ] Live smoke.
