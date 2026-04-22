import { describe, expect, it, beforeEach } from "vitest";
import {
  recordDismissal,
  shouldSuppress,
  getSuppressionState,
  reset,
} from "./suppression.js";

describe("learned suppression", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("does not suppress before the first dismissal", () => {
    expect(shouldSuppress("amazon.com", "hidden-costs")).toBe(false);
  });

  it("does not suppress after 1 or 2 dismissals", () => {
    recordDismissal("amazon.com", "hidden-costs");
    expect(shouldSuppress("amazon.com", "hidden-costs")).toBe(false);
    recordDismissal("amazon.com", "hidden-costs");
    expect(shouldSuppress("amazon.com", "hidden-costs")).toBe(false);
  });

  it("suppresses after the 3rd dismissal", () => {
    recordDismissal("amazon.com", "hidden-costs");
    recordDismissal("amazon.com", "hidden-costs");
    recordDismissal("amazon.com", "hidden-costs");
    expect(shouldSuppress("amazon.com", "hidden-costs")).toBe(true);
  });

  it("scopes suppression by host", () => {
    recordDismissal("amazon.com", "hidden-costs");
    recordDismissal("amazon.com", "hidden-costs");
    recordDismissal("amazon.com", "hidden-costs");
    expect(shouldSuppress("bestbuy.com", "hidden-costs")).toBe(false);
  });

  it("scopes suppression by pattern id", () => {
    recordDismissal("amazon.com", "hidden-costs");
    recordDismissal("amazon.com", "hidden-costs");
    recordDismissal("amazon.com", "hidden-costs");
    expect(shouldSuppress("amazon.com", "fake-urgency")).toBe(false);
  });

  it("tracks count + timestamps in the record", () => {
    recordDismissal("amazon.com", "hidden-costs");
    const r = getSuppressionState("amazon.com", "hidden-costs");
    expect(r).not.toBeNull();
    expect(r!.count).toBe(1);
    expect(typeof r!.firstAt).toBe("number");
    expect(typeof r!.lastAt).toBe("number");
  });

  it("reset clears the record", () => {
    recordDismissal("amazon.com", "hidden-costs");
    recordDismissal("amazon.com", "hidden-costs");
    recordDismissal("amazon.com", "hidden-costs");
    expect(shouldSuppress("amazon.com", "hidden-costs")).toBe(true);
    reset("amazon.com", "hidden-costs");
    expect(shouldSuppress("amazon.com", "hidden-costs")).toBe(false);
  });
});
