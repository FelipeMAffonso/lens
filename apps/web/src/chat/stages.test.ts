import { describe, expect, it } from "vitest";
import {
  lastAssistantEndedInQ,
  ROTATING_STATUS_PHRASES,
  shouldTriggerAudit,
  userTurns,
  type Turn,
} from "./stages.js";

const u = (text: string): Turn => ({ role: "user", text });
const a = (text: string): Turn => ({ role: "assistant", text });

describe("userTurns", () => {
  it("counts only user turns", () => {
    expect(userTurns([])).toBe(0);
    expect(userTurns([u("hi")])).toBe(1);
    expect(userTurns([u("hi"), a("hello"), u("ok")])).toBe(2);
  });
});

describe("lastAssistantEndedInQ", () => {
  it("detects trailing ?", () => {
    expect(lastAssistantEndedInQ([a("budget?")])).toBe(true);
    expect(lastAssistantEndedInQ([a("got it")])).toBe(false);
  });
  it("ignores trailing whitespace", () => {
    expect(lastAssistantEndedInQ([a("budget?  \n ")])).toBe(true);
  });
  it("false when no assistant turns", () => {
    expect(lastAssistantEndedInQ([])).toBe(false);
    expect(lastAssistantEndedInQ([u("hi")])).toBe(false);
  });
});

describe("shouldTriggerAudit (Study 3 gate)", () => {
  it("false under 3 user turns", () => {
    expect(shouldTriggerAudit([])).toBe(false);
    expect(shouldTriggerAudit([u("a")])).toBe(false);
    expect(shouldTriggerAudit([u("a"), a("q?"), u("b")])).toBe(false);
  });
  it("true on 3 user turns + bot didn't ask Q", () => {
    expect(
      shouldTriggerAudit([u("a"), a("q?"), u("b"), a("ok got it"), u("c")]),
    ).toBe(true);
  });
  it("false on 3 user turns if bot's last was still a Q", () => {
    expect(
      shouldTriggerAudit([u("a"), a("q?"), u("b"), a("one more q?"), u("c")]),
    ).toBe(false);
  });
  it("true on 4 user turns unconditionally", () => {
    expect(
      shouldTriggerAudit([
        u("a"),
        a("q?"),
        u("b"),
        a("q?"),
        u("c"),
        a("q?"),
        u("d"),
      ]),
    ).toBe(true);
  });
});

describe("ROTATING_STATUS_PHRASES", () => {
  it("has at least 4 phrases", () => {
    expect(ROTATING_STATUS_PHRASES.length).toBeGreaterThanOrEqual(4);
  });
  it("phrases are non-empty strings", () => {
    for (const p of ROTATING_STATUS_PHRASES) {
      expect(typeof p).toBe("string");
      expect(p.length).toBeGreaterThan(5);
    }
  });
  it("narrates real pipeline stages (must mention products, specs, claims)", () => {
    const joined = ROTATING_STATUS_PHRASES.join(" ").toLowerCase();
    expect(joined).toMatch(/product|retailer/);
    expect(joined).toMatch(/spec/);
    expect(joined).toMatch(/claim|confabul/);
    expect(joined).toMatch(/rank/);
  });
});
