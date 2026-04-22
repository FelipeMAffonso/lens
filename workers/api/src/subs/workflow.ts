// S0-W5 — workflow skeleton registered with the engine.
// Real Gmail polling lands when F12 OAuth credentials land; this file just
// wires the workflow node graph so the cron dispatcher can route to it.

import { registerWorkflow } from "../workflow/registry.js";
import type { NodeSpec, WorkflowSpec } from "../workflow/spec.js";

/**
 * `subs.discover` workflow — stub.
 *
 *   poll-inbox  →  classify-and-upsert  →  emit-summary
 *
 * Until credentials are available, poll-inbox returns an empty message list,
 * classify-and-upsert is a no-op, and emit-summary surfaces a zero count.
 * Enabling real polling is a one-line change on poll-inbox.
 */
const pollNode: NodeSpec = {
  id: "poll-inbox",
  label: "Poll Gmail inbox for receipts",
  handler: async () => ({ messages: [] as unknown[], credentialsAvailable: false }),
};

const classifyNode: NodeSpec = {
  id: "classify-and-upsert",
  label: "Classify Gmail messages + upsert subscriptions",
  inputsFrom: ["poll-inbox"],
  handler: async (input) => {
    const i = input as { messages?: unknown[] } | null;
    return { matched: 0, unmatched: 0, scanned: i?.messages?.length ?? 0 };
  },
};

const emitNode: NodeSpec = {
  id: "emit-summary",
  label: "Emit run summary for digest",
  inputsFrom: ["classify-and-upsert"],
  handler: async (input) => ({ summary: input }),
};

const subsDiscoverSpec: WorkflowSpec = {
  id: "subs.discover",
  version: "0.1.0",
  description: "Scan a user's Gmail inbox for subscription receipts and upsert the subscriptions table.",
  nodes: [pollNode, classifyNode, emitNode],
  finalNodeId: "emit-summary",
  runtime: "inline",
};

registerWorkflow(subsDiscoverSpec);

export {};
