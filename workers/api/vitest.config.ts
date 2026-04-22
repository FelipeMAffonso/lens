import { defineConfig } from "vitest/config";

// NOTE: full Cloudflare workers pool config (via @cloudflare/vitest-pool-workers)
// lands when F2 (persistence) adds the D1/KV/R2 bindings. For the initial pass we
// run worker src as plain Node ESM — the modules under test are all
// framework-agnostic (zod validation, deterministic scoring, pack registry
// building from plain JSON), so Node is enough to exercise them.
export default defineConfig({
  test: {
    name: "@lens/api",
    include: ["src/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/index.ts",
        "src/anthropic.ts",
        "src/extract.ts",
        "src/search.ts",
        "src/verify.ts",
        "src/crossModel.ts",
        "src/pipeline.ts",
        "src/packs/all.generated.ts",
      ],
    },
  },
});
