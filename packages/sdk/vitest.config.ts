import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@lens/sdk",
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
