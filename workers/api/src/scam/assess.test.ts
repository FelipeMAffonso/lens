import { describe, expect, it } from "vitest";
import { assessScam } from "./assess.js";

const NOW = new Date("2026-04-22T00:00:00Z");

describe("assessScam", () => {
  it("amaz0n-deals.com → scam verdict (typosquat + new domain)", () => {
    const r = assessScam(
      { host: "amaz0n-deals.com", receivedViaHttps: true },
      NOW,
    );
    expect(r.verdict).toBe("scam");
    expect(r.typosquat?.nearestBrand).toBe("amazon");
    const ids = r.signals.map((s) => s.id);
    expect(ids).toContain("typosquat");
    expect(ids).toContain("domain-age");
  });

  it("target.com → safe verdict (trust bonus + old domain)", () => {
    const r = assessScam({ host: "target.com", receivedViaHttps: true }, NOW);
    expect(r.verdict).toBe("safe");
    expect(r.riskScore).toBeLessThan(20);
    expect(r.signals.some((s) => s.id === "trust-signals" && s.verdict === "ok")).toBe(true);
  });

  it("unknown host → domain-age warn bullet surfaces (may stay safe with single signal)", () => {
    const r = assessScam(
      { host: "somewhere-unknown.example", receivedViaHttps: true },
      NOW,
    );
    // domain-age unknown contributes warn (+15). A single warn yields
    // riskScore 15 → "safe" under the 20-threshold. The bullet itself is
    // surfaced regardless so the UI can render "Lens doesn't know this
    // domain". This IS a caution-worthy host, but we don't double-count
    // absence of evidence.
    expect(r.signals.find((s) => s.id === "domain-age")?.verdict).toBe("warn");
  });

  it("HTTP (non-https) adds warn", () => {
    const r = assessScam({ host: "target.com", receivedViaHttps: false }, NOW);
    expect(r.signals.some((s) => s.id === "https" && s.verdict === "warn")).toBe(true);
  });

  it("price-too-low triggers fail when under floor/3", () => {
    const r = assessScam(
      { host: "target.com", category: "laptops", price: 50, receivedViaHttps: true },
      NOW,
    );
    expect(r.signals.some((s) => s.id === "price-too-low" && s.verdict === "fail")).toBe(true);
  });

  it("plausible price passes the price-too-low check", () => {
    const r = assessScam(
      { host: "target.com", category: "laptops", price: 1200, receivedViaHttps: true },
      NOW,
    );
    expect(r.signals.some((s) => s.id === "price-too-low" && s.verdict === "ok")).toBe(true);
  });

  it("suspicious-deals.test (< 30 day fixture) → domain-age fail", () => {
    const r = assessScam(
      { host: "suspicious-deals.test", receivedViaHttps: true },
      NOW,
    );
    expect(r.signals.find((s) => s.id === "domain-age")?.verdict).toBe("fail");
  });

  it("risk score clamped to [0, 100]", () => {
    const trusted = assessScam({ host: "target.com", receivedViaHttps: true }, NOW);
    expect(trusted.riskScore).toBeGreaterThanOrEqual(0);
    const scam = assessScam(
      { host: "amaz0n-deals.com", category: "laptops", price: 5, receivedViaHttps: false },
      NOW,
    );
    expect(scam.riskScore).toBeLessThanOrEqual(100);
  });
});
