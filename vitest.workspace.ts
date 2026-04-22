import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/shared",
  "apps/web",
  "workers/api",
  "workers/cross-model",
]);
