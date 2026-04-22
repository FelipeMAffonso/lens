import { describe, expect, it } from "vitest";
import { fetchHibpBreachesForHost, normalizeHibp } from "./hibp.js";

describe("normalizeHibp", () => {
  it("maps a HIBP domain-endpoint map to BreachRecord[]", () => {
    const body = { YahooBreach: 3_000_000_000, DropboxBreach: 68_000_000, Minor: 1000 };
    const r = normalizeHibp(body, "example.com");
    expect(r).toHaveLength(3);
    const yahoo = r.find((b) => b.id.includes("yahoobreach"));
    expect(yahoo?.severity).toBe("critical");
    expect(yahoo?.source).toBe("HIBP");
    expect(r.find((b) => b.id.includes("minor"))?.severity).toBe("moderate");
  });
  it("returns [] on malformed body", () => {
    expect(normalizeHibp(null, "x.com")).toEqual([]);
    expect(normalizeHibp("string", "x.com")).toEqual([]);
    expect(normalizeHibp({}, "x.com")).toEqual([]);
  });
});

describe("fetchHibpBreachesForHost", () => {
  it("null on missing key", async () => {
    const r = await fetchHibpBreachesForHost("target.com", { apiKey: "" });
    expect(r).toBeNull();
  });
  it("empty array on 404 (domain unknown)", async () => {
    const r = await fetchHibpBreachesForHost("x.com", {
      apiKey: "k",
      fetch: (_u: unknown, _i?: unknown) =>
        Promise.resolve(new Response("", { status: 404 })) as never,
    });
    expect(r).toEqual([]);
  });
  it("null on non-2xx other than 404", async () => {
    const r = await fetchHibpBreachesForHost("x.com", {
      apiKey: "k",
      fetch: (_u: unknown, _i?: unknown) =>
        Promise.resolve(new Response("forbidden", { status: 403 })) as never,
    });
    expect(r).toBeNull();
  });
  it("happy path returns normalized records", async () => {
    const body = { YahooBreach: 3_000_000_000 };
    const r = await fetchHibpBreachesForHost("yahoo.com", {
      apiKey: "k",
      fetch: (_u: unknown, _i?: unknown) =>
        Promise.resolve(new Response(JSON.stringify(body), { status: 200 })) as never,
    });
    expect(r).not.toBeNull();
    expect(r!.length).toBe(1);
    expect(r![0]!.severity).toBe("critical");
  });
});
