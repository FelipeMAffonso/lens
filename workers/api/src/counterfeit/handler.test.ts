import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { handleCounterfeitCheck } from "./handler.js";

function buildApp() {
  const app = new Hono<{ Bindings: Record<string, unknown> }>();
  app.post("/counterfeit/check", (c) => handleCounterfeitCheck(c as never));
  return app;
}

describe("POST /counterfeit/check", () => {
  it("400 on invalid body", async () => {
    const r = await buildApp().request(
      "/counterfeit/check",
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      {},
    );
    expect(r.status).toBe(400);
  });

  it("returns likely-counterfeit on the demo-bambino scenario", async () => {
    const r = await buildApp().request(
      "/counterfeit/check",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          host: "amazon.com",
          sellerAgeDays: 42,
          feedbackCount: 8,
          feedbackDistribution: { star1: 3, star2: 0, star3: 0, star4: 0, star5: 10 },
          price: 99,
          category: "espresso machines",
        }),
      },
      {},
    );
    expect(r.status).toBe(200);
    const body = (await r.json()) as { verdict: string; riskScore: number };
    expect(body.verdict).toBe("likely-counterfeit");
    expect(body.riskScore).toBeGreaterThanOrEqual(50);
  });

  it("returns authentic on established-seller payload", async () => {
    const r = await buildApp().request(
      "/counterfeit/check",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          host: "amazon.com",
          sellerAgeDays: 2000,
          feedbackCount: 50000,
          feedbackDistribution: { star1: 2000, star2: 1000, star3: 2000, star4: 10000, star5: 35000 },
          price: 500,
          category: "espresso machines",
        }),
      },
      {},
    );
    const body = (await r.json()) as { verdict: string };
    expect(body.verdict).toBe("authentic");
  });
});
