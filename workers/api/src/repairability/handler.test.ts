import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { handleRepairabilityLookup } from "./handler.js";

function app() {
  const h = new Hono();
  h.post("/repairability/lookup", (c) => handleRepairabilityLookup(c as never));
  return h;
}

describe("POST /repairability/lookup", () => {
  it("400 on invalid body", async () => {
    const res = await app().request("/repairability/lookup", { method: "POST", body: JSON.stringify({}), headers: { "content-type": "application/json" } });
    expect(res.status).toBe(400);
  });

  it("returns fixture source + score for iPhone 15 Pro", async () => {
    const res = await app().request("/repairability/lookup", {
      method: "POST",
      body: JSON.stringify({ productName: "iPhone 15 Pro", brand: "Apple" }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { source: string; score: number; band: string };
    expect(body.source).toBe("fixture");
    expect(body.score).toBe(4);
    expect(body.band).toBe("hard");
  });

  it("returns source=none with reason for unknown product", async () => {
    const res = await app().request("/repairability/lookup", {
      method: "POST",
      body: JSON.stringify({ productName: "CompletelyMadeUpItem 9000", brand: "NoBrand" }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { source: string; band: string; reason?: string; score?: number };
    expect(body.source).toBe("none");
    expect(body.band).toBe("no-info");
    expect(body.reason).toBeTruthy();
    expect(body.score).toBeUndefined();
  });

  it("strips tracking params from every citation URL", async () => {
    // Use a fixture whose citation URL is canonical — we'll piggyback on the
    // scrubber's guarantee by injecting a tracked URL via a test-only fixture
    // later. For now, confirm the live fixture paths produce clean URLs.
    const res = await app().request("/repairability/lookup", {
      method: "POST",
      body: JSON.stringify({ productName: "Framework Laptop 13", brand: "Framework" }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { citations: Array<{ url: string }> };
    expect(body.citations.length).toBeGreaterThan(0);
    for (const c of body.citations) {
      expect(c.url).not.toMatch(/[?&](tag|ref|utm_|gclid|fbclid)=/i);
      expect(c.url).not.toMatch(/#/);
    }
  });

  it("returns easy band for Framework Laptop 13 (10/10)", async () => {
    const res = await app().request("/repairability/lookup", {
      method: "POST",
      body: JSON.stringify({ productName: "Framework Laptop 13", brand: "Framework" }),
      headers: { "content-type": "application/json" },
    });
    const body = (await res.json()) as { score: number; band: string };
    expect(body.score).toBe(10);
    expect(body.band).toBe("easy");
  });

  it("returns unrepairable for AirPods Pro (1/10)", async () => {
    const res = await app().request("/repairability/lookup", {
      method: "POST",
      body: JSON.stringify({ productName: "AirPods Pro 2", brand: "Apple" }),
      headers: { "content-type": "application/json" },
    });
    const body = (await res.json()) as { score: number; band: string };
    expect(body.score).toBe(1);
    expect(body.band).toBe("unrepairable");
  });

  it("echoes category + brand in response", async () => {
    const res = await app().request("/repairability/lookup", {
      method: "POST",
      body: JSON.stringify({ productName: "iPhone 15 Pro", brand: "Apple", category: "smartphone" }),
      headers: { "content-type": "application/json" },
    });
    const body = (await res.json()) as { brand: string; category: string };
    expect(body.brand).toBe("Apple");
    expect(body.category).toBe("smartphone");
  });
});
