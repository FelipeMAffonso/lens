import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { handleTotalCost } from "./handler.js";

function buildApp() {
  const app = new Hono<{ Bindings: Record<string, unknown> }>();
  app.get("/total-cost", (c) => handleTotalCost(c as never));
  return app;
}

describe("GET /total-cost", () => {
  const origFetch = globalThis.fetch;

  it("400 on missing url", async () => {
    const r = await buildApp().request("/total-cost", {}, {});
    expect(r.status).toBe(400);
  });

  it("422 when url reachable but no price available (bare URL)", async () => {
    globalThis.fetch = vi.fn((_u: unknown, _i?: unknown) =>
      Promise.resolve(new Response("<html><body>no product here</body></html>", { status: 200 })),
    ) as unknown as typeof fetch;
    try {
      const r = await buildApp().request(
        `/total-cost?url=${encodeURIComponent("https://www.amazon.com/dp/B07DKZ9GHB")}`,
        {},
        {},
      );
      expect(r.status).toBe(422);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("honours overrideSticker when page fetch fails", async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error("net"))) as unknown as typeof fetch;
    try {
      const r = await buildApp().request(
        `/total-cost?url=${encodeURIComponent("https://www.amazon.com/dp/B07DKZ9GHB")}&overrideSticker=349.99&zip=94110`,
        {},
        {},
      );
      expect(r.status).toBe(200);
      const body = (await r.json()) as {
        sticker: number;
        tax: { rate: number; jurisdiction: string; source: string };
        shipping: { amount: number };
        totals: { upfront: number; year1: number; year3: number };
        notes: string[];
      };
      expect(body.sticker).toBe(349.99);
      expect(body.tax.jurisdiction).toBe("CA");
      expect(body.tax.source).toBe("zip");
      expect(body.shipping.amount).toBe(0); // amazon → prime
      // 349.99 + 349.99 * 0.0725 = 375.364275 → rounded to 375.36.
      expect(body.totals.upfront).toBe(375.36);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("espresso machine overrideSticker → pack's hiddenCosts surface", async () => {
    globalThis.fetch = vi.fn((_u: unknown, _i?: unknown) =>
      Promise.resolve(
        new Response(
          `<html><body>
             <h1 id="productTitle">Breville Bambino Espresso Machine</h1>
             <span class="a-price a-text-price"><span class="a-offscreen">$349.99</span></span>
           </body></html>`,
          { status: 200 },
        ),
      ),
    ) as unknown as typeof fetch;
    try {
      const r = await buildApp().request(
        `/total-cost?url=${encodeURIComponent("https://www.amazon.com/dp/B07DKZ9GHB")}&zip=94110`,
        {},
        {},
      );
      expect(r.status).toBe(200);
      const body = (await r.json()) as {
        product: { category?: string };
        hiddenCosts: Array<{ name: string; annualMid: number }>;
        totals: { year1: number; upfront: number };
        notes: string[];
      };
      expect(body.product.category).toContain("espresso");
      expect(body.hiddenCosts.length).toBeGreaterThan(0);
      expect(body.hiddenCosts.some((h) => /bean/i.test(h.name))).toBe(true);
      expect(body.totals.year1).toBeGreaterThan(body.totals.upfront);
      expect(body.notes.some((n) => /pack/.test(n))).toBe(true);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("returns empty hiddenCosts + explanatory note when no pack matches", async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error("net"))) as unknown as typeof fetch;
    try {
      const r = await buildApp().request(
        `/total-cost?url=${encodeURIComponent("https://example.com/p/obscure-widget")}&overrideSticker=50`,
        {},
        {},
      );
      const body = (await r.json()) as { hiddenCosts: unknown[]; notes: string[] };
      expect(body.hiddenCosts).toEqual([]);
      expect(body.notes.some((n) => /No category pack/.test(n))).toBe(true);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
