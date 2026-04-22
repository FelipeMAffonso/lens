import { describe, expect, it } from "vitest";
import type { UserIntent } from "@lens/shared";
import { generateQuestions } from "./generate.js";

const mkIntent = (crits: UserIntent["criteria"]): UserIntent => ({
  category: "laptop",
  criteria: crits,
  rawCriteriaText: "something fast for work",
});

const envWithoutKey = { ANTHROPIC_API_KEY: "" } as never;

describe("generateQuestions — fallback path (no Opus key)", () => {
  it("produces canonical speed/performance fallback Q", async () => {
    const intent = mkIntent([
      { name: "speed", weight: 0.5, direction: "higher_is_better", confidence: 0.4 },
      { name: "price", weight: 0.5, direction: "lower_is_better", confidence: 0.9 },
    ]);
    const { questions, source } = await generateQuestions(intent, "something fast for work", ["speed"], envWithoutKey);
    expect(source).toBe("fallback");
    expect(questions).toHaveLength(1);
    expect(questions[0]!.targetCriterion).toBe("speed");
    expect(questions[0]!.optionA.impliedWeightShift).toHaveProperty("responsiveness");
    expect(questions[0]!.optionB.impliedWeightShift).toHaveProperty("throughput");
  });

  it("produces portability fallback", async () => {
    const intent = mkIntent([{ name: "portable", weight: 1, direction: "higher_is_better", confidence: 0.3 }]);
    const { questions, source } = await generateQuestions(intent, "portable laptop", ["portable"], envWithoutKey);
    expect(source).toBe("fallback");
    expect(questions[0]!.targetCriterion).toBe("portable");
    expect(questions[0]!.optionA.label).toMatch(/size|weight|under/i);
    expect(questions[0]!.optionB.label).toMatch(/battery/i);
  });

  it("produces build-quality fallback", async () => {
    const intent = mkIntent([{ name: "build quality", weight: 1, direction: "higher_is_better", confidence: 0.3 }]);
    const { questions, source } = await generateQuestions(intent, "durable", ["build quality"], envWithoutKey);
    expect(source).toBe("fallback");
    expect(questions[0]!.targetCriterion).toBe("build quality");
  });

  it("produces audio fallback for sound/noise", async () => {
    const intent = mkIntent([{ name: "noise cancellation", weight: 1, direction: "higher_is_better", confidence: 0.3 }]);
    const { questions, source } = await generateQuestions(intent, "quiet", ["noise cancellation"], envWithoutKey);
    expect(source).toBe("fallback");
    expect(questions[0]!.optionA.impliedWeightShift).toHaveProperty("noise_cancellation");
  });

  it("uses generic fallback for unknown criterion", async () => {
    const intent = mkIntent([{ name: "vibes", weight: 1, direction: "higher_is_better", confidence: 0.3 }]);
    const { questions, source } = await generateQuestions(intent, "vibes", ["vibes"], envWithoutKey);
    expect(source).toBe("fallback");
    expect(questions[0]!.prompt).toContain("vibes");
    expect(questions[0]!.optionA.impliedWeightShift).toHaveProperty("vibes");
    expect(questions[0]!.optionA.impliedWeightShift).toHaveProperty("price");
  });

  it("returns empty when no targets", async () => {
    const intent = mkIntent([{ name: "a", weight: 1, direction: "higher_is_better" }]);
    const { questions, source } = await generateQuestions(intent, "", [], envWithoutKey);
    expect(questions).toHaveLength(0);
    expect(source).toBe("fallback");
  });

  it("respects MAX_QUESTIONS cap", async () => {
    const intent = mkIntent([
      { name: "speed", weight: 0.2, direction: "higher_is_better", confidence: 0.3 },
      { name: "portable", weight: 0.2, direction: "higher_is_better", confidence: 0.3 },
      { name: "quality", weight: 0.2, direction: "higher_is_better", confidence: 0.3 },
      { name: "sound", weight: 0.2, direction: "higher_is_better", confidence: 0.3 },
      { name: "vibes", weight: 0.2, direction: "higher_is_better", confidence: 0.3 },
    ]);
    const targets = ["speed", "portable", "quality", "sound", "vibes"];
    const { questions } = await generateQuestions(intent, "", targets, envWithoutKey);
    expect(questions.length).toBeLessThanOrEqual(4);
  });
});
