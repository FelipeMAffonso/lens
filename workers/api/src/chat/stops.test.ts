import { describe, expect, it } from "vitest";
import {
  inferHostAI,
  isReadyToGenerate,
  lastAssistantEndedInQuestion,
  lastUserEndedInQuestion,
  looksLikeAIRecommendation,
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

// improve-01 Job 2 detection: the paste-of-AI-recommendation short-circuit.
// Must fire on realistic ChatGPT / Claude / Gemini / Rufus / Perplexity
// pastes, and NOT fire on short shopping queries, questions, or URL-only
// inputs (which are handled by a separate detector).
describe("looksLikeAIRecommendation (Job 2 detection)", () => {
  describe("positives — real-world AI recommendation pastes", () => {
    it("ChatGPT style: De'Longhi Stilosa espresso", () => {
      const t =
        "I recommend the De'Longhi Stilosa EC260BK for your espresso machine under $400. Three reasons: (1) 15-bar pressure delivers cafe-quality espresso, (2) stainless-steel build ensures durability, (3) the manual steam wand lets you texture milk. Priced around $249.";
      expect(looksLikeAIRecommendation(t)).toBe(true);
    });

    it("Claude style: Sony headphones", () => {
      const t =
        "Based on your criteria, my top pick is the Sony WH-1000XM5. Here's why: (1) industry-leading ANC, (2) 30-hour battery life, (3) excellent call quality with the new mic array. Around $350.";
      expect(looksLikeAIRecommendation(t)).toBe(true);
    });

    it("Gemini style: ThinkPad laptop", () => {
      const t =
        "For a budget laptop under $1000 for coding, I'd go with the Lenovo ThinkPad T14 Gen 4. It offers: (1) reliable build, (2) great keyboard, (3) up to 12 hours of battery life. Typically $899.";
      expect(looksLikeAIRecommendation(t)).toBe(true);
    });

    it("Rufus style: Instant Pot", () => {
      const t =
        "Check out the Instant Pot Duo 7-in-1, a popular pick on Amazon. It has 7 cooking functions, a 6-quart capacity, and a 4.7-star rating from 150,000+ reviewers. List price is $89.99.";
      expect(looksLikeAIRecommendation(t)).toBe(true);
    });

    it("Perplexity style: Breville Bambino", () => {
      const t =
        "My pick for you is the Breville Bambino Plus. Three reasons to consider it: great 15-bar pressure, stainless build, fast 3-second heat-up time. MSRP is $499.";
      expect(looksLikeAIRecommendation(t)).toBe(true);
    });

    it("MacBook Air with numbered list", () => {
      const t =
        "I'd recommend the Apple MacBook Air M3 for your use case. It gives you 1. up to 18-hour battery, 2. fanless silent design, and 3. an excellent Retina display. Starting at $1,099.";
      expect(looksLikeAIRecommendation(t)).toBe(true);
    });

    it("Dyson vacuum", () => {
      const t =
        "I'd recommend the Dyson V15 Detect. Three reasons to consider it: laser-detection of fine dust, 60-minute runtime, and lightweight cordless handling. List price is $749.";
      expect(looksLikeAIRecommendation(t)).toBe(true);
    });

    it("Roborock with model code + bullets", () => {
      const t =
        "My pick is the Roborock S8 Pro Ultra. It offers 6000Pa suction, a self-empty dock that handles dust for weeks, and sonic mopping that scrubs at 3000 times per minute. Around $1,599.";
      expect(looksLikeAIRecommendation(t)).toBe(true);
    });
  });

  describe("negatives — short queries, questions, URLs, bare statements", () => {
    it("short shopping query (no reasons, no model code)", () => {
      expect(looksLikeAIRecommendation("espresso machine under $400")).toBe(false);
    });

    it("generic wish (no price, no model)", () => {
      expect(looksLikeAIRecommendation("I'm looking for a good laptop")).toBe(false);
    });

    it("question to Lens (no product)", () => {
      expect(looksLikeAIRecommendation("what's your take on the MacBook Air?")).toBe(false);
    });

    it("too short even if it mentions a product + price", () => {
      expect(looksLikeAIRecommendation("MacBook Air $1099")).toBe(false);
    });

    it("bare URL (handled by url detector, not this one)", () => {
      expect(
        looksLikeAIRecommendation("https://www.amazon.com/dp/B08N5WRWNW"),
      ).toBe(false);
    });

    it("long wish without reasons/model/price", () => {
      const t =
        "I'm looking for something nice for marathon training and long training runs in the rain and cold, comfortable and durable for many miles.";
      expect(looksLikeAIRecommendation(t)).toBe(false);
    });

    it("off-topic long rant (no signals)", () => {
      const t =
        "The weather today is really nice and I was thinking about going for a walk in the park with my friends and maybe grabbing some coffee afterwards at the new cafe downtown.";
      expect(looksLikeAIRecommendation(t)).toBe(false);
    });
  });
});

describe("inferHostAI (best-effort host AI detection for pasted answers)", () => {
  it("detects Rufus from Amazon cues", () => {
    expect(inferHostAI("available on Amazon for $249.")).toBe("rufus");
    expect(inferHostAI("sold by Amazon, 4.6 stars.")).toBe("rufus");
  });
  it("detects Gemini", () => {
    expect(inferHostAI("According to Gemini, this model is well-regarded.")).toBe("gemini");
  });
  it("detects Claude", () => {
    expect(inferHostAI("As Claude, I'd say the MacBook Air is a solid pick.")).toBe("claude");
  });
  it("detects ChatGPT", () => {
    expect(inferHostAI("As of my last update, ChatGPT recommends the Sony WH-1000XM5.")).toBe(
      "chatgpt",
    );
  });
  it("defaults to unknown when no markers present", () => {
    expect(inferHostAI("My top pick is the De'Longhi Stilosa EC260BK at $249.")).toBe("unknown");
  });
});
