// S1-W8 — clarifying-question generator.
//
// Primary path: Opus 4.7 reads the intent + user prompt + low-confidence
// criterion names, returns 2-4 binary trade-off questions with deterministic
// weight shifts per option. When Opus is unavailable or returns malformed
// JSON, we fall back to a canonical question set keyed by category + target
// criterion. Canonical Qs are hand-designed to cover 80% of real shopping
// queries without an LLM round-trip.

import type { UserIntent } from "@lens/shared";
import type { Env } from "../index.js";
import { OPUS_4_7, client } from "../anthropic.js";
import type { ClarifyQuestion } from "./types.js";
import { MAX_QUESTIONS, MIN_QUESTIONS } from "./types.js";

const SYSTEM = `You are a preference-elicitation agent. Given a shopping intent with
low-confidence criteria, produce binary trade-off questions that disambiguate them.

Every question MUST:
- Target exactly one criterion the user is ambiguous about.
- Pose a CONCRETE choice ("(A) 8 hr battery + 3 lb / (B) 12 hr battery + 4.5 lb"), never abstract ("do you want more battery").
- Have two options the user would recognize from real product shopping.
- Supply deterministic weight shifts that wire into downstream criteria.
- Reference the user's own words when possible.

Return ONLY JSON:
{
  "questions": [
    {
      "targetCriterion": "<criterion name from the intent>",
      "prompt": "<full question sentence>",
      "optionA": { "label": "<concrete option A>", "impliedWeightShift": { "<criterion>": <delta>, ... } },
      "optionB": { "label": "<concrete option B>", "impliedWeightShift": { "<criterion>": <delta>, ... } }
    }
  ]
}

No prose outside the JSON. No markdown fences. 2-4 questions only.`;

export async function generateQuestions(
  intent: UserIntent,
  userPrompt: string | undefined,
  targets: string[],
  env: Env,
): Promise<{ questions: ClarifyQuestion[]; source: "opus" | "fallback" }> {
  const clean = targets.filter((t) => t && t.length > 0);
  if (clean.length === 0) return { questions: [], source: "fallback" };

  const hasAnthropicKey = typeof env.ANTHROPIC_API_KEY === "string" && env.ANTHROPIC_API_KEY.length > 0;
  if (!hasAnthropicKey) {
    return { questions: fallbackQuestions(intent, clean).slice(0, MAX_QUESTIONS), source: "fallback" };
  }

  try {
    const anthropic = client(env);
    const userText = [
      `CATEGORY: ${intent.category}`,
      `USER PROMPT: ${userPrompt ?? intent.rawCriteriaText ?? "(not provided)"}`,
      `CRITERIA (with confidence):`,
      ...intent.criteria.map((c) => `  - ${c.name} (weight ${c.weight.toFixed(2)}, confidence ${(c.confidence ?? 1).toFixed(2)})`),
      ``,
      `LOW-CONFIDENCE CRITERIA TO DISAMBIGUATE: ${clean.join(", ")}`,
      ``,
      `Generate ${MIN_QUESTIONS}-${MAX_QUESTIONS} binary trade-off questions.`,
    ].join("\n");

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), 15_000);
    let res: { content: Array<{ type: string; text?: string }> };
    try {
      res = (await anthropic.messages.create({
        model: OPUS_4_7,
        max_tokens: 3000,
        system: SYSTEM,
        messages: [{ role: "user", content: userText }],
      } as never, { signal: controller.signal } as never)) as unknown as { content: Array<{ type: string; text?: string }> };
    } finally {
      clearTimeout(timeoutHandle);
    }

    let text = "";
    for (const block of res.content) {
      if (block.type === "text" && block.text) text += block.text;
    }
    const parsed = parseOpusResponse(text);
    if (parsed.length >= MIN_QUESTIONS) {
      return { questions: parsed.slice(0, MAX_QUESTIONS), source: "opus" };
    }
    console.warn("[clarify] Opus returned %d questions (< MIN); falling back", parsed.length);
  } catch (err) {
    console.warn("[clarify] Opus failed:", (err as Error).message);
  }

  return { questions: fallbackQuestions(intent, clean).slice(0, MAX_QUESTIONS), source: "fallback" };
}

function parseOpusResponse(raw: string): ClarifyQuestion[] {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced && fenced[1] ? fenced[1] : raw).trim();
  let parsed: { questions?: Array<Partial<ClarifyQuestion>> };
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }
  if (!parsed.questions || !Array.isArray(parsed.questions)) return [];
  const out: ClarifyQuestion[] = [];
  for (let i = 0; i < parsed.questions.length; i++) {
    const q = parsed.questions[i];
    if (!q || typeof q !== "object") continue;
    const targetCriterion = typeof q.targetCriterion === "string" ? q.targetCriterion : "";
    const prompt = typeof q.prompt === "string" ? q.prompt : "";
    const optA = q.optionA;
    const optB = q.optionB;
    if (!targetCriterion || !prompt || !optA || !optB) continue;
    if (typeof optA.label !== "string" || typeof optB.label !== "string") continue;
    const shiftA = sanitizeShift(optA.impliedWeightShift);
    const shiftB = sanitizeShift(optB.impliedWeightShift);
    out.push({
      id: `clq_${i}_${Math.random().toString(36).slice(2, 10)}`,
      targetCriterion,
      prompt,
      optionA: { label: optA.label, impliedWeightShift: shiftA },
      optionB: { label: optB.label, impliedWeightShift: shiftB },
    });
  }
  return out;
}

function sanitizeShift(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  // Judge P1-8: cap shift at ±0.3. A single answer should not pull a weight
  // more than 0.3 before renormalize — matches the block's own example shifts
  // (0.15 / 0.10 / 0.05) and prevents overshoot.
  // Judge P0-3: cap keys per shift to 8 so a crafted answer can't create 5000
  // criteria via one POST.
  let count = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (count >= 8) break;
    if (typeof v === "number" && Number.isFinite(v)) {
      out[k] = Math.max(-0.3, Math.min(0.3, v));
      count++;
    } else if (typeof v === "string") {
      const n = Number.parseFloat(v);
      if (Number.isFinite(n)) { out[k] = Math.max(-0.3, Math.min(0.3, n)); count++; }
    }
  }
  return out;
}

// Fallback question bank — hand-designed for the top-20 hackathon categories.
// When Opus is unreachable, these guarantee SOMETHING actionable shows up.
function fallbackQuestions(intent: UserIntent, targets: string[]): ClarifyQuestion[] {
  const out: ClarifyQuestion[] = [];
  for (const target of targets.slice(0, MAX_QUESTIONS)) {
    const t = target.toLowerCase();
    if (t.includes("speed") || t.includes("fast") || t.includes("performance")) {
      out.push({
        id: `fbk_${out.length}_${target.replace(/\s+/g, "_")}`,
        targetCriterion: target,
        prompt: `When you said "${target}", which did you mean?`,
        optionA: {
          label: "Everyday responsiveness — boot, app launch, web, light multitasking",
          impliedWeightShift: { responsiveness: 0.15, throughput: -0.05 },
        },
        optionB: {
          label: "Heavy-task throughput — video rendering, compile, simulation",
          impliedWeightShift: { throughput: 0.15, responsiveness: -0.05 },
        },
      });
      continue;
    }
    if (t.includes("portable") || t.includes("light") || t.includes("compact")) {
      out.push({
        id: `fbk_${out.length}_${target.replace(/\s+/g, "_")}`,
        targetCriterion: target,
        prompt: `How much does "${target}" weigh against battery life?`,
        optionA: {
          label: "Prioritize size + weight (under 3 lb), accept 6-8 hr battery",
          impliedWeightShift: { weight: 0.12, battery_life: -0.05 },
        },
        optionB: {
          label: "Prioritize long battery (12+ hr), accept 4-5 lb chassis",
          impliedWeightShift: { battery_life: 0.15, weight: -0.05 },
        },
      });
      continue;
    }
    if (t.includes("quality") || t.includes("build") || t.includes("durable")) {
      out.push({
        id: `fbk_${out.length}_${target.replace(/\s+/g, "_")}`,
        targetCriterion: target,
        prompt: `For "${target}", does premium material matter more than price?`,
        optionA: {
          label: "Full metal build, premium feel — $100+ more",
          impliedWeightShift: { build_quality: 0.15, price: -0.10 },
        },
        optionB: {
          label: "Mostly plastic with metal accents, saves $100",
          impliedWeightShift: { price: 0.15, build_quality: -0.10 },
        },
      });
      continue;
    }
    if (t.includes("sound") || t.includes("audio") || t.includes("noise")) {
      out.push({
        id: `fbk_${out.length}_${target.replace(/\s+/g, "_")}`,
        targetCriterion: target,
        prompt: `For "${target}", which matters more?`,
        optionA: {
          label: "Top noise cancellation (open office / flights)",
          impliedWeightShift: { noise_cancellation: 0.15, audio_quality: -0.05 },
        },
        optionB: {
          label: "Best raw audio fidelity (at-home, detail listening)",
          impliedWeightShift: { audio_quality: 0.15, noise_cancellation: -0.05 },
        },
      });
      continue;
    }
    // Generic fallback
    out.push({
      id: `fbk_${out.length}_${target.replace(/\s+/g, "_")}`,
      targetCriterion: target,
      prompt: `How important is "${target}" compared to price?`,
      optionA: {
        label: `Willing to pay 20% more for better "${target}"`,
        impliedWeightShift: { [target]: 0.12, price: -0.08 },
      },
      optionB: {
        label: `Prefer the cheaper option, trade off some "${target}"`,
        impliedWeightShift: { price: 0.12, [target]: -0.08 },
      },
    });
  }
  return out;
}
