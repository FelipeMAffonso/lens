import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@lens/mcp",
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
