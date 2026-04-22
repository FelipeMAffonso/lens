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
  // If the Managed Agent endpoint is configured, delegate there.
  // This is the hand-off to workers/cross-model/src/index.ts — the "Best use
  // of Claude Managed Agents" submission surface. The agent Worker owns the
  // rate-limit state per provider and runs the Opus 4.7 synthesis step.
  if (env.CROSS_MODEL_AGENT_URL) {
    try {
      const res = await fetch(env.CROSS_MODEL_AGENT_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intent, recommendation: rec }),
      });
      if (res.ok) {
        const data = (await res.json()) as { results?: CrossModelCheck[]; synthesis?: string };
        console.log("[crossModel:managed-agent] results=%d synthesis=%s", data.results?.length ?? 0, (data.synthesis ?? "").slice(0, 80));
        return data.results ?? [];
      }
      console.error("[crossModel:managed-agent] HTTP %d", res.status);
    } catch (e) {
      console.error("[crossModel:managed-agent] throw:", (e as Error).message);
    }
    // fall through to inline fan-out
  }

  const question = [
    `Recommend one product for the following: ${intent.rawCriteriaText}`,
    `Budget: ${intent.budget?.max ?? "not specified"} ${intent.budget?.currency ?? "USD"}`,
    `Return only the product brand + name on the first line, no explanation.`,
  ].join("\n");

  const tasks: Array<Promise<CrossModelCheck | null>> = [];
  // Use stable widely-available models. Switch to newer flagship IDs once confirmed.
  if (env.OPENAI_API_KEY) tasks.push(callOpenAI(env.OPENAI_API_KEY, "gpt-4o", question, rec));
  if (env.GOOGLE_API_KEY) tasks.push(callGoogle(env.GOOGLE_API_KEY, "gemini-2.5-flash", question, rec));
  if (env.OPENROUTER_API_KEY)
    tasks.push(callOpenRouter(env.OPENROUTER_API_KEY, "meta-llama/llama-3.3-70b-instruct", question, rec));

  const results = await Promise.all(tasks);
  const picked = results.filter((r): r is CrossModelCheck => r !== null);
  console.log("[crossModel] dispatched=%d succeeded=%d", tasks.length, picked.length);
  return picked;
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
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[crossModel] %s/%s HTTP %d: %s", model, res.status, res.status, errText.slice(0, 200));
      return null;
    }
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
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[crossModel] %s/%s HTTP %d: %s", model, res.status, res.status, errText.slice(0, 200));
      return null;
    }
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
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[crossModel] %s/%s HTTP %d: %s", model, res.status, res.status, errText.slice(0, 200));
      return null;
    }
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
