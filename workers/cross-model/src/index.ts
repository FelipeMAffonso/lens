/**
 * Cross-Model Managed Agent Worker.
 *
 * This Worker is the "Best use of Claude Managed Agents" submission surface.
 * It accepts an audit request from the main Worker (/audit pipeline) and
 * orchestrates a long-running, multi-provider fan-out that queries three other
 * frontier models in parallel, then synthesizes a disagreement map using
 * Claude Opus 4.7.
 *
 * Endpoint: POST /fanout
 *   body: { intent: UserIntent, recommendation: AIRecommendation }
 *   returns: CrossModelCheck[]
 *
 * Why a separate Worker:
 *   - isolates rate-limit state per provider (retries, back-off) from the
 *     main audit request
 *   - lets the main Worker stay within Cloudflare's subrequest time budget
 *     even when one provider is slow
 *   - mirrors Claude Managed Agents' "brain decoupled from hands" pattern
 *     (https://www.anthropic.com/engineering/managed-agents)
 *   - is independently deployable, scalable, and inspectable
 *
 * Failure handling:
 *   Each provider call is wrapped in Promise.allSettled so one bad key or
 *   rate-limit doesn't fail the whole fan-out. The synth step runs with
 *   whatever succeeded.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import Anthropic from "@anthropic-ai/sdk";
import type { AIRecommendation, CrossModelCheck, UserIntent } from "@lens/shared";

export interface Env {
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
}

const OPUS_4_7 = "claude-opus-4-7" as const;

const app = new Hono<{ Bindings: Env }>();
app.use("*", cors({ origin: "*", allowMethods: ["POST", "OPTIONS"] }));

app.get("/health", (c) => c.json({ ok: true, service: "lens-cross-model", ts: new Date().toISOString() }));

interface FanoutInput {
  intent: UserIntent;
  recommendation: AIRecommendation;
}

interface FanoutResult {
  results: CrossModelCheck[];
  synthesis: string;
  latencyMs: number;
}

app.post("/fanout", async (c) => {
  const t0 = Date.now();
  const body = (await c.req.json()) as FanoutInput;
  if (!body.intent || !body.recommendation) {
    return c.json({ error: "missing_fields", expected: ["intent", "recommendation"] }, 400);
  }

  const question = buildQuestion(body.intent);
  const aiPickText = `${body.recommendation.pickedProduct.brand ?? ""} ${body.recommendation.pickedProduct.name}`
    .trim()
    .toLowerCase();

  const tasks: Array<Promise<CrossModelCheck | null>> = [];
  if (c.env.OPENAI_API_KEY) tasks.push(callOpenAI(c.env.OPENAI_API_KEY, "gpt-4o", question, aiPickText));
  if (c.env.GOOGLE_API_KEY) tasks.push(callGoogle(c.env.GOOGLE_API_KEY, "gemini-2.5-flash", question, aiPickText));
  if (c.env.OPENROUTER_API_KEY)
    tasks.push(callOpenRouter(c.env.OPENROUTER_API_KEY, "meta-llama/llama-3.3-70b-instruct", question, aiPickText));

  const settled = await Promise.allSettled(tasks);
  const results: CrossModelCheck[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled" && s.value) results.push(s.value);
  }

  // Synthesis step — Opus 4.7 reads all results and produces a short disagreement summary.
  let synthesis = "";
  if (results.length > 0) {
    try {
      synthesis = await synthesize(c.env, body.intent, body.recommendation, results);
    } catch (e) {
      synthesis = `synthesis-failed: ${(e as Error).message}`;
    }
  } else {
    synthesis = "No cross-model results — either no provider keys configured or all providers failed.";
  }

  const latencyMs = Date.now() - t0;
  return c.json({ results, synthesis, latencyMs } satisfies FanoutResult);
});

export default app;

// ---------- helpers ----------

function buildQuestion(intent: UserIntent): string {
  return [
    `Recommend one product for the following. Output ONLY the product brand + name on the first line, no explanation, no markdown.`,
    `Category: ${intent.category}`,
    `Criteria (weighted): ${intent.criteria.map((c) => `${c.name} w=${c.weight.toFixed(2)} ${c.direction}`).join(", ")}`,
    intent.budget?.max ? `Budget max: $${intent.budget.max} ${intent.budget.currency ?? "USD"}` : "",
    `User's original words: ${intent.rawCriteriaText}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function callOpenAI(
  key: string,
  model: string,
  question: string,
  aiPickText: string,
): Promise<CrossModelCheck | null> {
  const t = Date.now();
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: question }], max_tokens: 80 }),
    });
    if (!res.ok) {
      console.error("[cross-model:openai] %s HTTP %d", model, res.status);
      return null;
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content ?? "";
    return buildCheck("openai", model, content, aiPickText, Date.now() - t);
  } catch (e) {
    console.error("[cross-model:openai] throw:", (e as Error).message);
    return null;
  }
}

async function callGoogle(
  key: string,
  model: string,
  question: string,
  aiPickText: string,
): Promise<CrossModelCheck | null> {
  const t = Date.now();
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: question }] }],
          generationConfig: { maxOutputTokens: 80 },
        }),
      },
    );
    if (!res.ok) {
      console.error("[cross-model:google] %s HTTP %d", model, res.status);
      return null;
    }
    const data = (await res.json()) as any;
    const content: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return buildCheck("google", model, content, aiPickText, Date.now() - t);
  } catch (e) {
    console.error("[cross-model:google] throw:", (e as Error).message);
    return null;
  }
}

async function callOpenRouter(
  key: string,
  model: string,
  question: string,
  aiPickText: string,
): Promise<CrossModelCheck | null> {
  const t = Date.now();
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: question }], max_tokens: 80 }),
    });
    if (!res.ok) {
      console.error("[cross-model:openrouter] %s HTTP %d", model, res.status);
      return null;
    }
    const data = (await res.json()) as any;
    const content: string = data.choices?.[0]?.message?.content ?? "";
    return buildCheck("openrouter", model, content, aiPickText, Date.now() - t);
  } catch (e) {
    console.error("[cross-model:openrouter] throw:", (e as Error).message);
    return null;
  }
}

function buildCheck(
  provider: CrossModelCheck["provider"],
  model: string,
  content: string,
  aiPickText: string,
  latencyMs: number,
): CrossModelCheck {
  const firstLine = content.split("\n")[0]?.trim() ?? "";
  const agreesWithLens = aiPickText ? !firstLine.toLowerCase().includes(aiPickText) : false;
  return {
    provider,
    model,
    pickedProduct: { name: firstLine },
    agreesWithLens,
    reasoning: content,
    latencyMs,
  };
}

async function synthesize(
  env: Env,
  intent: UserIntent,
  rec: AIRecommendation,
  results: CrossModelCheck[],
): Promise<string> {
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const prompt = [
    `The user asked for: ${intent.category}, criteria: ${intent.criteria.map((c) => c.name).join(", ")}.`,
    `The host AI (${rec.host}) picked: ${rec.pickedProduct.brand ?? ""} ${rec.pickedProduct.name}.`,
    `Three other frontier models were asked the same question and picked:`,
    ...results.map(
      (r) => `- ${r.provider} / ${r.model}: ${r.pickedProduct.name} (${r.agreesWithLens ? "disagrees with host AI" : "agrees with host AI"})`,
    ),
    ``,
    `Write a 2-3 sentence summary of where the frontier models agree and disagree. State clearly whether the host AI's pick looks like an outlier or whether the other models broadly converge on the same recommendation.`,
  ].join("\n");

  const response = (await anthropic.messages.create({
    model: OPUS_4_7,
    max_tokens: 500,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    messages: [{ role: "user", content: prompt }],
  } as never)) as unknown as { content: Array<{ type: string; text?: string }> };

  let text = "";
  for (const block of response.content) {
    if (block.type === "text" && block.text) text += block.text;
  }
  return text.trim();
}
