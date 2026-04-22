import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { handleScamAssess } from "./handler.js";

function buildApp() {
  const app = new Hono<{ Bindings: Record<string, unknown> }>();
  app.post("/scam/assess", (c) => handleScamAssess(c as never));
  return app;
}

describe("POST /scam/assess", () => {
  it("400 on invalid body", async () => {
    const r = await buildApp().request(
      "/scam/assess",
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      {},
    );
    expect(r.status).toBe(400);
  });

  it("typosquat host → scam verdict", async () => {
    const r = await buildApp().request(
      "/scam/assess",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ host: "amaz0n-deals.com", receivedViaHttps: true }),
      },
      {},
    );
    const body = (await r.json()) as { verdict: string; typosquat?: { nearestBrand: string } };
    expect(body.verdict).toBe("scam");
    expect(body.typosquat?.nearestBrand).toBe("amazon");
  });

  it("verified retailer → safe verdict", async () => {
    const r = await buildApp().request(
      "/scam/assess",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ host: "target.com", receivedViaHttps: true }),
      },
      {},
    );
    const body = (await r.json()) as { verdict: string };
    expect(body.verdict).toBe("safe");
  });
});
