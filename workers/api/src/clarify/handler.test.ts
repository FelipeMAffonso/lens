import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { handleClarify, handleClarifyApply } from "./handler.js";

function app() {
  const h = new Hono();
  h.post("/clarify", (c) => handleClarify(c as never));
  h.post("/clarify/apply", (c) => handleClarifyApply(c as never));
  return h;
}

const highConfidenceIntent = {
  category: "espresso",
  criteria: [
    { name: "pressure", weight: 0.5, direction: "higher_is_better", confidence: 0.9 },
    { name: "price", weight: 0.5, direction: "lower_is_better", confidence: 0.85 },
  ],
  rawCriteriaText: "pressure + price",
};

const lowConfidenceIntent = {
  category: "laptop",
  criteria: [
    { name: "speed", weight: 0.5, direction: "higher_is_better", confidence: 0.4 },
    { name: "price", weight: 0.5, direction: "lower_is_better", confidence: 0.85 },
  ],
  rawCriteriaText: "something fast for work",
};

describe("POST /clarify", () => {
  it("rejects invalid body with 400", async () => {
    const res = await app().request("/clarify", { method: "POST", body: JSON.stringify({}), headers: { "content-type": "application/json" } });
    expect(res.status).toBe(400);
  });

  it("returns needsClarification=false when all criteria are confident", async () => {
    const res = await app().request("/clarify", {
      method: "POST",
      body: JSON.stringify({ intent: highConfidenceIntent, userPrompt: "pressure + price" }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { needsClarification: boolean; questions: unknown[]; source: string };
    expect(body.needsClarification).toBe(false);
    expect(body.questions).toHaveLength(0);
    expect(body.source).toBe("skipped");
  });

  it("returns questions for low-confidence criteria (fallback path)", async () => {
    // No ANTHROPIC_API_KEY → forces fallback path.
    const h = new Hono<{ Bindings: { ANTHROPIC_API_KEY: string } }>();
    h.post("/clarify", (c) => handleClarify(c as never));
    const res = await h.request("/clarify", {
      method: "POST",
      body: JSON.stringify({ intent: lowConfidenceIntent, userPrompt: "something fast" }),
      headers: { "content-type": "application/json" },
    }, { ANTHROPIC_API_KEY: "" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { needsClarification: boolean; questions: Array<{ targetCriterion: string }>; source: string };
    expect(body.needsClarification).toBe(true);
    expect(body.questions.length).toBeGreaterThanOrEqual(1);
    expect(body.source).toBe("fallback");
    expect(body.questions[0]!.targetCriterion).toBe("speed");
  });
});

describe("POST /clarify/apply", () => {
  it("rejects invalid body with 400", async () => {
    const res = await app().request("/clarify/apply", { method: "POST", body: JSON.stringify({ intent: lowConfidenceIntent }), headers: { "content-type": "application/json" } });
    expect(res.status).toBe(400);
  });

  it("applies answers and returns updated intent with sum-1 weights", async () => {
    const question = {
      id: "q1",
      targetCriterion: "speed",
      prompt: "?",
      optionA: { label: "A", impliedWeightShift: { responsiveness: 0.15, throughput: -0.05 } },
      optionB: { label: "B", impliedWeightShift: { throughput: 0.15, responsiveness: -0.05 } },
    };
    const res = await app().request("/clarify/apply", {
      method: "POST",
      body: JSON.stringify({
        intent: lowConfidenceIntent,
        answers: [{ question, answer: { questionId: "q1", chose: "A" } }],
      }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; intent: { criteria: Array<{ name: string; weight: number; confidence?: number }> } };
    expect(body.ok).toBe(true);
    const total = body.intent.criteria.reduce((s, c) => s + c.weight, 0);
    expect(total).toBeCloseTo(1, 6);
    const resp = body.intent.criteria.find((c) => c.name === "responsiveness");
    expect(resp).toBeDefined();
    expect(resp!.confidence).toBe(0.9);
  });
});
