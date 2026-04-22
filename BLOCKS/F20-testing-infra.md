# F20 — Testing infrastructure

**Status:** in progress.
**Prerequisites:** none (this is the first block).
**Estimated time:** 3-5 hours.
**Blocks:** every subsequent block that needs tests to validate ✅.

## Why this block exists

Every subsequent block in the plan has a "tests pass" gate before ✅. Without a testing harness in place up front, we'd either defer testing (drift) or retrofit it later (slow). CrossBeam built its L0-L5 testing ladder as its first real block; Elisa shipped 1,500+ tests in 30 hours. We mirror both.

**Target by end of block:**
- Vitest configured for every workspace (`workers/api`, `workers/cross-model`, `packages/shared`, `apps/web`, `apps/extension`).
- Playwright configured for `apps/web` (browser e2e) and `apps/extension` (MV3 extension e2e via persistent context).
- `@cloudflare/vitest-pool-workers` for worker unit tests with real D1/KV/R2 semantics via miniflare.
- Root `npm test` runs all test suites.
- CI (`.github/workflows/ci.yml`) runs every suite on push + PR, fails on regression.
- First ≥ 30 tests ship in this block so the harness is proven.

## Design principles

1. **Vitest everywhere for units + integration.** Fast, Vite-native, TypeScript-first, matches Elisa's choice.
2. **Miniflare pool** for worker tests — gives us real Durable Objects, D1, KV, R2 against in-memory implementations.
3. **Playwright for browser e2e + extension.** Chromium-only for MVP; Firefox/WebKit stretch.
4. **Tests colocated with code** (`file.ts` + `file.test.ts`), except Playwright specs which live in `{app}/tests/e2e/`.
5. **Test doubles, not mocks of Anthropic.** Use `LENS_SEARCH_MODE=fixture` + cassettes for LLM calls. A fake Anthropic fixture lives in `workers/api/src/test-utils/fake-anthropic.ts`.
6. **Fast by default.** Target suite run < 30 s local. Parallelism via Vitest threads pool.
7. **Coverage gate.** v8 coverage provider; minimum 80% branches for every src file.
8. **Deterministic.** Seed all randomness via `crypto.randomUUID` wrapped in a test seed provider. Freeze time with `vi.useFakeTimers()` where needed.
9. **Typed fixtures.** Every fixture JSON imported via `satisfies` operator for TS safety.

## File inventory

### Root

| Path | Contents |
|---|---|
| `package.json` | add scripts: `test`, `test:workers`, `test:web`, `test:ext`, `test:shared`, `test:coverage`, `test:ci` |
| `vitest.workspace.ts` | workspace config referencing all workspace vitest configs |
| `.github/workflows/ci.yml` | extend with test job running all suites + coverage report |

### Per workspace

| Path | Contents |
|---|---|
| `workers/api/vitest.config.ts` | miniflare pool-workers config |
| `workers/api/tsconfig.test.json` | test-only tsconfig w/ vitest types |
| `workers/api/src/test-utils/fake-anthropic.ts` | deterministic fake Anthropic client |
| `workers/api/src/test-utils/fixtures.ts` | shared fixtures |
| `workers/api/src/test-utils/make-env.ts` | build an `Env` object for tests |
| `workers/api/src/review-scan.test.ts` | first unit test (already-shipped W17 scanner) |
| `workers/api/src/rank.test.ts` | deterministic ranker tests |
| `workers/api/src/packs/registry.test.ts` | pack registry tests |
| `workers/cross-model/vitest.config.ts` | miniflare pool-workers |
| `workers/cross-model/src/index.test.ts` | fanout + synthesis tests (fake providers) |
| `packages/shared/vitest.config.ts` | node-pool config |
| `packages/shared/src/schemas.test.ts` | zod schema tests |
| `apps/web/vitest.config.ts` | jsdom env (for any vanilla-TS unit tests) |
| `apps/web/playwright.config.ts` | Playwright config (Chromium only) |
| `apps/web/tests/e2e/smoke.spec.ts` | smoke e2e: load page, see pack stats |
| `apps/web/tests/e2e/audit-query.spec.ts` | full audit flow in query mode |
| `apps/extension/playwright.config.ts` | Playwright with persistent-context for MV3 |
| `apps/extension/tests/e2e/smoke.spec.ts` | extension loads, content script runs, popup opens |

## Installs

Root devDependencies:
```json
"@vitest/coverage-v8": "^2.1.3",
"vitest": "^2.1.3",
"happy-dom": "^15.7.4",
"@playwright/test": "^1.48.0"
```

workers/api + workers/cross-model devDependencies:
```json
"@cloudflare/vitest-pool-workers": "^0.5.21",
"@cloudflare/workers-types": "^4.20240925.0",
"vitest": "^2.1.3"
```

## Vitest workspace (`vitest.workspace.ts`)

```ts
import { defineWorkspace } from "vitest/config";
export default defineWorkspace([
  "packages/shared",
  "apps/web",
  "workers/api",
  "workers/cross-model",
]);
```

## Worker Vitest config (`workers/api/vitest.config.ts`)

```ts
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
export default defineWorkersConfig({
  test: {
    include: ["src/**/*.test.ts"],
    pool: "@cloudflare/vitest-pool-workers",
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          compatibilityDate: "2026-04-21",
          compatibilityFlags: ["nodejs_compat"],
          bindings: { LENS_SEARCH_MODE: "fixture" },
        },
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      thresholds: { branches: 80, functions: 80, lines: 80, statements: 80 },
    },
  },
});
```

## Packages/shared Vitest config

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    coverage: { provider: "v8", thresholds: { branches: 80, functions: 80, lines: 80 } },
  },
});
```

## apps/web Vitest config

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "happy-dom",
  },
});
```

## apps/web Playwright config

```ts
import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.LENS_WEB_URL ?? "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.CI ? undefined : {
    command: "npm run dev",
    port: 5173,
    reuseExistingServer: true,
  },
});
```

## apps/extension Playwright config (persistent-context for MV3)

```ts
import { defineConfig } from "@playwright/test";
import path from "path";
export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    launchOptions: {
      args: [
        `--disable-extensions-except=${path.resolve(__dirname, "dist")}`,
        `--load-extension=${path.resolve(__dirname, "dist")}`,
      ],
    },
  },
  projects: [{ name: "chromium-mv3" }],
});
```

## First test files

### `workers/api/src/review-scan.test.ts`

Ships a passing suite for the already-live review-authenticity scanner.

Must cover:
- Clean reviews → `authenticityScore ≥ 0.8`, empty `signalsFound`.
- Burst (all reviews within 24h) → `temporal-clustering` signal.
- Template-heavy (all contain "I love this product", "highly recommend") → `template-phrasing` signal.
- 100% five-star → `rating-skew` signal.
- High bigram overlap → `language-homogeneity` signal.
- Length-homogeneous → `length-homogeneity` signal.
- Empty list → Zod rejects.
- 501 reviews → Zod rejects.
- No ratings → `fiveStarSharePct = 0`.
- Result schema shape.

Total: ~12 test cases.

### `workers/api/src/rank.test.ts`

Deterministic ranker tests:
- Rank candidates with `higher_is_better` criterion → top has max value.
- `lower_is_better` inversion.
- `target` criterion with specific numeric target.
- `binary` criterion with boolean spec.
- Weight normalization (weights sum > 1 → renormalized).
- Alias resolution (`build_quality` → `build_score`).
- Tie-break stability (equal utilities preserve original order).
- No criteria in intent → defaults to `overall_quality`.
- Mixed-type specs (string + number) → numeric candidates preferred.

Total: ~9 cases.

### `workers/api/src/packs/registry.test.ts`

- Registry builds without errors.
- `findCategoryPack("espresso machine")` returns the espresso pack.
- `findCategoryPack("blah-blah")` returns null.
- `getRegulationsForJurisdiction("us-federal")` only returns `in-force` regulations.
- `getDarkPatternsForPageType("checkout")` returns the relevant subset.
- `packStats()` counts match file system.

Total: ~6 cases.

### `packages/shared/src/schemas.test.ts`

- AuditInputSchema `text` variant valid.
- AuditInputSchema `image` requires base64.
- AuditInputSchema `query` requires userPrompt.
- AuditInputSchema `url` rejects non-http strings.
- UserIntentSchema rejects weight > 1.
- CriterionSchema enum direction enforced.

Total: ~8 cases.

### `workers/cross-model/src/index.test.ts`

Miniflare-hosted. Mocks provider fetch via `vi.fn` on `globalThis.fetch`.
- `/fanout` with all keys → returns 3 results + synthesis.
- `/fanout` with only OPENAI_API_KEY → returns 1 result.
- `/fanout` with no keys → synthesis contains "No cross-model results".
- Provider HTTP 500 → excluded from results, other providers still succeed.
- Synthesis call failure → returns `synthesis-failed: ...`.

Total: ~5 cases.

### `apps/web/tests/e2e/smoke.spec.ts`

```ts
import { test, expect } from "@playwright/test";
test("loads dashboard and shows pack stats", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Your independent AI shopping agent/ })).toBeVisible();
  await expect(page.getByText(/knowledge packs/)).toBeVisible({ timeout: 15_000 });
});
```

### `apps/web/tests/e2e/audit-query.spec.ts`

```ts
test("query mode audit returns a spec-optimal pick", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /I want to buy something/ }).click();
  await page.getByLabel(/shopping for/).fill("espresso machine under $400, pressure matters most");
  await page.getByRole("button", { name: /Find the spec-optimal pick/ }).click();
  await expect(page.getByText(/Lens's top pick/)).toBeVisible({ timeout: 40_000 });
});
```

### `apps/extension/tests/e2e/smoke.spec.ts`

Uses Playwright persistent context with MV3 extension loaded. Opens chatgpt.com, checks sidebar injection (post-F6) or content-script console logs (pre-F6).

## Root `package.json` script additions

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "test:workers": "vitest run --project workers/api --project workers/cross-model",
  "test:shared": "vitest run --project packages/shared",
  "test:web": "vitest run --project apps/web",
  "test:e2e:web": "playwright test -c apps/web/playwright.config.ts",
  "test:e2e:ext": "playwright test -c apps/extension/playwright.config.ts",
  "test:coverage": "vitest run --coverage",
  "test:ci": "npm run test:coverage && npm run test:e2e:web"
}
```

## CI update (`.github/workflows/ci.yml`)

Add a `test` job alongside the existing `typecheck`:

```yaml
test:
  runs-on: ubuntu-latest
  needs: typecheck
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: 20, cache: npm }
    - run: npm ci
    - run: npx playwright install --with-deps chromium
    - run: npm run test:coverage
    - run: npm run test:e2e:web
      env: { LENS_WEB_URL: "https://lens-b1h.pages.dev" }
    - uses: actions/upload-artifact@v4
      if: always()
      with:
        name: coverage-report
        path: coverage/
```

## Acceptance criteria

- [x] Block file written (this file).
- [ ] Root `package.json` scripts added.
- [ ] `vitest.workspace.ts` written.
- [ ] Per-workspace vitest configs written.
- [ ] `apps/web/playwright.config.ts` + `apps/extension/playwright.config.ts` written.
- [ ] devDeps installed (`npm install`).
- [ ] First test files written: `review-scan.test.ts`, `rank.test.ts`, `packs/registry.test.ts`, `schemas.test.ts`, at least `smoke.spec.ts`.
- [ ] `npm run test:shared` passes.
- [ ] `npm run test:workers` passes.
- [ ] `npm run test:web` passes (unit, if any).
- [ ] Playwright smoke passes against live deployed URL (`LENS_WEB_URL=https://lens-b1h.pages.dev`).
- [ ] CI green on push (test job passes).
- [ ] Coverage ≥ 80% on tested files.
- [ ] Commit `lens(F20): testing infra — vitest + playwright + CI`.

## Implementation checklist (sequential)

1. [ ] Update root `package.json` with scripts + devDependencies.
2. [ ] Add `vitest.workspace.ts`.
3. [ ] Add `workers/api/vitest.config.ts` + `tsconfig.test.json`.
4. [ ] Add `workers/api/src/test-utils/{fake-anthropic.ts,fixtures.ts,make-env.ts}`.
5. [ ] Add `workers/cross-model/vitest.config.ts`.
6. [ ] Add `packages/shared/vitest.config.ts`.
7. [ ] Add `apps/web/vitest.config.ts`.
8. [ ] Add `apps/web/playwright.config.ts` + empty `tests/e2e/` dir.
9. [ ] Add `apps/extension/playwright.config.ts` + empty `tests/e2e/` dir.
10. [ ] Per-workspace `package.json` devDeps additions.
11. [ ] `npm install` at root.
12. [ ] Write `workers/api/src/review-scan.test.ts`.
13. [ ] Write `workers/api/src/rank.test.ts`.
14. [ ] Write `workers/api/src/packs/registry.test.ts`.
15. [ ] Write `packages/shared/src/schemas.test.ts`.
16. [ ] Write `workers/cross-model/src/index.test.ts`.
17. [ ] Write `apps/web/tests/e2e/smoke.spec.ts`.
18. [ ] Write `apps/web/tests/e2e/audit-query.spec.ts`.
19. [ ] Write `apps/extension/tests/e2e/smoke.spec.ts`.
20. [ ] Run `npm test` — debug until green.
21. [ ] Run `npx playwright install --with-deps chromium` + `npm run test:e2e:web` — debug until green.
22. [ ] Update `.github/workflows/ci.yml` with test + e2e jobs.
23. [ ] Commit + push.
24. [ ] Mark CHECKLIST.md F20 ✅ with commit hash.

## Rollback

If `@cloudflare/vitest-pool-workers` fails to install or configure on Windows:
- Fall back to `pool: "threads"` with a Node environment + hand-rolled fake `D1Database`/`KVNamespace` factories.
- Extension tests: skip Playwright MV3 for now; revisit after F6 when sidebar DOM exists to test.

## Notes

- Vitest with `pool: "@cloudflare/vitest-pool-workers"` is supported only on Vitest 2.x, not 3.x. Pin to `^2.1.3`.
- Playwright MV3 requires persistent context (not `browser.newContext`). Use `chromium.launchPersistentContext()` in the config.
- On Windows, Playwright may require `npx playwright install --with-deps chromium` at first run. Document in README.
- `@vitest/coverage-v8` is faster than Istanbul; use it unless we need Istanbul-specific reporting.
