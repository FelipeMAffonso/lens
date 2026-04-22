import { describe, expect, it } from "vitest";
import { lookupDomainAge } from "./domain-age.js";

const NOW = new Date("2026-04-22T00:00:00Z");

describe("lookupDomainAge", () => {
  it("Amazon → known-old + ~30y", () => {
    const r = lookupDomainAge("amazon.com", NOW);
    expect(r.status).toBe("known-old");
    expect(r.daysSinceRegistered).toBeGreaterThan(10_000);
  });

  it("Target → known-old", () => {
    const r = lookupDomainAge("target.com", NOW);
    expect(r.status).toBe("known-old");
  });

  it("brand-new-shop-2026.example → known-very-recent", () => {
    const r = lookupDomainAge("brand-new-shop-2026.example", NOW);
    expect(r.status).toBe("known-very-recent");
    expect((r.daysSinceRegistered ?? 999)).toBeLessThan(30);
  });

  it("www. prefix canonicalizes", () => {
    expect(lookupDomainAge("www.amazon.com", NOW).status).toBe("known-old");
  });

  it("Unknown host → unknown", () => {
    expect(lookupDomainAge("obscure-nowhere.test", NOW).status).toBe("unknown");
  });
});
