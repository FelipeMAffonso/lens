import { describe, expect, it } from "vitest";
import { checkPure } from "./counter-do.js";
import { findPolicy, POLICIES } from "./config.js";
import { routeFromPath } from "./middleware.js";

describe("checkPure", () => {
  it("initializes a fresh window on first call", () => {
    const r = checkPure(1000, 10, 60, {});
    expect(r.http).toBe(200);
    expect(r.response.ok).toBe(true);
    expect(r.response.count).toBe(1);
    expect(r.response.remaining).toBe(9);
    expect(r.next.windowStart).toBe(1000);
    expect(r.next.count).toBe(1);
  });

  it("increments within the same window", () => {
    const r = checkPure(1500, 10, 60, { windowStart: 1000, count: 3 });
    expect(r.response.ok).toBe(true);
    expect(r.response.count).toBe(4);
    expect(r.response.remaining).toBe(6);
    expect(r.next.windowStart).toBe(1000); // window preserved
  });

  it("returns 429 when limit exhausted", () => {
    const r = checkPure(2000, 10, 60, { windowStart: 1000, count: 10 });
    expect(r.http).toBe(429);
    expect(r.response.ok).toBe(false);
    expect(r.response.remaining).toBe(0);
  });

  it("resets the window after windowSeconds elapsed", () => {
    const r = checkPure(70_000, 10, 60, { windowStart: 1000, count: 10 });
    expect(r.http).toBe(200);
    expect(r.response.count).toBe(1);
    expect(r.next.windowStart).toBe(70_000);
  });

  it("resetAt reflects original window start, not now", () => {
    const r = checkPure(5000, 10, 60, { windowStart: 1000, count: 5 });
    // resetAt = 1000 + 60_000 = 61_000
    expect(r.response.resetAt).toBe(new Date(61_000).toISOString());
  });
});

describe("findPolicy", () => {
  it("returns policies for known routes", () => {
    expect(findPolicy("audit")).toBeDefined();
    expect(findPolicy("score")).toBeDefined();
    expect(findPolicy("voice")).toBeDefined();
    expect(findPolicy("review-scan")).toBeDefined();
    expect(findPolicy("passive-scan")).toBeDefined();
  });
  it("returns undefined for unknown routes", () => {
    expect(findPolicy("nonsense")).toBeUndefined();
  });
  it("has 5 policies shipping", () => {
    expect(POLICIES.length).toBe(5);
  });
  it("every policy has positive limits + window", () => {
    for (const p of POLICIES) {
      expect(p.anonLimit).toBeGreaterThan(0);
      expect(p.userLimit).toBeGreaterThan(0);
      expect(p.userLimit).toBeGreaterThanOrEqual(p.anonLimit);
      expect(p.windowSeconds).toBeGreaterThan(0);
    }
  });
});

describe("routeFromPath", () => {
  it("maps /audit + variants", () => {
    expect(routeFromPath("/audit")).toBe("audit");
    expect(routeFromPath("/audit/stream")).toBe("audit");
  });
  it("maps /score + /embed.js", () => {
    expect(routeFromPath("/score")).toBe("score");
  });
  it("maps /voice/transcribe", () => {
    expect(routeFromPath("/voice/transcribe")).toBe("voice");
  });
  it("returns null for untracked routes", () => {
    expect(routeFromPath("/health")).toBeNull();
    expect(routeFromPath("/trace/abc")).toBeNull();
  });
});
