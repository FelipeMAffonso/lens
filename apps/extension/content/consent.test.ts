import { beforeEach, describe, expect, it } from "vitest";
import { canStage2, getConsent, resetConsent, setConsent } from "./consent.js";

describe("consent", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null when no consent set", () => {
    expect(getConsent("amazon.com")).toBeNull();
    expect(canStage2("amazon.com")).toBe(false);
  });

  it("stores + reads always", () => {
    setConsent("amazon.com", "always");
    expect(getConsent("amazon.com")).toBe("always");
    expect(canStage2("amazon.com")).toBe(true);
  });

  it("stores + reads ask", () => {
    setConsent("amazon.com", "ask");
    expect(getConsent("amazon.com")).toBe("ask");
    expect(canStage2("amazon.com")).toBe(false);
  });

  it("stores + reads never", () => {
    setConsent("amazon.com", "never");
    expect(getConsent("amazon.com")).toBe("never");
    expect(canStage2("amazon.com")).toBe(false);
  });

  it("scoped by host", () => {
    setConsent("amazon.com", "always");
    expect(getConsent("bestbuy.com")).toBeNull();
    expect(canStage2("bestbuy.com")).toBe(false);
  });

  it("reset clears the entry", () => {
    setConsent("amazon.com", "always");
    resetConsent("amazon.com");
    expect(getConsent("amazon.com")).toBeNull();
  });
});
