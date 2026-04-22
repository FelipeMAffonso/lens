import { describe, expect, it } from "vitest";
import { findWebhook, listWebhooks, WEBHOOKS } from "./registry.js";

describe("webhook registry", () => {
  it("ships 4 standard webhooks", () => {
    expect(WEBHOOKS.length).toBeGreaterThanOrEqual(4);
    const ids = WEBHOOKS.map((w) => w.id);
    expect(new Set(ids)).toEqual(
      new Set(["recall-notify", "price-changed", "review-flagged", "pack-update"]),
    );
  });

  it("findWebhook returns the registered entry", () => {
    const w = findWebhook("recall-notify");
    expect(w?.id).toBe("recall-notify");
    expect(w?.workflowId).toBe("recall.watch");
  });

  it("findWebhook returns undefined for unknown id", () => {
    expect(findWebhook("nope")).toBeUndefined();
  });

  it("listWebhooks reports correct type tags", () => {
    const list = listWebhooks();
    const recall = list.find((l) => l.id === "recall-notify");
    expect(recall?.type).toBe("workflow");
    const flagged = list.find((l) => l.id === "review-flagged");
    expect(flagged?.type).toBe("direct");
  });
});
