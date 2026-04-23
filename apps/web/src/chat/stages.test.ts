import { describe, expect, it } from "vitest";
import {
  inferHostAI,
  lastAssistantEndedInQ,
  looksLikeAIRecommendation,
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

// improve-01: front-end mirror of the Job 2 detector. Must agree with the
// server-side version in stops.ts. These tests are deliberately a subset of
// the worker tests — just enough to catch skew during dev.
describe("looksLikeAIRecommendation (front-end mirror)", () => {
  it("positive on De'Longhi paste", () => {
    const t =
      "I recommend the De'Longhi Stilosa EC260BK for your espresso machine under $400. Three reasons: (1) 15-bar pressure, (2) stainless-steel build, (3) manual steam wand. Priced around $249.";
    expect(looksLikeAIRecommendation(t)).toBe(true);
  });
  it("positive on Sony headphones", () => {
    const t =
      "Based on your criteria, my top pick is the Sony WH-1000XM5. (1) industry-leading ANC, (2) 30-hour battery, (3) excellent call quality. Around $350.";
    expect(looksLikeAIRecommendation(t)).toBe(true);
  });
  it("negative on short query", () => {
    expect(looksLikeAIRecommendation("espresso under $400, build matters most")).toBe(false);
  });
  it("negative on bare URL", () => {
    expect(looksLikeAIRecommendation("https://www.amazon.com/dp/B08N5WRWNW")).toBe(false);
  });
  it("negative on question", () => {
    expect(looksLikeAIRecommendation("what's your take on the MacBook Air?")).toBe(false);
  });
});

describe("inferHostAI (front-end mirror)", () => {
  it("amazon → rufus", () => {
    expect(inferHostAI("This Instant Pot is available on Amazon for $89.99")).toBe("rufus");
  });
  it("default → unknown", () => {
    expect(inferHostAI("The Breville Bambino Plus is around $499.")).toBe("unknown");
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
