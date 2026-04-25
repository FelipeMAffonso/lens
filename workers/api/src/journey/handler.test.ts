import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import type { CustomerJourneyMap } from "@lens/shared";
import { CustomerJourneyMapSchema } from "@lens/shared";
import { handleCustomerJourneyMap } from "./handler.js";

function buildApp() {
  const app = new Hono<{ Bindings: Record<string, unknown> }>();
  app.get("/architecture/journey", (c) => handleCustomerJourneyMap(c as never));
  return app;
}

describe("GET /architecture/journey", () => {
  it("returns a valid public journey map without requiring D1", async () => {
    const res = await buildApp().request("/architecture/journey", {}, {});
    const body = (await res.json()) as CustomerJourneyMap;

    expect(res.status).toBe(200);
    expect(CustomerJourneyMapSchema.safeParse(body).success).toBe(true);
    expect(body.readiness.score).toBeGreaterThan(0.8);
    expect(body.stages.some((s) => s.id === "cart_checkout")).toBe(true);
  });
});
