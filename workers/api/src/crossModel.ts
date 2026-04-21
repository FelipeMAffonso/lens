import type { AIRecommendation, CrossModelCheck, UserIntent } from "@lens/shared";
import type { Env } from "./index.js";

/**
 * Run the same shopping question through three other frontier models in parallel and
 * report agreement/disagreement with the AI's original pick.
 *
 * Day 1: direct HTTP fan-out from this Worker (OpenAI, Google, OpenRouter).
 * Day 3: swap for a Claude Managed Agent hand-off — CROSS_MODEL_AGENT_URL routes here.
 */
export async function runCrossModelCheck(
  intent: UserIntent,
  rec: AIRecommendation,
  env: Env,
): Promise<CrossModelCheck[]> {
  // If a Managed Agent endpoint is configured, delegate.
  if (env.CROSS_MODEL_AGENT_URL) {
    const res = await fetch(env.CROSS_MODEL_AGENT_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent, recommendation: rec }),
    });
    if (res.ok) return (await res.json()) as CrossModelCheck[];
  }

  const question = [
    `Recommend one product for the following: ${intent.rawCriteriaText}`,
    `Budget: ${intent.budget?.max ?? "not specified"} ${intent.budget?.currency ?? "USD"}`,
    `Return only the product brand + name on the first line, no explanation.`,
  ].join("\n");

  const tasks: Array<Promise<CrossModelCheck | null>> = [];
  if (env.OPENAI_API_KEY) tasks.push(callOpenAI(env.OPENAI_API_KEY, "gpt-5", question, rec));
  if (env.GOOGLE_API_KEY) tasks.push(callGoogle(env.GOOGLE_API_KEY, "gemini-3-pro", question, rec));
  if (env.OPENROUTER_API_KEY) tasks.push(callOpenRouter(env.OPENROUTER_API_KEY, "kimi-k2", question, rec));

  const results = await Promise.all(tasks);
  return results.filter((r): r is CrossModelCheck => r !== null);
}

async function callOpenAI(
  key: string,
  model: string,
  question: string,
  rec: AIRecommendation,
): Promise<CrossModelCheck | null> {
  const t = Date.now();
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: question }],
        max_tokens: 80,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const content: string = data.choices?.[0]?.message?.content ?? "";
    return buildCheck("openai", model, content, rec, Date.now() - t);
  } catch {
    return null;
  }
}

async function callGoogle(
  key: string,
  model: string,
  question: string,
  rec: AIRecommendation,
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
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const content: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return buildCheck("google", model, content, rec, Date.now() - t);
  } catch {
    return null;
  }
}

async function callOpenRouter(
  key: string,
  model: string,
  question: string,
  rec: AIRecommendation,
): Promise<CrossModelCheck | null> {
  const t = Date.now();
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: question }],
        max_tokens: 80,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const content: string = data.choices?.[0]?.message?.content ?? "";
    return buildCheck("openrouter", model, content, rec, Date.now() - t);
  } catch {
    return null;
  }
}

function buildCheck(
  provider: CrossModelCheck["provider"],
  model: string,
  content: string,
  rec: AIRecommendation,
  latencyMs: number,
): CrossModelCheck {
  const firstLine = content.split("\n")[0]?.trim() ?? "";
  const aiPickText = `${rec.pickedProduct.brand ?? ""} ${rec.pickedProduct.name}`.trim().toLowerCase();
  const agreesWithLens = !firstLine.toLowerCase().includes(aiPickText);
  return {
    provider,
    model,
    pickedProduct: { name: firstLine },
    agreesWithLens,
    reasoning: content,
    latencyMs,
  };
}
