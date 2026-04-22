import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { handleCheckoutSummary } from "./handler.js";

function buildApp() {
  const app = new Hono<{ Bindings: Record<string, unknown> }>();
  app.post("/checkout/summary", (c) => handleCheckoutSummary(c as never));
  return app;
}

describe("POST /checkout/summary", () => {
  it("400 on invalid body", async () => {
    const r = await buildApp().request(
      "/checkout/summary",
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      {},
    );
    expect(r.status).toBe(400);
  });

  it("empty signals → proceed", async () => {
    const r = await buildApp().request(
      "/checkout/summary",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ host: "x.com", signals: {} }),
      },
      {},
    );
    expect(r.status).toBe(200);
    const body = (await r.json()) as { verdict: string; score: number };
    expect(body.verdict).toBe("proceed");
    expect(body.score).toBe(100);
  });

  it("Marriott checkout scenario returns a shaped verdict", async () => {
    const r = await buildApp().request(
      "/checkout/summary",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          host: "marriott.com",
          productName: "Marriott Vacation booking",
          signals: {
            passiveScan: { confirmedCount: 1, topPattern: "hidden-costs" },
            breachHistory: { score: 15, band: "low" },
            totalCost: { upfront: 298, year1: 298, year3: 298 },
          },
        }),
      },
      {},
    );
    const body = (await r.json()) as {
      verdict: string;
      rationale: Array<{ signal: string }>;
      recommendation: string;
      signalCount: number;
    };
    expect(body.verdict).toBe("proceed"); // 1 warn-level pattern, no blocker, score 90
    expect(body.signalCount).toBe(3);
    expect(body.rationale.some((x) => x.signal === "passiveScan")).toBe(true);
    expect(body.recommendation.length).toBeGreaterThan(0);
  });

  it("Rethink-level composite", async () => {
    const r = await buildApp().request(
      "/checkout/summary",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          host: "sketchy.example.com",
          signals: {
            breachHistory: { score: 95, band: "critical", hasSsnExposure: true },
            compat: { overall: "incompatible", blockerCount: 3 },
            priceHistory: { verdict: "fake-sale", discountClaimed: 50, discountActual: 1 },
          },
        }),
      },
      {},
    );
    const body = (await r.json()) as { verdict: string; score: number };
    expect(body.verdict).toBe("rethink");
    expect(body.score).toBeLessThan(20);
  });
});
