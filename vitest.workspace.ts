import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/shared",
  "packages/sdk",
  "apps/web",
  "apps/extension",
  "workers/api",
  "workers/cross-model",
  "workers/mcp",
]);
