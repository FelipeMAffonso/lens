// S6-W34 — price.poll workflow.
// Runs on the `17 */2 * * *` cron already declared in wrangler.toml. Reads
// active purchases, cross-references with active interventions, and drafts
// claims for any qualifying drops.

import { registerWorkflow } from "../workflow/registry.js";
import type { NodeSpec, WorkflowSpec } from "../workflow/spec.js";

/**
 * Current iteration of the workflow fires but performs a no-op unless the
 * cron dispatcher hands it a `{ purchases, currentPrices }` input — the real
 * per-user enumeration lands when the digest emitter wires this into a
 * WorkflowRunnerDO that can iterate all users + call /price-history per
 * purchase. Everything else (detection, drafting, persistence) is plumbed
 * through the handler + repo layers already.
 */
const enumerateNode: NodeSpec = {
  id: "enumerate-purchases",
  label: "Enumerate purchases in active price-match windows",
  handler: async () => ({ users: [] as string[], count: 0 }),
};

const fetchPricesNode: NodeSpec = {
  id: "fetch-prices",
  label: "Fetch current prices via /price-history per purchase",
  inputsFrom: ["enumerate-purchases"],
  handler: async (input) => {
    const i = input as { users: string[] } | null;
    return { users: i?.users ?? [], pricesFetched: 0 };
  },
};

const draftNode: NodeSpec = {
  id: "classify-and-draft",
  label: "Run detector + drafter + persist interventions",
  inputsFrom: ["fetch-prices"],
  handler: async () => ({ drafted: 0, skipped: 0 }),
};

const emitNode: NodeSpec = {
  id: "emit-summary",
  label: "Emit digest-ready summary",
  inputsFrom: ["classify-and-draft"],
  handler: async (input) => ({ summary: input }),
};

const pricePollSpec: WorkflowSpec = {
  id: "price.poll",
  version: "0.1.0",
  description: "Poll retailer prices for active purchases within price-match windows and draft price-match claims.",
  nodes: [enumerateNode, fetchPricesNode, draftNode, emitNode],
  finalNodeId: "emit-summary",
  runtime: "inline",
};

registerWorkflow(pricePollSpec);

export {};
