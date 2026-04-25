import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { PackRegistry } from "@lens/shared";
import { analyzeDarkPatternPage, handlePassiveScanProbe } from "./probe.js";

const registry: PackRegistry = {
  all: [],
  bySlug: new Map(),
  categoriesByAlias: new Map(),
  darkPatternsByPageType: new Map(),
  regulationsByJurisdiction: new Map(),
  feesByCategoryContext: new Map(),
  interventionsByTrigger: new Map(),
};

function app() {
  const a = new Hono<{ Bindings: Record<string, unknown>; Variables: { userId?: string; anonUserId?: string } }>();
  a.post("/passive-scan/probe", (c) => handlePassiveScanProbe(c as never, registry));
  return a;
}

describe("passive scan URL probe", () => {
  it("derives Stage-1 hits from lodging page text", () => {
    const out = analyzeDarkPatternPage("https://www.marriott.com/booking/confirm", {
      text: "Room subtotal $249.00. Destination amenity fee $49.00/night. Total due now $298 before taxes. Only 1 room left.",
      fetchedVia: "provided-text",
      bytes: 110,
    });

    expect(out.host).toBe("marriott.com");
    expect(out.pageType).toBe("checkout");
    expect(out.hits.map((h) => h.packSlug)).toContain("dark-pattern/hidden-costs");
    expect(out.hits.map((h) => h.packSlug)).toContain("dark-pattern/fake-scarcity");
    expect(out.hits[0]?.excerpt).toContain("Destination amenity fee");
  });

  it("rejects local/private URLs before server-side fetch", async () => {
    const res = await app().request(
      "/passive-scan/probe",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "http://127.0.0.1:8787/secret" }),
      },
      {},
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "url_not_allowed" });
  });

  it("fetches a public URL, redacts page text, and runs passive-scan verification", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        "<html><body><p>Subtotal $249. Destination amenity fee $49/night. Total $298.</p></body></html>",
        { status: 200, headers: { "content-type": "text/html" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await app().request(
      "/passive-scan/probe",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "https://www.booking.example/checkout" }),
      },
      {},
    );
    const body = (await res.json()) as {
      ok: boolean;
      fetched: Record<string, unknown>;
      hits: Array<{ packSlug: string }>;
      scan: { ran: string; confirmed: unknown[] };
    };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.fetched.text).toBeUndefined();
    expect(body.hits.map((h) => h.packSlug)).toContain("dark-pattern/hidden-costs");
    expect(body.scan.ran).toBe("heuristic-only");
    expect(body.scan.confirmed).toHaveLength(body.hits.length);
  });

  it("crawls a bounded same-site shopping journey before verification", async () => {
    const filler = "Choose dates and review available rooms. ".repeat(30);
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/checkout")) {
        return Promise.resolve(
          new Response(
            "<html><title>Checkout</title><body><p>Room subtotal $249. Destination amenity fee $49/night. Total due at property.</p></body></html>",
            { status: 200, headers: { "content-type": "text/html" } },
          ),
        );
      }
      return Promise.resolve(
        new Response(
          `<html><title>Rooms</title><body>${filler}<a href="/checkout">Reserve now</a><a href="https://tracker.example/cart">external</a></body></html>`,
          { status: 200, headers: { "content-type": "text/html" } },
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await app().request(
      "/passive-scan/probe",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "https://www.booking.example/rooms", maxPages: 4 }),
      },
      {},
    );
    const body = (await res.json()) as {
      ok: boolean;
      journey: { mode: string; scannedPages: number; pagesWithHits: number; stagesSeen: string[] };
      pages: Array<{ url: string; fetched: { text?: string; links?: string[] } }>;
      hits: Array<{ packSlug: string; excerpt: string }>;
    };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.journey.mode).toBe("bounded-same-site-crawl");
    expect(body.journey.scannedPages).toBeGreaterThanOrEqual(2);
    expect(body.journey.pagesWithHits).toBeGreaterThanOrEqual(1);
    expect(body.hits.map((h) => h.packSlug)).toContain("dark-pattern/hidden-costs");
    expect(body.hits.some((h) => h.excerpt.startsWith("[checkout]"))).toBe(true);
    expect(body.pages.some((p) => p.fetched.text !== undefined)).toBe(false);
  });

  it("accepts extension-supplied multi-page captures without server-side browsing", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("server fetch should not run for supplied captures");
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await app().request(
      "/passive-scan/probe",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: "https://shop.example/product/widget",
          pageText: "Product page. Widget base price $29.",
          journeyPages: [
            {
              url: "https://shop.example/cart",
              pageText: "Cart subtotal $29. Protection plan added with your order.",
            },
            {
              url: "https://shop.example/checkout",
              html: "<main><p>Free trial starts today and automatically renews unless canceled.</p><p>Create an account to checkout.</p></main>",
            },
          ],
        }),
      },
      {},
    );
    const body = (await res.json()) as {
      ok: boolean;
      journey: { mode: string; scannedPages: number; stagesSeen: string[] };
      hits: Array<{ packSlug: string }>;
    };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.journey.mode).toBe("extension-captures");
    expect(body.journey.scannedPages).toBe(3);
    expect(body.hits.map((h) => h.packSlug)).toContain("dark-pattern/sneak-into-basket");
    expect(body.hits.map((h) => h.packSlug)).toContain("dark-pattern/forced-continuity");
    expect(body.hits.map((h) => h.packSlug)).toContain("dark-pattern/forced-registration");
  });

  it("rejects extension journey captures outside the seed site", async () => {
    const res = await app().request(
      "/passive-scan/probe",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: "https://shop.example/product/widget",
          pageText: "Product page.",
          journeyPages: [{ url: "https://evil.example/checkout", pageText: "fee" }],
        }),
      },
      {},
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "journey_url_not_allowed" });
  });

  // Regression: ultrareview bug_008 — IPv6 SSRF guard bypass.
  it.each([
    "http://[::1]/internal",
    "http://[::ffff:127.0.0.1]/admin",
    "http://[::ffff:7f00:1]/admin",
    "http://[fc00::1]/internal",
    "http://[fd12:3456:789a::1]/internal",
    "http://[fe80::1]/link-local",
  ])("rejects IPv6 private/loopback host %s", async (url) => {
    const res = await app().request(
      "/passive-scan/probe",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      },
      {},
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "url_not_allowed" });
  });

  // Regression: ultrareview bug_019 — checkout pages contain "your cart" / "view cart"
  // in their visible text, which used to flip pageType to "cart".
  it("classifies checkout-path URLs containing the word 'cart' in body text as checkout", () => {
    const out = analyzeDarkPatternPage("https://shop.example/checkout/payment", {
      text: "Review your cart and confirm payment. Items in cart: 3. Subtotal $129. Destination amenity fee $9.",
      fetchedVia: "provided-text",
      bytes: 100,
    });
    expect(out.pageType).toBe("checkout");
  });
});
