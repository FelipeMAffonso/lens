import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@lens/cross-model",
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
