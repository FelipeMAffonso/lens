import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { handleLockinCompute } from "./handler.js";

function app() {
  const h = new Hono();
  h.post("/lockin/compute", (c) => handleLockinCompute(c as never));
  return h;
}

describe("POST /lockin/compute", () => {
  it("400 on invalid body", async () => {
    const res = await app().request("/lockin/compute", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(400);
  });

  it("returns empty ecosystems + reason on no purchases", async () => {
    const res = await app().request("/lockin/compute", {
      method: "POST",
      body: JSON.stringify({ purchases: [] }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ecosystems: unknown[]; totalGross: number; reason?: string };
    expect(body.ecosystems).toHaveLength(0);
    expect(body.totalGross).toBe(0);
    expect(body.reason).toBeTruthy();
  });

  it("computes apple ecosystem for an iPhone purchase", async () => {
    const res = await app().request("/lockin/compute", {
      method: "POST",
      body: JSON.stringify({
        purchases: [{ productName: "iPhone 15 Pro", brand: "Apple", amountUsd: 999 }],
      }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ecosystems: Array<{ slug: string; gross: number }> };
    expect(body.ecosystems.some((e) => e.slug === "apple")).toBe(true);
    expect(body.ecosystems.find((e) => e.slug === "apple")!.gross).toBe(999);
  });

  it("rejects more than 500 purchases", async () => {
    const purchases = Array.from({ length: 501 }, () => ({ productName: "x", amountUsd: 1 }));
    const res = await app().request("/lockin/compute", {
      method: "POST",
      body: JSON.stringify({ purchases }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(400);
  });

  it("all citation URLs are scrubbed of tracking params", async () => {
    const res = await app().request("/lockin/compute", {
      method: "POST",
      body: JSON.stringify({
        purchases: [
          { productName: "iPhone 15 Pro", brand: "Apple", amountUsd: 999 },
          { productName: "Kindle Paperwhite", brand: "Amazon", amountUsd: 150 },
        ],
      }),
      headers: { "content-type": "application/json" },
    });
    const body = (await res.json()) as { ecosystems: Array<{ citations: Array<{ url: string }> }> };
    for (const e of body.ecosystems) {
      for (const c of e.citations) {
        expect(c.url).not.toMatch(/[?&](tag|ref|utm_|gclid|fbclid)=/i);
        expect(c.url).not.toMatch(/#/);
      }
    }
  });

  it("returns a multi-ecosystem audit with a mixed history", async () => {
    const res = await app().request("/lockin/compute", {
      method: "POST",
      body: JSON.stringify({
        purchases: [
          { productName: "iPhone 15 Pro", brand: "Apple", amountUsd: 999 },
          { productName: "Kindle Paperwhite", brand: "Amazon", amountUsd: 150 },
          { productName: "HP OfficeJet Pro 9015e", brand: "HP", amountUsd: 249 },
          { productName: "Tesla Model Y", brand: "Tesla", amountUsd: 48990 },
        ],
      }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ecosystems: Array<{ slug: string }>; totalSwitchingCost: number };
    const slugs = body.ecosystems.map((e) => e.slug);
    expect(slugs).toContain("apple");
    expect(slugs).toContain("amazon-prime");
    expect(slugs).toContain("hp-instant-ink");
    expect(slugs).toContain("tesla");
    expect(body.totalSwitchingCost).toBeGreaterThan(48990);
  });
});
