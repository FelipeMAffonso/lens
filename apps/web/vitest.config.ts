import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@lens/web",
    include: ["src/**/*.test.ts"],
    environment: "happy-dom",
  },
});
