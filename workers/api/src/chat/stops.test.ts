import { describe, expect, it } from "vitest";
import {
  isReadyToGenerate,
  lastAssistantEndedInQuestion,
  lastUserEndedInQuestion,
  userGaveEverything,
  userTurnCount,
  type ChatTurn,
} from "./stops.js";

const u = (text: string): ChatTurn => ({ role: "user", text });
const a = (text: string): ChatTurn => ({ role: "assistant", text });

describe("userTurnCount", () => {
  it("counts only user turns", () => {
    expect(userTurnCount([u("hi"), a("hello"), u("espresso"), a("budget?")])).toBe(2);
    expect(userTurnCount([])).toBe(0);
    expect(userTurnCount([a("only bots")])).toBe(0);
  });
});

describe("lastAssistantEndedInQuestion", () => {
  it("true when the last assistant turn ends in ?", () => {
    expect(lastAssistantEndedInQuestion([u("hi"), a("What's your budget?")])).toBe(true);
  });

  it("false when last assistant turn is a statement", () => {
    expect(
      lastAssistantEndedInQuestion([u("hi"), a("Cool, let me find picks.")]),
    ).toBe(false);
  });

  it("ignores trailing whitespace", () => {
    expect(lastAssistantEndedInQuestion([a("What's your budget?   \n ")])).toBe(true);
  });

  it("returns false when there are no assistant turns at all", () => {
    expect(lastAssistantEndedInQuestion([u("hi")])).toBe(false);
    expect(lastAssistantEndedInQuestion([])).toBe(false);
  });
});

describe("isReadyToGenerate (Study 3 gate)", () => {
  it("not ready on 0, 1, or 2 user turns", () => {
    expect(isReadyToGenerate([])).toBe(false);
    expect(isReadyToGenerate([u("hi")])).toBe(false);
    expect(isReadyToGenerate([u("hi"), a("budget?"), u("$200")])).toBe(false);
  });

  it("ready on 3 user turns if last bot did NOT end in ?", () => {
    const turns: ChatTurn[] = [
      u("laptop for coding"),
      a("What's your budget?"),
      u("under $1000"),
      a("Got it, looking for picks."),
      u("battery + keyboard"),
    ];
    expect(isReadyToGenerate(turns)).toBe(true);
  });

  it("NOT ready on 3 user turns if last bot still ends in ?", () => {
    const turns: ChatTurn[] = [
      u("laptop for coding"),
      a("Budget?"),
      u("$1000"),
      a("One more — battery or performance?"),
      u("battery"),
    ];
    // user=3 but bot last-Q means bot may still be clarifying; NOT ready.
    // (Study 3 path: wait for that 4th user turn.)
    expect(isReadyToGenerate(turns)).toBe(false);
  });

  it("ready unconditionally on 4 user turns", () => {
    const turns: ChatTurn[] = [
      u("laptop"),
      a("budget?"),
      u("$1000"),
      a("what matters?"),
      u("battery"),
      a("anything else?"),
      u("thin bezel"),
    ];
    // 4 user turns, last bot asked Q — still ready per hard ceiling.
    expect(isReadyToGenerate(turns)).toBe(true);
  });
});

describe("lastUserEndedInQuestion (calibration fix from 2026-04-22 user feedback)", () => {
  it("detects explicit ? suffix", () => {
    expect(lastUserEndedInQuestion([u("why are you asking about stationary desk stand?")])).toBe(
      true,
    );
  });

  it("detects question-word openers even without `?`", () => {
    expect(lastUserEndedInQuestion([u("why are you asking about stationary desk stand")])).toBe(
      true,
    );
    expect(lastUserEndedInQuestion([u("what is a stationary desk stand")])).toBe(true);
    expect(lastUserEndedInQuestion([u("how does that differ")])).toBe(true);
    expect(lastUserEndedInQuestion([u("which one is better")])).toBe(true);
  });

  it("returns false for a plain preference statement", () => {
    expect(lastUserEndedInQuestion([u("budget around $200 fully automatic please")])).toBe(false);
  });

  it("returns false when there are no user turns", () => {
    expect(lastUserEndedInQuestion([a("hi")])).toBe(false);
  });
});

describe("isReadyToGenerate calibration: user question blocks audit", () => {
  it("does NOT trigger audit on 4th user turn when that turn is a question", () => {
    const turns: ChatTurn[] = [
      u("espresso"),
      a("Budget?"),
      u("under $300"),
      a("automatic or manual?"),
      u("both are fine"),
      a("What matters more, noise level or speed?"),
      u("what do you mean by noise level"),
    ];
    expect(isReadyToGenerate(turns)).toBe(false);
  });

  it("still triggers audit when last user turn is a real preference + 4 turns", () => {
    const turns: ChatTurn[] = [
      u("espresso"),
      a("Budget?"),
      u("under $300"),
      a("auto or manual?"),
      u("automatic"),
      a("ice or no ice?"),
      u("ice please"),
    ];
    expect(isReadyToGenerate(turns)).toBe(true);
  });
});

describe("userGaveEverything (fast-path shortcut)", () => {
  it("detects combined budget + tradeoff keyword", () => {
    const turns: ChatTurn[] = [
      u("I want an espresso machine under $200, fully automatic, for home"),
    ];
    expect(userGaveEverything(turns)).toBe(true);
  });

  it("false when only budget given", () => {
    const turns: ChatTurn[] = [u("laptop under $1000")];
    expect(userGaveEverything(turns)).toBe(false);
  });

  it("false when only tradeoff keyword given", () => {
    const turns: ChatTurn[] = [u("I want a true wireless earbud")];
    expect(userGaveEverything(turns)).toBe(false);
  });

  it("aggregates across multiple user turns", () => {
    const turns: ChatTurn[] = [
      u("running earbuds"),
      a("budget?"),
      u("around $80"),
      a("secure fit — true wireless or neckband?"),
      u("true wireless please"),
    ];
    expect(userGaveEverything(turns)).toBe(true);
  });
});
