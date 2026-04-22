import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@lens/shared",
    include: ["src/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/index.ts"],
    },
  },
});
