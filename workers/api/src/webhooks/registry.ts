// F5 — webhook registry. External services can POST /webhook/:id with a JSON
// payload; the registry maps each webhook to a workflow or a direct handler.

export type WebhookHandler = {
  id: string;
  description: string;
  /**
   * Either a registered workflow ID to run with the payload as input, or a
   * direct handler function.
   */
  workflowId?: string;
  direct?: (payload: unknown) => Promise<unknown>;
};

export const WEBHOOKS: WebhookHandler[] = [
  {
    id: "recall-notify",
    description: "External recall feed pushes a recall event. Triggers cross-reference with purchases.",
    workflowId: "recall.watch",
  },
  {
    id: "price-changed",
    description: "Price tracker pushes a price change. Triggers price-drop-watch workflow.",
    workflowId: "price.poll",
  },
  {
    id: "review-flagged",
    description: "External review-authenticity service flags a review set.",
    direct: async (payload) => ({ ok: true, received: payload }),
  },
  {
    id: "pack-update",
    description: "Pack-maintenance agent pushes a new pack version for review.",
    direct: async (payload) => ({ ok: true, received: payload }),
  },
];

export function findWebhook(id: string): WebhookHandler | undefined {
  return WEBHOOKS.find((w) => w.id === id);
}

export function listWebhooks(): Array<{ id: string; description: string; type: "workflow" | "direct" }> {
  return WEBHOOKS.map((w) => ({
    id: w.id,
    description: w.description,
    type: w.workflowId ? "workflow" : "direct",
  }));
}
