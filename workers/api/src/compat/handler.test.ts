import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { handleCompatCheck, handleCompatInfo } from "./handler.js";

function buildApp() {
  const app = new Hono<{ Bindings: Record<string, unknown> }>();
  app.post("/compat/check", (c) => handleCompatCheck(c as never));
  app.get("/compat/info", (c) => handleCompatInfo(c as never));
  return app;
}

describe("POST /compat/check", () => {
  it("400 on invalid body", async () => {
    const r = await buildApp().request(
      "/compat/check",
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      {},
    );
    expect(r.status).toBe(400);
  });

  it("200 + incompatible verdict on the MBP SSD acceptance case", async () => {
    const r = await buildApp().request(
      "/compat/check",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          target: { category: "ssd", name: "Samsung 990 Pro M.2 2280 NVMe" },
          equipment: [{ category: "laptops", name: "2015 MacBook Pro 13-inch Retina" }],
        }),
      },
      {},
    );
    expect(r.status).toBe(200);
    const body = (await r.json()) as { overall: string; rules: Array<{ id: string }> };
    expect(body.overall).toBe("incompatible");
    expect(body.rules.some((x) => x.id === "mbp-proprietary-blade")).toBe(true);
  });
});

describe("GET /compat/info", () => {
  it("returns the shipping rule count", async () => {
    const r = await buildApp().request("/compat/info", {}, {});
    const body = (await r.json()) as { rules: number };
    expect(body.rules).toBeGreaterThanOrEqual(10);
  });
});
