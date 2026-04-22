import { afterEach, describe, expect, it, vi } from "vitest";
import { callTool } from "./dispatch.js";

describe("callTool", () => {
  const origFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("rejects unknown tool with isError", async () => {
    const r = await callTool("lens.bogus", {}, { LENS_API_URL: "https://x" });
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toContain("unknown");
  });

  it("lens.pack_list proxies GET /packs/stats", async () => {
    const fetchMock = vi.fn((_u: unknown, _i?: unknown) =>
      Promise.resolve(new Response('{"totalPacks":116}', { status: 200 })),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const r = await callTool("lens.pack_list", {}, { LENS_API_URL: "https://x" });
    expect(r.isError).toBeUndefined();
    expect(fetchMock.mock.calls[0]![0]).toBe("https://x/packs/stats");
    expect(r.content[0]!.text).toContain("116");
  });

  it("lens.pack_get with missing slug returns error", async () => {
    const r = await callTool("lens.pack_get", {}, { LENS_API_URL: "https://x" });
    expect(r.isError).toBe(true);
  });

  it("lens.pack_get proxies GET /packs/:slug", async () => {
    const fetchMock = vi.fn((u: unknown, _i?: unknown) =>
      Promise.resolve(
        new Response(
          `{"slug":"${new URL(u as string).pathname.split("/").slice(-2).join("/")}"}`,
          { status: 200 },
        ),
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await callTool("lens.pack_get", { slug: "category/espresso-machines" }, { LENS_API_URL: "https://x" });
    expect(fetchMock.mock.calls[0]![0]).toContain("/packs/category%2Fespresso-machines");
  });

  it("lens.audit proxies POST /audit with JSON body", async () => {
    const fetchMock = vi.fn((_u: unknown, _i?: unknown) =>
      Promise.resolve(new Response('{"id":"run_abc"}', { status: 200 })),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await callTool(
      "lens.audit",
      { kind: "query", userPrompt: "espresso" },
      { LENS_API_URL: "https://x" },
    );
    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toBe("https://x/audit");
    expect((call[1] as RequestInit).method).toBe("POST");
  });

  it("lens.spec_optimal shapes params into a query audit", async () => {
    const fetchMock = vi.fn((_u: unknown, _i?: unknown) =>
      Promise.resolve(new Response("{}", { status: 200 })),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await callTool(
      "lens.spec_optimal",
      { category: "laptops", criteria: "32GB RAM, battery life" },
      { LENS_API_URL: "https://x" },
    );
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.kind).toBe("query");
    expect(body.userPrompt).toContain("32GB RAM");
    expect(body.category).toBe("laptops");
  });

  it("lens.intervention_draft fills template tokens from context", async () => {
    const packJson = JSON.stringify({
      name: "Magnuson-Moss return",
      body: {
        template: {
          format: "email",
          subject: "Return {product_name}",
          bodyTemplate: "Dear {seller},\nDefect on {product_name} purchased {date}.",
        },
      },
    });
    globalThis.fetch = (async () => new Response(packJson, { status: 200 })) as unknown as typeof fetch;
    const r = await callTool(
      "lens.intervention_draft",
      {
        packSlug: "intervention/draft-magnuson-moss-return",
        context: { product_name: "Breville Bambino", seller: "BestBuy", date: "2026-03-01" },
      },
      { LENS_API_URL: "https://x" },
    );
    expect(r.content[0]!.text).toContain("Breville Bambino");
    expect(r.content[0]!.text).toContain("BestBuy");
    expect(r.content[0]!.text).toContain("2026-03-01");
  });
});
