import { describe, expect, it } from "vitest";
import { fetchKeepaSeries, normalizeKeepaResponse } from "./keepa.js";

describe("normalizeKeepaResponse", () => {
  it("parses a canonical Keepa product csv[0] series", () => {
    // Keepa stores pairs (keepaMinute, priceInCents). -1 = no data.
    // Keepa epoch = 2011-01-01. minutes = (ms - keepaEpoch) / 60_000.
    const keepaEpoch = Date.UTC(2011, 0, 1) / 60_000; // convert ms→min
    const d1 = new Date(Date.UTC(2026, 3, 20));
    const d2 = new Date(Date.UTC(2026, 3, 21));
    const m1 = Math.floor(d1.getTime() / 60_000 - keepaEpoch);
    const m2 = Math.floor(d2.getTime() / 60_000 - keepaEpoch);
    const body = {
      products: [
        {
          csv: [[m1, 25000, m2, 22999]],
        },
      ],
    };
    const r = normalizeKeepaResponse(body);
    expect(r).not.toBeNull();
    expect(r!.length).toBe(2);
    // Newest first
    expect(r![0]!.date).toBe("2026-04-21");
    expect(r![0]!.price).toBe(229.99);
    expect(r![1]!.date).toBe("2026-04-20");
  });

  it("drops -1 sentinel values", () => {
    const keepaEpoch = Date.UTC(2011, 0, 1) / 60_000;
    const d = new Date(Date.UTC(2026, 3, 20));
    const m = Math.floor(d.getTime() / 60_000 - keepaEpoch);
    const body = {
      products: [
        { csv: [[m, -1, m + 1440, 19999]] },
      ],
    };
    const r = normalizeKeepaResponse(body);
    expect(r).not.toBeNull();
    expect(r!.length).toBe(1);
    expect(r![0]!.price).toBe(199.99);
  });

  it("returns null on malformed body", () => {
    expect(normalizeKeepaResponse(null)).toBeNull();
    expect(normalizeKeepaResponse({})).toBeNull();
    expect(normalizeKeepaResponse({ products: [] })).toBeNull();
    expect(normalizeKeepaResponse({ products: [{}] })).toBeNull();
  });
});

describe("fetchKeepaSeries", () => {
  it("refuses a non-Amazon-ASIN", async () => {
    const r = await fetchKeepaSeries("not-an-asin", { apiKey: "k" });
    expect(r).toBeNull();
  });

  it("refuses when apiKey empty", async () => {
    const r = await fetchKeepaSeries("B07DKZ9GHB", { apiKey: "" });
    expect(r).toBeNull();
  });

  it("returns null on HTTP error", async () => {
    const r = await fetchKeepaSeries("B07DKZ9GHB", {
      apiKey: "k",
      fetch: (_u: unknown, _i?: unknown) =>
        Promise.resolve(new Response("x", { status: 500 })) as never,
    });
    expect(r).toBeNull();
  });

  it("returns series on happy path", async () => {
    const keepaEpoch = Date.UTC(2011, 0, 1) / 60_000;
    const m = Math.floor(Date.UTC(2026, 3, 21) / 60_000 - keepaEpoch);
    const r = await fetchKeepaSeries("B07DKZ9GHB", {
      apiKey: "k",
      fetch: (_u: unknown, _i?: unknown) =>
        Promise.resolve(
          new Response(
            JSON.stringify({ products: [{ csv: [[m, 19999]] }] }),
            { status: 200 },
          ),
        ) as never,
    });
    expect(r).not.toBeNull();
    expect(r!.length).toBe(1);
    expect(r![0]!.price).toBe(199.99);
  });
});
