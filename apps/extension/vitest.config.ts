import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@lens/extension",
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/tests/e2e/**"],
    environment: "happy-dom",
  },
});
