import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/shared",
  "apps/web",
  "apps/extension",
  "workers/api",
  "workers/cross-model",
  "workers/mcp",
]);
